/*
 * GRAFFITI REGISTRY (pure data). Generated pieces made only from our own marks: v4rgas's
 * 32 × 32 pixel penguin (always nearest-neighbour) and lettering. The deck's penguin art is
 * the board's decal ONLY (never a banner or a piece). BipBop Labs' marks are never
 * stylised here (their brand rules: the marks are not to be altered). Maps place pieces
 * by id with the world's `graffitiOnFace` / `Level.graffiti`.
 */

export interface GraffitiPiece {
  readonly id: string;
  readonly name: string;
  /** Width / height of the artwork (and of the decal). */
  readonly aspect: number;
  /** Seed of the piece's spray noise, drips and speckle: the art is reproducible. */
  readonly seed: number;
}

export const GRAFFITI_PIECES: readonly GraffitiPiece[] = Object.freeze([
  { id: "v4rgas-throwup", name: "v4rgas bubble throw-up with a crown", aspect: 2, seed: 4 },
  { id: "pixel-penguin", name: "sprayed pixel penguin", aspect: 1, seed: 32 },
  { id: "penguin-king", name: "pixel penguin with crown and stars", aspect: 1.4, seed: 11 },
  // Floor and ramp pieces (they read on any surface: see STYLE.md "Graffiti").
  { id: "v4rgas-wildstyle", name: "v4rgas wild bubble letters with arrows", aspect: 2.6, seed: 21 },
  { id: "penguin-stencil", name: "pixel penguin stencil with overspray", aspect: 1, seed: 5 },
  { id: "tag-scribbles", name: "handstyle v4rgas tags and a crown doodle", aspect: 2.4, seed: 17 },
  {
    id: "sticker-bomb",
    name: "stars, crowns and arrows round a pixel penguin",
    aspect: 1.3,
    seed: 29,
  },
  { id: "landing-target", name: "calm sprayed target with an X (landings)", aspect: 1, seed: 3 },
  { id: "flow-arrow", name: "fat curved flow arrow with a dashed line", aspect: 2, seed: 13 },
]);

/** The piece for an id, or undefined (the renderer skips unknown pieces). */
export function graffitiPieceById(id: string): GraffitiPiece | undefined {
  return GRAFFITI_PIECES.find((p) => p.id === id);
}

/**
 * Seeded PRNG (mulberry32): the same seed gives the same sequence of numbers in [0, 1),
 * so a piece's spray always comes out the same.
 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
