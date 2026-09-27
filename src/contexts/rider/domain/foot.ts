import type { FootId, Vec3 } from "../../../shared";
import type { DeckPosition } from "./deck-position";

/** A foot is either on the deck (applies forces) or airborne (follows the torso, no force). */
export type FootContact = "attached" | "airborne";

/**
 * Read model of the `Foot` entity (identity = `id`). The mutable entity lives inside
 * the `Rider` aggregate implementation; everyone else sees this immutable state.
 */
export interface FootState {
  readonly id: FootId;
  readonly contact: FootContact;
  /**
   * Position on the deck: the actual stance position while attached; the position the
   * foot would land on (projection) while airborne.
   */
  readonly deckPosition: DeckPosition;
  /** Normalised downward pressure in [0, 1] (0 while airborne). */
  readonly pressure: number;
  /** Where the foot is in the world, m — for rendering and catch-radius checks. */
  readonly positionWorldM: Vec3;
  /** Time since the foot last detached, s (0 while attached). */
  readonly detachedForS: number;
}

/**
 * `Foot` entity (identity = `id`). Mutated only by the `Rider` aggregate, which guards
 * the invariants: an airborne foot has zero pressure; an attached foot has
 * `detachedForS = 0` and a deck position on the deck's footprint.
 */
export class Foot {
  private contactState: FootContact = "attached";
  private position: DeckPosition;
  private pressureValue = 0;
  private worldM: Vec3;
  private detachedS = 0;

  constructor(
    readonly id: FootId,
    deckPosition: DeckPosition,
    positionWorldM: Vec3,
  ) {
    this.position = deckPosition;
    this.worldM = positionWorldM;
  }

  get contact(): FootContact {
    return this.contactState;
  }

  get isAttached(): boolean {
    return this.contactState === "attached";
  }

  get deckPosition(): DeckPosition {
    return this.position;
  }

  get detachedForS(): number {
    return this.detachedS;
  }

  /** Puts the foot on the deck at `at`. */
  attach(at: DeckPosition): void {
    this.contactState = "attached";
    this.position = at;
    this.detachedS = 0;
  }

  /** Takes the foot off the deck. */
  detach(): void {
    this.contactState = "airborne";
    this.pressureValue = 0;
    this.detachedS = 0;
  }

  /** Attached: moves on the deck. Airborne: updates the projected landing spot. */
  moveTo(at: DeckPosition): void {
    this.position = at;
  }

  setPressure(pressure: number): void {
    this.pressureValue = this.isAttached ? Math.max(0, Math.min(1, pressure)) : 0;
  }

  placeInWorld(positionWorldM: Vec3): void {
    this.worldM = positionWorldM;
  }

  /** Advances the detached timer (no-op while attached). */
  tick(dtS: number): void {
    if (!this.isAttached) this.detachedS += dtS;
  }

  toState(): FootState {
    return Object.freeze({
      id: this.id,
      contact: this.contactState,
      deckPosition: this.position,
      pressure: this.pressureValue,
      positionWorldM: this.worldM,
      detachedForS: this.detachedS,
    });
  }
}
