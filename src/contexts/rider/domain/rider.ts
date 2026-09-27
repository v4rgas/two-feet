import type {
  FootAttached,
  FootDetached,
  FootDetachReason,
  FootId,
  RiderBailed,
} from "../../../shared";
import { FOOT_IDS, Quat, Transform, Vec3 } from "../../../shared";
import type { RiderConfig } from "../rider.config";
import { DeckPosition } from "./deck-position";
import { clampToDeck, deckTopPointLocal, isOnDeck } from "./deck-surface";
import { Foot } from "./foot";
import type { BoardKinematics, DeckGeometry, RiderControls } from "./foot-force-model";
import { feetPressure, targetDeckPosition } from "./foot-placement";
import type { RiderState } from "./rider-state";

type WithoutMeta<E> = Omit<E, "tick" | "timeS">;

/**
 * What changed in the aggregate during one update: the payload of a domain event minus
 * `tick`/`timeS`, which the application adds from the snapshot it is processing.
 */
export type RiderChange =
  | WithoutMeta<FootAttached>
  | WithoutMeta<FootDetached>
  | WithoutMeta<RiderBailed>;

/** Neutral controls (both sticks centred, no push). */
export const NEUTRAL_CONTROLS: RiderControls = Object.freeze({
  front: Object.freeze({ foot: "front", stick: { x: 0, y: 0 }, stickVelocityPerS: { x: 0, y: 0 } }),
  back: Object.freeze({ foot: "back", stick: { x: 0, y: 0 }, stickVelocityPerS: { x: 0, y: 0 } }),
  push: false,
});

/** Min horizontal length of the board's +X to trust it as a heading. */
const MIN_HEADING_PROJECTION = 0.2;

/**
 * `Rider` aggregate (REQUIREMENTS §1.3): both feet, a kinematic torso and the bail state.
 *
 * - An attached foot slides toward its stick target (clamped to the deck, at most
 *   `maxSlideSpeedMps`). Its world position is the grip-tape point under it.
 * - It detaches when, in the air, its target leaves the deck (`leftDeck`), when board
 *   spin moves the deck under it faster than `detachRelativeSpeedMps` (`tooFast`), or
 *   when the board tilts / flies away from the rider (`separated`).
 * - An airborne foot follows the torso: it hovers `airLiftM` above where its target spot
 *   would be on a level deck under the rider. It reattaches when its target is on the
 *   deck, the board is upright enough and its deck spot is within `catchRadiusM`.
 * - Bail: both feet off while the board is on its wheels for too long, a landing that is
 *   upside down or too tilted (`land`), or the board resting upside down.
 * - Once bailed, no foot attaches or detaches until `reset`.
 */
export class Rider {
  private readonly feet: Record<FootId, Foot>;
  private torsoPositionM: Vec3 = Vec3.ZERO;
  private torsoVelocityMps: Vec3 = Vec3.ZERO;
  private headingRad = 0;
  private bailed = false;
  private bothFeetOffOnWheelsS = 0;
  private upsideDownRestingS = 0;
  private cachedState: RiderState | null = null;

  constructor(
    private readonly deck: DeckGeometry,
    private readonly config: RiderConfig,
    board: BoardKinematics,
  ) {
    this.feet = {
      front: new Foot("front", DeckPosition.create(0, 0), Vec3.ZERO),
      back: new Foot("back", DeckPosition.create(0, 0), Vec3.ZERO),
    };
    this.reset(board);
  }

  get state(): RiderState {
    this.cachedState ??= Object.freeze({
      front: this.feet.front.toState(),
      back: this.feet.back.toState(),
      torsoPositionWorldM: this.torsoPositionM,
      bailed: this.bailed,
    });
    return this.cachedState;
  }

  /** Loop step 5: moves the feet, attaches/detaches them and checks for a bail. */
  update(controls: RiderControls, board: BoardKinematics, dtS: number): readonly RiderChange[] {
    this.cachedState = null;
    this.updateHeading(board);
    this.updateTorso(board, dtS);
    const changes: RiderChange[] = [];
    for (const id of FOOT_IDS) {
      const foot = this.feet[id];
      const target = targetDeckPosition(id, controls[id].stick, this.config.feet);
      foot.tick(dtS);
      if (foot.isAttached) this.updateAttached(foot, target, board, dtS, changes);
      else this.updateAirborne(foot, target, board, changes);
    }
    const pressure = feetPressure(
      controls,
      { front: this.feet.front.deckPosition, back: this.feet.back.deckPosition },
      this.deck,
      this.config,
    );
    for (const id of FOOT_IDS) this.feet[id].setPressure(pressure[id]);
    if (!this.bailed) this.checkBail(board, dtS, changes);
    return changes;
  }

  /** Called when the board lands (`BoardLanded.upDot`): bails on a bad landing. */
  land(upDot: number): readonly RiderChange[] {
    if (this.bailed) return [];
    if (upDot < 0) return [this.bail("upsideDown")];
    const tiltRad = Math.acos(Math.max(-1, Math.min(1, upDot)));
    if (tiltRad > this.config.bail.maxLandingTiltRad) return [this.bail("offAngle")];
    return [];
  }

  /** Both feet back on the deck at their rest positions, torso above the board, not bailed. */
  reset(board: BoardKinematics): void {
    this.cachedState = null;
    this.bailed = false;
    this.bothFeetOffOnWheelsS = 0;
    this.upsideDownRestingS = 0;
    this.updateHeading(board);
    this.torsoPositionM = this.torsoTarget(board);
    this.torsoVelocityMps = board.linearVelocityMps;
    const { feet } = this.config;
    const rest: Record<FootId, DeckPosition> = {
      front: DeckPosition.create(feet.frontRestAlongM, feet.restAcrossM),
      back: DeckPosition.create(feet.backRestAlongM, feet.restAcrossM),
    };
    for (const id of FOOT_IDS) {
      const foot = this.feet[id];
      foot.attach(rest[id]);
      foot.setPressure(0);
      foot.placeInWorld(this.deckPointWorld(board, rest[id]));
    }
  }

  // ── feet ──────────────────────────────────────────────────────────────────

  private updateAttached(
    foot: Foot,
    target: DeckPosition,
    board: BoardKinematics,
    dtS: number,
    changes: RiderChange[],
  ): void {
    const next = moveToward(
      foot.deckPosition,
      clampToDeck(this.deck, target),
      this.config.feet.maxSlideSpeedMps * dtS,
    );
    foot.moveTo(next);
    const worldM = this.deckPointWorld(board, next);
    const reason = this.bailed ? null : this.detachReason(target, worldM, board);
    if (reason === null) {
      foot.placeInWorld(worldM);
      return;
    }
    foot.detach();
    foot.moveTo(target);
    foot.placeInWorld(this.airAnchorWorld(target));
    changes.push({ type: "FootDetached", foot: foot.id, reason });
  }

  private detachReason(
    target: DeckPosition,
    footWorldM: Vec3,
    board: BoardKinematics,
  ): FootDetachReason | null {
    const { feet } = this.config;
    if (!board.grounded && !isOnDeck(this.deck, target)) return "leftDeck";
    if (spinSpeedAt(board, footWorldM) > feet.detachRelativeSpeedMps) return "tooFast";
    if (!board.grounded) {
      if (tiltRad(board) > feet.separateTiltRad) return "separated";
      const riderFootM = this.airAnchorWorld(target, 0);
      if (Vec3.distance(riderFootM, footWorldM) > feet.separateDistanceM) return "separated";
    }
    return null;
  }

  private updateAirborne(
    foot: Foot,
    target: DeckPosition,
    board: BoardKinematics,
    changes: RiderChange[],
  ): void {
    foot.moveTo(target);
    const anchorM = this.airAnchorWorld(target);
    foot.placeInWorld(anchorM);
    if (this.bailed || !this.canReattach(foot, target, anchorM, board)) return;
    foot.attach(target);
    foot.placeInWorld(this.deckPointWorld(board, target));
    changes.push({
      type: "FootAttached",
      foot: foot.id,
      deckPosition: { alongM: target.alongM, acrossM: target.acrossM },
    });
  }

  private canReattach(
    foot: Foot,
    target: DeckPosition,
    anchorM: Vec3,
    board: BoardKinematics,
  ): boolean {
    const { feet } = this.config;
    if (foot.detachedForS < feet.reattachMinDetachedS) return false;
    if (!isOnDeck(this.deck, target)) return false;
    if (tiltRad(board) > feet.catchMaxTiltRad) return false;
    const spotM = this.deckPointWorld(board, target);
    if (Vec3.distance(anchorM, spotM) > feet.catchRadiusM) return false;
    return spinSpeedAt(board, spotM) <= feet.detachRelativeSpeedMps;
  }

  // ── bail ──────────────────────────────────────────────────────────────────

  private checkBail(board: BoardKinematics, dtS: number, changes: RiderChange[]): void {
    const bothOff = !this.feet.front.isAttached && !this.feet.back.isAttached;
    this.bothFeetOffOnWheelsS = board.grounded && bothOff ? this.bothFeetOffOnWheelsS + dtS : 0;
    const touching = board.contacts.deck || board.contacts.tail || board.contacts.nose;
    const upsideDown = !board.grounded && touching && boardUp(board).y < 0;
    this.upsideDownRestingS = upsideDown ? this.upsideDownRestingS + dtS : 0;

    const { bail } = this.config;
    if (this.bothFeetOffOnWheelsS > bail.feetDetachedAfterLandingS) {
      changes.push(this.bail("feetDetached"));
    } else if (this.upsideDownRestingS > bail.upsideDownRestS) {
      changes.push(this.bail("upsideDown"));
    }
  }

  private bail(reason: RiderBailed["reason"]): RiderChange {
    this.bailed = true;
    this.cachedState = null;
    return { type: "RiderBailed", reason };
  }

  // ── torso / rider frame ───────────────────────────────────────────────────

  private torsoTarget(board: BoardKinematics): Vec3 {
    return Vec3.add(board.transform.positionM, Vec3.create(0, this.config.torso.heightM, 0));
  }

  /**
   * Spring-damper toward "above the board", with velocity feed-forward so a board
   * rolling at constant speed is followed without lag; only accelerations (a pop, a
   * landing) make the torso lag behind.
   */
  private updateTorso(board: BoardKinematics, dtS: number): void {
    const { followOmegaRadps: w, followDampingRatio: zeta } = this.config.torso;
    const toTarget = Vec3.sub(this.torsoTarget(board), this.torsoPositionM);
    const velocityError = Vec3.sub(board.linearVelocityMps, this.torsoVelocityMps);
    const accel = Vec3.add(Vec3.scale(toTarget, w * w), Vec3.scale(velocityError, 2 * zeta * w));
    this.torsoVelocityMps = Vec3.add(this.torsoVelocityMps, Vec3.scale(accel, dtS));
    this.torsoPositionM = Vec3.add(this.torsoPositionM, Vec3.scale(this.torsoVelocityMps, dtS));
  }

  /** Heading = yaw of the board's +X projected on the ground; kept while it points up/down. */
  private updateHeading(board: BoardKinematics): void {
    const forward = Transform.toWorldDirection(board.transform, Vec3.UNIT_X);
    if (Math.hypot(forward.x, forward.z) < MIN_HEADING_PROJECTION) return;
    this.headingRad = Math.atan2(-forward.z, forward.x);
  }

  /**
   * Where an airborne foot is: under the torso, at its target spot on an imaginary level
   * deck oriented by the heading, lifted by `liftM`.
   */
  private airAnchorWorld(target: DeckPosition, liftM = this.config.feet.airLiftM): Vec3 {
    const local = deckTopPointLocal(this.deck, target.alongM, target.acrossM);
    const offset = Quat.rotate(
      Quat.fromAxisAngle(Vec3.UNIT_Y, this.headingRad),
      Vec3.create(local.x, local.y + liftM, local.z),
    );
    const base = Vec3.sub(this.torsoPositionM, Vec3.create(0, this.config.torso.heightM, 0));
    return Vec3.add(base, offset);
  }

  private deckPointWorld(board: BoardKinematics, p: DeckPosition): Vec3 {
    return Transform.toWorldPoint(
      board.transform,
      deckTopPointLocal(this.deck, p.alongM, p.acrossM),
    );
  }
}

/** Board local +Y in world. */
export function boardUp(board: BoardKinematics): Vec3 {
  return Transform.toWorldDirection(board.transform, Vec3.UNIT_Y);
}

/** Angle between the board's up axis and world up, rad. */
export function tiltRad(board: BoardKinematics): number {
  return Math.acos(Math.max(-1, Math.min(1, boardUp(board).y)));
}

/**
 * Speed of the deck material at a world point due to board SPIN only, |ω × r|, m/s
 * (r from the board origin, which stands in for the centre of mass).
 */
export function spinSpeedAt(board: BoardKinematics, pointWorldM: Vec3): number {
  const r = Vec3.sub(pointWorldM, board.transform.positionM);
  return Vec3.length(Vec3.cross(board.angularVelocityRadps, r));
}

function moveToward(from: DeckPosition, to: DeckPosition, maxStepM: number): DeckPosition {
  const dAlong = to.alongM - from.alongM;
  const dAcross = to.acrossM - from.acrossM;
  const distance = Math.hypot(dAlong, dAcross);
  if (distance <= maxStepM || distance === 0) return to;
  const k = maxStepM / distance;
  return DeckPosition.create(from.alongM + dAlong * k, from.acrossM + dAcross * k);
}
