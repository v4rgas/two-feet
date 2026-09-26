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
