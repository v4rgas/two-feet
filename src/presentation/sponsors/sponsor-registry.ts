/*
 * SPONSOR REGISTRY (pure data). Banner artwork per sponsor id, for the `banner` faces of
 * the world's `barrier` obstacles (`banner: { sponsorId }`). Maps only name ids; what a
 * banner looks like lives here and in `banner-art.ts`.
 *
 * Real sponsors use their real brand assets, copied into `public/sponsors/<id>/` and
 * composed by their own brand rules. House banners are the game's own art, for variety.
 * Never add a brand that did not give us its assets.
 */

export type SponsorKind = "sponsor" | "house";

export interface SponsorEntry {
  readonly id: string;
  /** Display name (as the brand writes it). */
  readonly name: string;
  readonly kind: SponsorKind;
  /** The sponsor's site, for credits. */
  readonly url?: string;
  /** Flat colour of the banner face until (or without) its art: the art's background. */
  readonly background: string;
  /** Files the banner art uses, relative to `public/` (checked by the tests). */
  readonly files: readonly string[];
}

export const SPONSORS: readonly SponsorEntry[] = Object.freeze([
  {
    // BipBop Labs (bipbop.cl): cream field, the penguin head mark (THE logo), the
    // "BipBop Labs_" wordmark and "bipbop.cl", from the brand's own files (their STYLE.md).
    id: "bipbop",
    name: "BipBop Labs",
    kind: "sponsor",
    url: "https://bipbop.cl",
    background: "#f7f5f0",
    files: ["sponsors/bipbop/head.svg", "sponsors/bipbop/wordmark.png", "sponsors/bipbop/url.svg"],
  },
  {
    // v4rgas (v4rgas.com), who makes the game: black field, the 32×32 pixel penguin with
    // crisp nearest-neighbour pixels, "v4rgas.com" in Space Mono.
    id: "v4rgas",
    name: "v4rgas",
    kind: "sponsor",
    url: "https://v4rgas.com",
    background: "#000000",
    files: ["sponsors/v4rgas/penguin.png", "fonts/SpaceMono-Bold.latin.woff2"],
  },
  {
    // House: the deck's penguin art and the game's name on ink.
    id: "house-deck",
    name: "Skate",
    kind: "house",
    background: "#1c1b19",
    files: [],
  },
  {
    // House: the two foot pads (green = front, blue = back) on light concrete.
    id: "house-feet",
    name: "Skate — two feet",
    kind: "house",
    background: "#e9e6df",
    files: [],
  },
]);

/** The banner shown for an unknown sponsor id. */
export const FALLBACK_SPONSOR_ID = "house-deck";

/** Ids of the house banners (handy for `perimeterBarriers({ banners })`). */
export const HOUSE_BANNER_IDS: readonly string[] = Object.freeze(
  SPONSORS.filter((s) => s.kind === "house").map((s) => s.id),
);

/** The registry entry for an id; unknown ids get the fallback house banner. */
export function sponsorById(id: string): SponsorEntry {
  const found =
    SPONSORS.find((s) => s.id === id) ?? SPONSORS.find((s) => s.id === FALLBACK_SPONSOR_ID);
  if (found === undefined) throw new Error("sponsor registry has no fallback banner");
  return found;
}
