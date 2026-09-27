/*
 * SPONSOR REGISTRY (pure data). Banner artwork per sponsor id, for the `banner` faces of
 * the world's `barrier` obstacles (`banner: { sponsorId }`). Maps only name ids; what a
 * banner looks like lives here and in `banner-art.ts`.
 *
 * Real sponsors use their real brand assets, copied into `public/sponsors/<id>/` and
 * composed by their own brand rules. There are no "house" banners: a barrier without a
 * known sponsor is plain concrete. Never add a brand that did not give us its assets.
 */

export interface SponsorEntry {
  readonly id: string;
  /** Display name (as the brand writes it). */
  readonly name: string;
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
    url: "https://bipbop.cl",
    background: "#f7f5f0",
    files: ["sponsors/bipbop/head.svg", "sponsors/bipbop/wordmark.png", "sponsors/bipbop/url.svg"],
  },
  {
    // v4rgas (v4rgas.com), who makes the game: black field, the 32×32 pixel penguin with
    // crisp nearest-neighbour pixels, "v4rgas.com" in Space Mono.
    id: "v4rgas",
    name: "v4rgas",
    url: "https://v4rgas.com",
    background: "#000000",
    files: ["sponsors/v4rgas/penguin.png", "fonts/SpaceMono-Bold.latin.woff2"],
  },
]);

/**
 * The registry entry for an id, or undefined for an unknown id: the renderer then draws
 * the barrier plain (no banner art), never a stand-in banner.
 */
export function sponsorById(id: string): SponsorEntry | undefined {
  return SPONSORS.find((s) => s.id === id);
}
