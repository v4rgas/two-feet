import type {
  FootAttached,
  FootDetached,
  FootDetachReason,
  FootId,
  RiderBailed,
} from "../../../shared";
import { FOOT_IDS, Quat, Vec3 } from "../../../shared";
import type { RiderConfig } from "../rider.config";
import {
  axisErrorRad,
  boardForward,
  boardHeadingRad,
  boardUp,
  deckPointWorld,
  spotUnder,
  supportNormal,
  wrapPi,
} from "./board-geometry";
import { DeckPosition } from "./deck-position";
import { clampToDeck, deckTopPointLocal, isOnDeck } from "./deck-surface";
import { Foot, type FootMotionLimits } from "./foot";
import type { BoardKinematics, DeckGeometry, RiderControls } from "./foot-force-model";
import { feetPressure, targetDeckPosition } from "./foot-placement";
import type { RiderState } from "./rider-state";

export { boardUp, tiltRad } from "./board-geometry";

type WithoutMeta<E> = Omit<E, "tick" | "timeS">;

/**
 * What changed in the aggregate during one update: the payload of a domain event minus
 * `tick`/`timeS`, which the application adds from the snapshot it is processing.
 */
export type RiderChange =
  | WithoutMeta<FootAttached>
  | WithoutMeta<FootDetached>
  | WithoutMeta<RiderBailed>;

/** Neutral controls (both sticks centred, feet-down key up). */
export const NEUTRAL_CONTROLS: RiderControls = Object.freeze({
  front: Object.freeze({ foot: "front", stick: { x: 0, y: 0 }, stickVelocityPerS: { x: 0, y: 0 } }),
  back: Object.freeze({ foot: "back", stick: { x: 0, y: 0 }, stickVelocityPerS: { x: 0, y: 0 } }),
  feetDown: false,
  stance: "regular",
});

/**
 * `Rider` aggregate (REQUIREMENTS §1.3, MECHANICS.md): both feet, the torso, the rider
 * frame and the bail state.
 *
 * - The RIDER FRAME is the torso position plus a yaw-only heading, always upright. The
 *   heading follows the board's long axis (whichever way round is closer) while grounded,
 *   rate limited, and is held in the air, so a shove-it spins the board under still feet.
 * - Feet are KINEMATIC points in the rider frame at their stick targets (an attached foot
 *   slides there at most `maxSlideSpeedMps`; on the ground it stays over the deck). They
 *   never rotate with the board. An attached foot is drawn on the grip tape under it; an
 *   airborne one hovers above the level deck under the torso.
 * - The pop lifts both feet off (`liftFeet`); a catch snaps them back on (`catchFeet`).
 *   An uncaught board that lands roughly level and on its wheels gets its feet back too.
 * - Bail: an uncaught landing that is not level, a caught landing that is badly tilted,
 *   the board upside down (`land`), both feet off on the wheels, or the board resting
 *   upside down.
 */
export class Rider {
  private readonly feet: Record<FootId, Foot>;
  private torsoPositionM: Vec3 = Vec3.ZERO;
  private torsoVelocityMps: Vec3 = Vec3.ZERO;
  private headingRad = 0;
  private windUpRad = 0;
  private bodySpinRateRadps = 0;
  private bailed = false;
  private bothFeetOffOnWheelsS = 0;
  private upsideDownRestingS = 0;
  private cachedState: RiderState | null = null;
  private readonly footLimits: FootMotionLimits;

  constructor(
    private readonly deck: DeckGeometry,
    private readonly config: RiderConfig,
    board: BoardKinematics,
  ) {
    const { maxFootSpeedMps, maxFootAccelMps2, catchReachS } = config.feet;
    // Ease-out time constant: most of a catch gap closes within `catchReachS`.
    this.footLimits = {
      maxSpeedMps: maxFootSpeedMps,
      maxAccelMps2: maxFootAccelMps2,
      easeS: catchReachS / 3,
    };
    this.feet = {
      front: new Foot("front", DeckPosition.create(0, 0)),
      back: new Foot("back", DeckPosition.create(0, 0)),
    };
    this.reset(board);
  }

  get state(): RiderState {
    this.cachedState ??= Object.freeze({
      front: this.feet.front.toState(),
      back: this.feet.back.toState(),
      torsoPositionWorldM: this.torsoPositionM,
      headingRad: this.headingRad,
      windUpRad: this.windUpRad,
      bodySpinRateRadps: this.bodySpinRateRadps,
      bailed: this.bailed,
    });
    return this.cachedState;
  }

  /**
   * The pop: the rider jumps and both feet leave the deck. The stored wind-up becomes the
   * initial body spin (`windUpSpinRadps` × the wind-up fraction).
   */
  liftFeet(): readonly RiderChange[] {
    const { windUpMaxRad, windUpSpinRadps } = this.config.tricks;
    this.bodySpinRateRadps = (this.windUpRad / windUpMaxRad) * windUpSpinRadps;
    this.windUpRad = 0;
    this.cachedState = null;
    return this.detachAll("jumped");
  }

  /** The catch: both feet snap back onto the deck. */
  catchFeet(board: BoardKinematics): readonly RiderChange[] {
    if (this.bailed) return [];
    const changes: RiderChange[] = [];
    for (const id of FOOT_IDS) {
      const foot = this.feet[id];
      if (foot.isAttached) continue;
      foot.attach();
      // The spot is taken now; the drawn foot eases onto it over `catchReachS`.
      this.placeFoot(foot, board, 0);
      const at = foot.deckPosition;
      changes.push({
        type: "FootAttached",
        foot: id,
        deckPosition: { alongM: at.alongM, acrossM: at.acrossM },
      });
    }
    this.cachedState = null;
    return changes;
  }

  /** Loop step 5: moves the torso and feet and checks for a bail. */
  update(
    controls: RiderControls,
    board: BoardKinematics,
    dtS: number,
    loading = false,
  ): readonly RiderChange[] {
    this.cachedState = null;
    this.updateWindUp(controls, board, loading, dtS);
    this.updateHeading(controls, board, dtS);
    this.updateTorso(board, dtS);
    for (const id of FOOT_IDS) {
      const foot = this.feet[id];
      foot.tick(dtS);
      this.moveHold(foot, targetDeckPosition(id, controls[id].stick, this.config.feet), board, dtS);
      this.placeFoot(foot, board, dtS);
    }
    const pressure = feetPressure(
      controls,
      { front: this.feet.front.deckPosition, back: this.feet.back.deckPosition },
      this.deck,
      this.config,
    );
    for (const id of FOOT_IDS) this.feet[id].setPressure(pressure[id]);
    const changes: RiderChange[] = [];
    if (!this.bailed) this.checkBail(board, dtS, changes);
    return changes;
  }

  /**
   * Called when the board lands, with its up vector dotted with the landing SURFACE's
   * normal (`BoardLanded.surfaceUpDot`, so banks and transitions count as level; world up
   * when unknown). Upside down or sideways to the
   * travel → bail. Caught: bail
   * only if badly tilted. Uncaught: the feet come back if it is roughly level
   * (`landTiltRad`), otherwise bail.
   */
  land(upDot: number, board: BoardKinematics): readonly RiderChange[] {
    if (this.bailed) return [];
    if (upDot < 0) return [this.bail("upsideDown")];
    // Too sideways to roll (neither forward nor fakie along the travel): bail, never a
    // violent redirect by the wheel grip.
    if (this.landsSideways(board)) return [this.bail("offAngle")];
    const tilt = Math.acos(Math.max(-1, Math.min(1, upDot)));
    const caught = this.feet.front.isAttached || this.feet.back.isAttached;
    if (caught) {
      return tilt > this.config.bail.maxLandingTiltRad ? [this.bail("offAngle")] : [];
    }
    if (tilt > this.config.tricks.landTiltRad) return [this.bail("offAngle")];
    return this.catchFeet(board);
  }

  /**
   * MECHANICS.md "Landing": the board must line up with the direction of travel, forward or
   * fakie, within `landYawToleranceRad`. Measured between the board's long axis and its
   * velocity in the plane of the landing surface, so it also holds on banks and
   * transitions (where headings in the horizontal plane mean little). Skipped when slow (no clear travel) and over a grindable
   * obstacle (the M4 boardslide hook).
   */
  private landsSideways(board: BoardKinematics): boolean {
    if (board.contactPoints?.some((c) => c.surface === "grindable") === true) return false;
    // In the plane of the landing surface (the fall into it does not count).
    const n = supportNormal(board);
    const inPlane = (u: Vec3): Vec3 => Vec3.sub(u, Vec3.scale(n, Vec3.dot(u, n)));
    const v = inPlane(board.linearVelocityMps);
    const f = inPlane(boardForward(board));
    const speed = Vec3.length(v);
    if (speed < this.config.torso.headingTravelMinSpeedMps || Vec3.length(f) < 1e-6) return false;
    const along = Math.abs(Vec3.dot(f, v)) / (speed * Vec3.length(f));
    const off = Math.acos(Math.min(1, along));
    return off > this.config.tricks.landYawToleranceRad;
  }

  /** Both feet back on the deck at their rest positions, torso above the board, not bailed. */
  reset(board: BoardKinematics): void {
    this.cachedState = null;
    this.bailed = false;
    this.bothFeetOffOnWheelsS = 0;
    this.upsideDownRestingS = 0;
    this.headingRad = boardHeadingRad(board) ?? 0;
    this.windUpRad = 0;
    this.bodySpinRateRadps = 0;
    this.torsoPositionM = this.torsoTarget(board);
    this.torsoVelocityMps = board.linearVelocityMps;
    for (const id of FOOT_IDS) {
      const foot = this.feet[id];
      foot.attach();
      foot.holdAt(targetDeckPosition(id, { x: 0, y: 0 }, this.config.feet));
      foot.setPressure(0);
      this.placeFoot(foot, board, null);
    }
  }

  // ── feet ──────────────────────────────────────────────────────────────────

  private detachAll(reason: FootDetachReason): readonly RiderChange[] {
    if (this.bailed) return [];
    const changes: RiderChange[] = [];
    for (const id of FOOT_IDS) {
      const foot = this.feet[id];
      if (!foot.isAttached) continue;
      foot.detach();
      changes.push({ type: "FootDetached", foot: id, reason });
    }
    this.cachedState = null;
    return changes;
  }

  /**
   * An attached foot slides toward its target in the rider frame (at most
   * `maxSlideSpeedMps`); while grounded it stays over the deck (leaning does not step
   * off). An airborne foot is simply held at its target.
   */
  private moveHold(foot: Foot, target: DeckPosition, board: BoardKinematics, dtS: number): void {
    if (!foot.isAttached) {
      foot.holdAt(target);
      return;
    }
    const wanted = board.grounded ? clampToDeck(this.deck, target) : target;
    foot.holdAt(moveToward(foot.riderPosition, wanted, this.config.feet.maxSlideSpeedMps * dtS));
  }

  /**
   * The goal: attached, on the grip tape under the rider-frame position (clamped to the
   * deck); airborne, hovering `airLiftM` above that position on a level deck under the
   * torso. The drawn foot follows the goal in the rider frame with limited speed and
   * acceleration (`dtS` = 0: goal only; null: snap, for a reset), so attaching, detaching
   * and sliding never jump.
   */
  private placeFoot(foot: Foot, board: BoardKinematics, dtS: number | null): void {
    const heldM = this.heldWorld(foot.riderPosition, 0);
    const spot = spotUnder(board, heldM);
    let goalWorldM: Vec3;
    if (foot.isAttached && boardUp(board).y > 0) {
      const onDeck = isOnDeck(this.deck, spot) ? spot : clampToDeck(this.deck, spot);
      foot.setSpot(onDeck);
      goalWorldM = deckPointWorld(this.deck, board, onDeck);
    } else {
      foot.setSpot(spot);
      goalWorldM = this.heldWorld(foot.riderPosition, this.config.feet.airLiftM);
    }
    const yaw = Quat.fromAxisAngle(Vec3.UNIT_Y, this.headingRad);
    const base = this.riderBase();
    const goalRiderM = Quat.inverseRotate(yaw, Vec3.sub(goalWorldM, base));
    if (dtS === null) foot.snapDrawn(goalRiderM);
    else foot.followDrawn(goalRiderM, dtS, this.footLimits);
    foot.setWorld(Vec3.add(base, Quat.rotate(yaw, foot.drawnRiderM)));
  }

  /** The rider frame's origin: under the torso at deck height, m (world). */
  private riderBase(): Vec3 {
    return Vec3.sub(this.torsoPositionM, Vec3.create(0, this.config.torso.heightM, 0));
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

  /**
   * The rider heading (yaw only) is never snapped to the board's yaw:
   * - in the air it is held (frozen at takeoff), so shove-its spin under still feet;
   * - on the ground it follows the direction of travel, either way round (riding fakie
   *   does not turn the rider), smoothed and rate limited — so carving turns the rider;
   * - only when slow does it follow the board's long axis (again either way round).
   */
  private updateHeading(controls: RiderControls, board: BoardKinematics, dtS: number): void {
    if (!board.grounded) {
      this.spinBody(controls, dtS);
      return;
    }
    this.bodySpinRateRadps = 0;
    const { headingFollowPerS, headingMaxRateRadps, headingTravelMinSpeedMps } = this.config.torso;
    const v = board.linearVelocityMps;
    const target =
      Math.hypot(v.x, v.z) >= headingTravelMinSpeedMps
        ? Math.atan2(-v.z, v.x)
        : boardHeadingRad(board);
    if (target === null) return;
    const error = axisErrorRad(target - this.headingRad);
    const rate = Math.max(
      -headingMaxRateRadps,
      Math.min(headingMaxRateRadps, error * headingFollowPerS),
    );
    this.headingRad = wrapPi(this.headingRad + rate * dtS);
  }

  /**
   * BODY SPIN in the air (MECHANICS.md "Body spin"): Q / E ease the heading's spin rate
   * toward ±`bodySpinRateRadps` (at most `bodySpinAccelRadps2`); released, it eases back to
   * 0, so the rider can stop at any angle. The only way the heading changes in the air.
   */
  private spinBody(controls: RiderControls, dtS: number): void {
    const { bodySpinRateRadps, bodySpinAccelRadps2 } = this.config.tricks;
    // Q (spin −1) turns left: counter-clockwise seen from above = +heading.
    const wanted = -(controls.spin ?? 0) * bodySpinRateRadps;
    const step = bodySpinAccelRadps2 * dtS;
    const change = Math.max(-step, Math.min(step, wanted - this.bodySpinRateRadps));
    this.bodySpinRateRadps += change;
    this.headingRad = wrapPi(this.headingRad + this.bodySpinRateRadps * dtS);
  }

  /**
   * WIND-UP: while a pop is loaded on the ground, Q / E turn the shoulders toward
   * ±`windUpMaxRad` at `windUpRateRadps`; otherwise they unwind.
   */
  private updateWindUp(
    controls: RiderControls,
    board: BoardKinematics,
    loading: boolean,
    dtS: number,
  ): void {
    const { windUpMaxRad, windUpRateRadps } = this.config.tricks;
    const wanted = board.grounded && loading ? -(controls.spin ?? 0) * windUpMaxRad : 0;
    const step = windUpRateRadps * dtS;
    this.windUpRad += Math.max(-step, Math.min(step, wanted - this.windUpRad));
  }

  /**
   * Where the rider holds a foot: at its rider-frame position on an imaginary level deck
   * under the torso (following the kick heights), lifted by `liftM`.
   */
  private heldWorld(riderPosition: DeckPosition, liftM: number): Vec3 {
    const local = deckTopPointLocal(this.deck, riderPosition.alongM, riderPosition.acrossM);
    const offset = Quat.rotate(
      Quat.fromAxisAngle(Vec3.UNIT_Y, this.headingRad),
      Vec3.create(riderPosition.alongM, local.y + liftM, riderPosition.acrossM),
    );
    return Vec3.add(this.riderBase(), offset);
  }
}

function moveToward(from: DeckPosition, to: DeckPosition, maxStepM: number): DeckPosition {
  const dAlong = to.alongM - from.alongM;
  const dAcross = to.acrossM - from.acrossM;
  const distance = Math.hypot(dAlong, dAcross);
  if (distance <= maxStepM || distance === 0) return to;
  const k = maxStepM / distance;
  return DeckPosition.create(from.alongM + dAlong * k, from.acrossM + dAcross * k);
}
