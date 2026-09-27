import { describe, expect, it } from "vitest";
import { BANNER_PAINTERS } from "./banner-art";
import { SPONSORS, sponsorById } from "./sponsor-registry";

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

  it("ships only the two real sponsors, with their sites", () => {
    expect(SPONSORS.map((s) => s.id).sort()).toEqual(["bipbop", "v4rgas"]);
    expect(Object.keys(BANNER_PAINTERS).sort()).toEqual(["bipbop", "v4rgas"]);
    expect(sponsorById("bipbop")).toMatchObject({ name: "BipBop Labs", url: "https://bipbop.cl" });
    expect(sponsorById("bipbop")?.background).toBe("#f7f5f0"); // their cream-100
    expect(sponsorById("v4rgas")).toMatchObject({
      url: "https://v4rgas.com",
      background: "#000000",
    });
  });

  it("has no entry for an unknown id (the barrier stays plain)", () => {
    expect(sponsorById("no-such-brand")).toBeUndefined();
    expect(sponsorById("house-deck")).toBeUndefined();
  });

  it("uses BipBop's own head mark (THE logo, never the deprecated body mark)", () => {
    expect(HEAD_SVG).toContain("Head (source: penguin head mark)");
    expect(PUBLIC_FILES.has("sponsors/bipbop/body.svg")).toBe(false);
  });
});
