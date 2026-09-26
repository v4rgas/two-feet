/**
 * Where a foot stands on the deck, in the board frame (value object), m.
 * `alongM`: +X toward the nose (0 = deck centre). `acrossM`: +Z (see ADR 0002).
 */
export interface DeckPosition {
  readonly alongM: number;
  readonly acrossM: number;
}

/** Creates a deck position. Throws `RangeError` on non-finite input. */
function create(alongM: number, acrossM: number): DeckPosition {
  if (!Number.isFinite(alongM) || !Number.isFinite(acrossM)) {
    throw new RangeError(`DeckPosition must be finite, got (${alongM}, ${acrossM})`);
  }
  return Object.freeze({ alongM, acrossM });
}

/** Namespace for the DeckPosition value object. */
export const DeckPosition = Object.freeze({ create });
