import type { FootId } from "../../../shared";
import { FOOT_IDS, Transform, Vec3 } from "../../../shared";
import type { RiderConfig } from "../rider.config";
import type { DeckPosition } from "./deck-position";
import { deckHalfWidthM, deckTopPointLocal, isOverTail, tailTipLocal } from "./deck-surface";
import type { FootState } from "./foot";
import type { FootForce, FootForceLabel } from "./foot-force";
import type {
  BoardKinematics,
  DeckGeometry,
  FootForceInput,
  FootForceModel,
  RiderControls,
} from "./foot-force-model";
import { feetPressure, stickMagnitude, targetDeckPosition } from "./foot-placement";

/** One remembered sideways stick velocity sample (for flick detection). */
interface FlickSample {
  readonly ageS: number;
  readonly velocityX: number;
}

/**
 * The gesture → force mapping of REQUIREMENTS §1.2 (see docs/adr/0004). Stateless
 * geometry, stateful gestures: it remembers the tail charge (pop), the time since the
 * pop (ollie / flick / sweep windows), recent sideways stick speeds (flick), which feet
 * were off the deck during this air session (catch) and the push cooldown.
 *
 * Every force is expressed in world space at a world point on the deck. All magnitudes
 * and thresholds come from `RiderConfig.forces` / `.feet`.
 */
export class GestureFootForceModel implements FootForceModel {
  // pop (back foot on the tail)
  private holdS = 0;
  private peakTailHold = 0;
  private releasingS = 0;
  // windows after a pop
  private sincePopS = Number.POSITIVE_INFINITY;
  private sweepSpent = true;
  // flick (front foot)
  private flickSamples: FlickSample[] = [];
  private flickSpent = false;
  // catch
  private readonly offDeckThisAir: Record<FootId, boolean> = { front: false, back: false };
  // push
  private pushCooldownS = 0;

  constructor(
    private readonly deck: DeckGeometry,
    private readonly config: RiderConfig,
  ) {}

  reset(): void {
    this.resetCharge();
    this.sincePopS = Number.POSITIVE_INFINITY;
    this.sweepSpent = true;
    this.flickSamples = [];
    this.flickSpent = false;
    this.offDeckThisAir.front = false;
    this.offDeckThisAir.back = false;
    this.pushCooldownS = 0;
  }

  computeForces(input: FootForceInput): readonly FootForce[] {
    const { controls, rider, board, dtS } = input;
    this.advanceClocks(controls, board, rider.front, rider.back, dtS);
    if (rider.bailed) {
      this.resetCharge();
      return [];
    }
    const forces: FootForce[] = [];
    const frame = new DeckFrame(this.deck, board);
    this.press(input, frame, forces);
    this.pop(input, frame, forces);
    this.sweep(input, frame, forces);
    this.ollieFriction(input, frame, forces);
    this.flick(input, frame, forces);
    this.push(input, frame, forces);
    this.catchDamping(input, frame, forces);
    return forces;
  }

  // ── clocks ────────────────────────────────────────────────────────────────

  private advanceClocks(
    controls: RiderControls,
    board: BoardKinematics,
    front: FootState,
    back: FootState,
    dtS: number,
  ): void {
    this.sincePopS += dtS;
    this.pushCooldownS = Math.max(0, this.pushCooldownS - dtS);
    this.flickSamples = this.flickSamples
      .map((s) => ({ ageS: s.ageS + dtS, velocityX: s.velocityX }))
      .filter((s) => s.ageS <= this.config.forces.flickWindowS);
    this.flickSamples.push({ ageS: 0, velocityX: controls.front.stickVelocityPerS.x });
    if (board.grounded) {
      this.offDeckThisAir.front = false;
      this.offDeckThisAir.back = false;
    } else {
      if (front.contact === "airborne") this.offDeckThisAir.front = true;
      if (back.contact === "airborne") this.offDeckThisAir.back = true;
    }
  }

  // ── press + carve ─────────────────────────────────────────────────────────

  /**
   * Grounded only. Each attached foot pushes the deck down (−board Y) with
   * `pressure × footPressN` (standing weight + tail hold). When both sticks lean to the
   * same side, each foot adds `carveLeanN × lean` at its own (sideways) spot, so the
   * deck rolls toward that edge and the trucks steer (board context).
   */
  private press({ controls, rider }: FootForceInput, frame: DeckFrame, out: FootForce[]): void {
    if (!frame.touchingGround) return;
    const { forces } = this.config;
    const pressure = feetPressure(
      controls,
      { front: rider.front.deckPosition, back: rider.back.deckPosition },
      this.deck,
      this.config,
    );
    const lean = this.carveLean(controls, rider.front, rider.back);
    for (const id of FOOT_IDS) {
      const foot = rider[id];
      if (foot.contact !== "attached") continue;
      const newtons = pressure[id] * forces.footPressN + Math.abs(lean) * forces.carveLeanN;
      if (newtons <= 0) continue;
      out.push(
        forceAt(id, "press", Vec3.scale(frame.down, newtons), frame.point(foot.deckPosition)),
      );
    }
  }

  /** Signed lean in [-1, 1] (+ = toward +Z) when both feet lean the same way, else 0. */
  private carveLean(controls: RiderControls, front: FootState, back: FootState): number {
    if (front.contact !== "attached" || back.contact !== "attached") return 0;
    const fx = controls.front.stick.x;
    const bx = controls.back.stick.x;
    if (Math.sign(fx) !== Math.sign(bx)) return 0;
    const lean = Math.min(Math.abs(fx), Math.abs(bx));
    return lean >= this.config.forces.carveMinStickX ? Math.sign(fx) * lean : 0;
  }

  // ── pop ───────────────────────────────────────────────────────────────────

  /**
   * Back foot over the tail with stick y ≤ −popChargeStickY charges. Leaving the charge
   * and crossing y > −popReleaseStickY within `popReleaseWindowS` (after a hold of at
   * least `popMinHoldS`) pops: an impulse along −board Y at the tail tip, scaled by the
   * peak hold. Only while the board touches the ground; otherwise the charge is dropped.
   */
  private pop({ controls, rider, dtS }: FootForceInput, frame: DeckFrame, out: FootForce[]): void {
    const { forces, feet } = this.config;
    const back = rider.back;
    const y = controls.back.stick.y;
    const attached = back.contact === "attached";
    const charging =
      attached &&
      isOverTail(this.deck, back.deckPosition, feet.tailZoneMarginM) &&
      y <= -forces.popChargeStickY;
    if (charging) {
      this.holdS += dtS;
      this.peakTailHold = Math.max(this.peakTailHold, Math.min(1, -y));
      this.releasingS = 0;
      return;
    }
    if (this.holdS < forces.popMinHoldS) {
      this.resetCharge();
      return;
    }
    this.releasingS += dtS;
    if (y <= -forces.popReleaseStickY) {
      if (this.releasingS > forces.popReleaseWindowS) this.resetCharge();
      return;
    }
    const canPop = attached && frame.touchingGround && this.releasingS <= forces.popReleaseWindowS;
    const strength = this.peakTailHold;
    this.resetCharge();
    if (!canPop) return;
    const impulse = Vec3.scale(frame.down, forces.popImpulseNs * strength);
    out.push(impulseAt("back", "pop", impulse, frame.tailTip));
    this.sincePopS = 0;
    this.sweepSpent = false;
  }

  private resetCharge(): void {
    this.holdS = 0;
    this.peakTailHold = 0;
    this.releasingS = 0;
  }

  // ── sweep (shuvit) ────────────────────────────────────────────────────────

  /**
   * Within `sweepWindowS` of a pop, a back stick at |x| ≥ sweepMinStickX kicks the tail
   * sideways: an impulse along ±board Z at the tail tip → yaw. Once per pop.
   */
  private sweep({ controls }: FootForceInput, frame: DeckFrame, out: FootForce[]): void {
    const { forces } = this.config;
    if (this.sweepSpent || this.sincePopS > forces.sweepWindowS) return;
    const x = controls.back.stick.x;
    if (Math.abs(x) < forces.sweepMinStickX) return;
    const impulse = Vec3.scale(frame.side, Math.sign(x) * forces.sweepImpulseNs);
    out.push(impulseAt("back", "sweep", impulse, frame.tailTip));
    this.sweepSpent = true;
  }

  // ── ollie ─────────────────────────────────────────────────────────────────

  /**
   * Within `ollieWindowS` of a pop, the attached front foot sliding toward the nose
   * (stick velocity × reach ≥ ollieMinSlideSpeedMps) presses into the grip with
   * `ollieFootNormalN` and drags it: μ·N along +board X plus N along −board Y at the
   * foot. The drag lifts the (pitched-up) board; the normal force levels the nose.
   */
  private ollieFriction(
    { controls, rider }: FootForceInput,
    frame: DeckFrame,
    out: FootForce[],
  ): void {
    const { forces, feet } = this.config;
    const front = rider.front;
    if (front.contact !== "attached" || this.sincePopS > forces.ollieWindowS) return;
    const slideMps = Math.min(
      controls.front.stickVelocityPerS.y * feet.reachAlongM,
      feet.maxSlideSpeedMps,
    );
    if (slideMps < forces.ollieMinSlideSpeedMps) return;
    const normalN = forces.ollieFootNormalN;
    const force = Vec3.add(
      Vec3.scale(frame.forward, forces.gripFrictionCoeff * normalN),
      Vec3.scale(frame.down, normalN),
    );
    out.push(forceAt("front", "friction", force, frame.point(front.deckPosition)));
  }

  // ── flick (kickflip / heelflip) ───────────────────────────────────────────

  /**
   * The attached front foot's target crossing a deck edge — with a sideways stick-speed
   * peak ≥ flickMinStickSpeedPerS toward that edge in the last `flickWindowS` — while the
   * board is airborne or was popped within `flickAfterPopWindowS`: an impulse at the
   * crossed edge, pointing outward and `flickDownAngleRad` downward. Pushing the +Z edge
   * down gives +roll, the −Z edge −roll. Once per crossing; re-armed when the target is
   * back on the deck.
   */
  private flick({ controls, rider, board }: FootForceInput, frame: DeckFrame, out: FootForce[]) {
    const { forces, feet } = this.config;
    const front = rider.front;
    const target = targetDeckPosition("front", controls.front.stick, feet);
    const halfWidth = deckHalfWidthM(this.deck);
    const pastEdge = Math.abs(target.acrossM) > halfWidth;
    if (!pastEdge) {
      this.flickSpent = false;
      return;
    }
    if (this.flickSpent || front.contact !== "attached") return;
    const inAir = !board.grounded || this.sincePopS <= forces.flickAfterPopWindowS;
    if (!inAir) return;
    // Past the edge in the air: whatever happens, this crossing is used up.
    this.flickSpent = true;
    const side = Math.sign(target.acrossM);
    const peak = Math.max(0, ...this.flickSamples.map((s) => s.velocityX * side));
    if (peak < forces.flickMinStickSpeedPerS) return;
    const a = forces.flickDownAngleRad;
    const direction = Vec3.add(
      Vec3.scale(frame.side, side * Math.cos(a)),
      Vec3.scale(frame.down, Math.sin(a)),
    );
    const edge = frame.point({ alongM: front.deckPosition.alongM, acrossM: side * halfWidth });
    out.push(impulseAt("front", "flick", Vec3.scale(direction, forces.flickImpulseNs), edge));
  }

  // ── push ──────────────────────────────────────────────────────────────────

  /**
   * Push button, board on its wheels, both feet attached with sticks within
   * `pushNeutralRadius`, below `pushMaxSpeedMps`, cooldown elapsed: an impulse along
   * the board's heading (its +X flattened onto the ground) through the front foot.
   */
  private push({ controls, rider, board }: FootForceInput, frame: DeckFrame, out: FootForce[]) {
    const { forces } = this.config;
    if (!controls.push || !board.grounded || this.pushCooldownS > 0) return;
    if (rider.front.contact !== "attached" || rider.back.contact !== "attached") return;
    const neutral =
      stickMagnitude(controls.front.stick) <= forces.pushNeutralRadius &&
      stickMagnitude(controls.back.stick) <= forces.pushNeutralRadius;
    if (!neutral) return;
    const heading = Vec3.normalize(Vec3.create(frame.forward.x, 0, frame.forward.z));
    if (Vec3.lengthSq(heading) === 0) return;
    if (Vec3.dot(board.linearVelocityMps, heading) >= forces.pushMaxSpeedMps) return;
    const impulse = Vec3.scale(heading, forces.pushImpulseNs);
    out.push(impulseAt("front", "push", impulse, frame.point(rider.front.deckPosition)));
    this.pushCooldownS = forces.pushCooldownS;
  }

  // ── catch ─────────────────────────────────────────────────────────────────

  /**
   * In the air, a foot that was off the deck during this air session and is back on it
   * with its stick near neutral damps the board's spin: at both shoe edges,
   * F = −catchDampingNsPerM · (ω × r). Two edges across the shoe give roll damping too.
   */
  private catchDamping(
    { controls, rider, board }: FootForceInput,
    frame: DeckFrame,
    out: FootForce[],
  ): void {
    if (board.grounded) return;
    const { forces, feet } = this.config;
    for (const id of FOOT_IDS) {
      const foot = rider[id];
      if (foot.contact !== "attached" || !this.offDeckThisAir[id]) continue;
      if (stickMagnitude(controls[id].stick) > forces.catchNeutralRadius) continue;
      for (const edge of [-1, 1]) {
        const point = frame.point({
          alongM: foot.deckPosition.alongM,
          acrossM: foot.deckPosition.acrossM + edge * feet.shoeHalfWidthM,
        });
        const r = Vec3.sub(point, board.transform.positionM);
        const spinVelocity = Vec3.cross(board.angularVelocityRadps, r);
        if (Vec3.lengthSq(spinVelocity) === 0) continue;
        out.push(forceAt(id, "catch", Vec3.scale(spinVelocity, -forces.catchDampingNsPerM), point));
      }
    }
  }
}

/** The board's axes and key points in world space for one step. */
class DeckFrame {
  /** −board Y (into the grip tape). */
  readonly down: Vec3;
  /** +board X (toward the nose). */
  readonly forward: Vec3;
  /** +board Z. */
  readonly side: Vec3;
  readonly tailTip: Vec3;
  /** Board on its wheels, or tail / nose touching (pop and press need a surface). */
  readonly touchingGround: boolean;

  constructor(
    private readonly deck: DeckGeometry,
    private readonly board: BoardKinematics,
  ) {
    const t = board.transform;
    this.down = Transform.toWorldDirection(t, Vec3.create(0, -1, 0));
    this.forward = Transform.toWorldDirection(t, Vec3.UNIT_X);
    this.side = Transform.toWorldDirection(t, Vec3.UNIT_Z);
    this.tailTip = Transform.toWorldPoint(t, tailTipLocal(deck));
    this.touchingGround = board.grounded || board.contacts.tail || board.contacts.nose;
  }

  /** Grip-tape point (world) for a deck position. */
  point(p: Pick<DeckPosition, "alongM" | "acrossM">): Vec3 {
    return Transform.toWorldPoint(
      this.board.transform,
      deckTopPointLocal(this.deck, p.alongM, p.acrossM),
    );
  }
}

function forceAt(foot: FootId, label: FootForceLabel, forceN: Vec3, pointWorldM: Vec3): FootForce {
  return Object.freeze({ kind: "force", foot, label, forceN, pointWorldM });
}

function impulseAt(
  foot: FootId,
  label: FootForceLabel,
  impulseNs: Vec3,
  pointWorldM: Vec3,
): FootForce {
  return Object.freeze({ kind: "impulse", foot, label, impulseNs, pointWorldM });
}
