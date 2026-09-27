import type { FootId } from "../../../shared";
import { Vec3 } from "../../../shared";
import type { DeckPosition } from "./deck-position";

/** A foot is either on the deck (drawn on it, carries weight) or airborne (held by the rider). */
export type FootContact = "attached" | "airborne";

/**
 * Read model of the `Foot` entity (identity = `id`). The mutable entity lives inside
 * the `Rider` aggregate implementation; everyone else sees this immutable state.
 *
 * Feet belong to the RIDER, not to the board (MECHANICS.md, ADR 0005): a foot is a
 * kinematic point held in the rider frame (torso + yaw-only heading, always upright). The
 * board moves under it; a foot never rotates with the board.
 */
export interface FootState {
  readonly id: FootId;
  readonly contact: FootContact;
  /**
   * Where the rider holds the foot, in the RIDER frame (`alongM` toward the rider's
   * front, `acrossM` toward the rider's +Z side), m.
   */
  readonly riderPosition: DeckPosition;
  /**
   * The deck spot under the foot, in the BOARD frame, m (may lie off the deck while
   * airborne). An attached foot is drawn, and carries weight, on the grip tape here.
   */
  readonly deckPosition: DeckPosition;
  /** Normalised weight on the foot in [0, 1] (0 while airborne) — HUD / feet squash. */
  readonly pressure: number;
  /**
   * Where the foot is drawn, m (world): on the grip tape when attached, hovering otherwise.
   * Continuous: it travels there with limited speed and acceleration in the rider frame
   * (a catch or a lift eases over `catchReachS`, never a jump).
   */
  readonly positionWorldM: Vec3;
  /** The same point in the rider frame (x along the heading, y up from the rider base, z across), m. */
  readonly positionRiderM: Vec3;
  /** Time since the foot last detached, s (0 while attached). */
  readonly detachedForS: number;
}

/** Limits of the drawn foot motion (rider config `feet`). */
export interface FootMotionLimits {
  readonly maxSpeedMps: number;
  readonly maxAccelMps2: number;
  readonly easeS: number;
}

function capLength(v: Vec3, max: number): Vec3 {
  const length = Vec3.length(v);
  return length > max ? Vec3.scale(v, max / length) : v;
}

/**
 * `Foot` entity (identity = `id`). Mutated only by the `Rider` aggregate, which guards
 * the invariants: an airborne foot has zero pressure; an attached foot has
 * `detachedForS = 0`.
 */
export class Foot {
  private contactState: FootContact = "attached";
  private hold: DeckPosition;
  private spot: DeckPosition;
  private pressureValue = 0;
  private worldM: Vec3 = Vec3.ZERO;
  /** Drawn position and velocity in the rider frame, and the previous goal (feed-forward). */
  private drawnM: Vec3 = Vec3.ZERO;
  private drawnVelocityMps: Vec3 = Vec3.ZERO;
  private lastGoalM: Vec3 | null = null;
  private detachedS = 0;

  constructor(
    readonly id: FootId,
    riderPosition: DeckPosition,
  ) {
    this.hold = riderPosition;
    this.spot = riderPosition;
  }

  get contact(): FootContact {
    return this.contactState;
  }

  get isAttached(): boolean {
    return this.contactState === "attached";
  }

  get riderPosition(): DeckPosition {
    return this.hold;
  }

  get deckPosition(): DeckPosition {
    return this.spot;
  }

  get detachedForS(): number {
    return this.detachedS;
  }

  attach(): void {
    this.contactState = "attached";
    this.detachedS = 0;
  }

  detach(): void {
    this.contactState = "airborne";
    this.pressureValue = 0;
    this.detachedS = 0;
  }

  /** Moves the rider-frame hold position. */
  holdAt(riderPosition: DeckPosition): void {
    this.hold = riderPosition;
  }

  /** Records the deck spot under the foot. */
  setSpot(spot: DeckPosition): void {
    this.spot = spot;
  }

  get drawnRiderM(): Vec3 {
    return this.drawnM;
  }

  /** Jumps the drawn position to `goalRiderM` (a reset), at rest. */
  snapDrawn(goalRiderM: Vec3): void {
    this.drawnM = goalRiderM;
    this.drawnVelocityMps = Vec3.ZERO;
    this.lastGoalM = goalRiderM;
  }

  /**
   * Moves the drawn position toward `goalRiderM` (rider frame): the goal's own velocity plus
   * an ease-out approach of the remaining gap (time constant `easeS`), with the velocity
   * change capped at `maxAccelMps2` and the speed at `maxSpeedMps`.
   */
  followDrawn(goalRiderM: Vec3, dtS: number, limits: FootMotionLimits): void {
    if (dtS <= 0) return;
    const goalVelocity =
      this.lastGoalM === null
        ? Vec3.ZERO
        : Vec3.scale(Vec3.sub(goalRiderM, this.lastGoalM), 1 / dtS);
    this.lastGoalM = goalRiderM;
    const gap = Vec3.sub(goalRiderM, this.drawnM);
    const wanted = capLength(
      Vec3.add(goalVelocity, Vec3.scale(gap, 1 / limits.easeS)),
      limits.maxSpeedMps,
    );
    const change = capLength(Vec3.sub(wanted, this.drawnVelocityMps), limits.maxAccelMps2 * dtS);
    this.drawnVelocityMps = capLength(Vec3.add(this.drawnVelocityMps, change), limits.maxSpeedMps);
    const step = Vec3.scale(this.drawnVelocityMps, dtS);
    // Never overshoot the goal: stop on it.
    if (Vec3.lengthSq(step) >= Vec3.lengthSq(gap) && Vec3.dot(step, gap) > 0) {
      this.drawnM = goalRiderM;
      this.drawnVelocityMps = capLength(goalVelocity, limits.maxSpeedMps);
      return;
    }
    this.drawnM = Vec3.add(this.drawnM, step);
  }

  /** Sets where the drawn position is in the world (the rider frame applied by the rider). */
  setWorld(positionWorldM: Vec3): void {
    this.worldM = positionWorldM;
  }

  setPressure(pressure: number): void {
    this.pressureValue = this.isAttached ? Math.max(0, Math.min(1, pressure)) : 0;
  }

  /** Advances the detached timer (no-op while attached). */
  tick(dtS: number): void {
    if (!this.isAttached) this.detachedS += dtS;
  }

  toState(): FootState {
    return Object.freeze({
      id: this.id,
      contact: this.contactState,
      riderPosition: this.hold,
      deckPosition: this.spot,
      pressure: this.pressureValue,
      positionWorldM: this.worldM,
      positionRiderM: this.drawnM,
      detachedForS: this.detachedS,
    });
  }
}
