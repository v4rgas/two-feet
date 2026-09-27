import { Vec3 } from "../../../shared";
import { DeckPosition } from "./deck-position";
import type { DeckGeometry } from "./foot-force-model";

/*
 * Deck-surface geometry, computed from the numbers in `DeckGeometry` (board's
 * `BoardSpec` satisfies it). The formulas MUST match `BoardSpec.deckTopPointLocal` /
 * `tailTipLocal`; `deck-surface.contract.test.ts` checks them against the board context.
 * All points are in the board frame (ADR 0002), m.
 */

/** Half of the tip-to-tip length (projected on X), m. */
export function deckHalfLengthM(g: DeckGeometry): number {
  return g.deck.lengthM / 2;
}

/** Half of the deck width, m. */
export function deckHalfWidthM(g: DeckGeometry): number {
  return g.deck.widthM / 2;
}

/** Half of the flat (un-kicked) middle section, m. */
export function flatHalfLengthM(g: DeckGeometry): number {
  return (g.deck.lengthM - 2 * g.deck.kickLengthM * Math.cos(g.deck.kickAngleRad)) / 2;
}

/** Point on the grip tape for a deck position (follows the nose/tail kick), m. */
export function deckTopPointLocal(g: DeckGeometry, alongM: number, acrossM: number): Vec3 {
  const halfLen = deckHalfLengthM(g);
  const x = Math.max(-halfLen, Math.min(halfLen, alongM));
  const beyond = Math.max(0, Math.abs(x) - flatHalfLengthM(g));
  const y = g.deck.thicknessM / 2 + beyond * Math.tan(g.deck.kickAngleRad);
  return Vec3.create(x, y, acrossM);
}

/** Underside edge of the tail tip — where the pop impulse goes, m. */
export function tailTipLocal(g: DeckGeometry): Vec3 {
  const top = deckTopPointLocal(g, -deckHalfLengthM(g), 0);
  return Vec3.create(top.x, top.y - g.deck.thicknessM, 0);
}

/** True if the position is on the deck's footprint (edges included). */
export function isOnDeck(g: DeckGeometry, p: DeckPosition): boolean {
  return Math.abs(p.alongM) <= deckHalfLengthM(g) && Math.abs(p.acrossM) <= deckHalfWidthM(g);
}

/** The closest position on the deck's footprint. */
export function clampToDeck(g: DeckGeometry, p: DeckPosition): DeckPosition {
  const halfLen = deckHalfLengthM(g);
  const halfWidth = deckHalfWidthM(g);
  return DeckPosition.create(
    Math.max(-halfLen, Math.min(halfLen, p.alongM)),
    Math.max(-halfWidth, Math.min(halfWidth, p.acrossM)),
  );
}

/** True if a foot here stands on the tail (at, or within `marginM` of, the tail kick). */
export function isOverTail(g: DeckGeometry, p: DeckPosition, marginM: number): boolean {
  return p.alongM <= -flatHalfLengthM(g) + marginM;
}
