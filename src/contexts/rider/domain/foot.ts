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
  /** Where the foot is drawn, m (world): on the grip tape when attached, hovering otherwise. */
  readonly positionWorldM: Vec3;
  /** Time since the foot last detached, s (0 while attached). */
  readonly detachedForS: number;
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

  /** Places the foot in the world and records the deck spot under it. */
  place(positionWorldM: Vec3, spot: DeckPosition): void {
    this.worldM = positionWorldM;
    this.spot = spot;
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
      detachedForS: this.detachedS,
    });
  }
}
