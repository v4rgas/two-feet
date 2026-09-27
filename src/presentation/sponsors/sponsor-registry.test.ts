import { describe, expect, it } from "vitest";
import { BANNER_PAINTERS } from "./banner-art";
import { FALLBACK_SPONSOR_ID, HOUSE_BANNER_IDS, SPONSORS, sponsorById } from "./sponsor-registry";

/** Every file under public/ (keys only: nothing is loaded). */
const PUBLIC_FILES = new Set(
  Object.keys(import.meta.glob("../../../public/**/*")).map((k) =>
    k.replace("../../../public/", ""),
  ),
);
const HEAD_SVG = Object.values(
  import.meta.glob<string>("../../../public/sponsors/bipbop/head.svg", {
    query: "?raw",
    import: "default",
    eager: true,
  }),
)[0];

describe("sponsor registry", () => {
  it("has unique ids, each with a painter and its files in public/", () => {
    const ids = SPONSORS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SPONSORS) {
      expect(BANNER_PAINTERS[s.id], s.id).toBeTypeOf("function");
      for (const file of s.files) expect(PUBLIC_FILES.has(file), file).toBe(true);
      expect(s.background).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("ships the two real sponsors with their sites, plus house banners for variety", () => {
    expect(sponsorById("bipbop")).toMatchObject({ name: "BipBop Labs", url: "https://bipbop.cl" });
    expect(sponsorById("bipbop").background).toBe("#f7f5f0"); // their cream-100
    expect(sponsorById("v4rgas")).toMatchObject({
      url: "https://v4rgas.com",
      background: "#000000",
    });
    expect(HOUSE_BANNER_IDS.length).toBeGreaterThanOrEqual(2);
  });

  it("falls back to a house banner for an unknown id", () => {
    expect(sponsorById("no-such-brand").id).toBe(FALLBACK_SPONSOR_ID);
    expect(sponsorById(FALLBACK_SPONSOR_ID).kind).toBe("house");
  });

  it("uses BipBop's own head mark (THE logo, never the deprecated body mark)", () => {
    expect(HEAD_SVG).toContain("Head (source: penguin head mark)");
    expect(PUBLIC_FILES.has("sponsors/bipbop/body.svg")).toBe(false);
  });
});
