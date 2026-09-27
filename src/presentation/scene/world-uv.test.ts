import { describe, expect, it } from "vitest";
import { bannerFaceUvs, worldBoxUvs } from "./world-uv";

/** Two triangles of an axis-aligned rectangle, as flat position arrays. */
const quad = (a: number[], b: number[], c: number[], d: number[]): number[] => [
  ...a,
  ...b,
  ...c,
  ...a,
  ...c,
  ...d,
];

function span(uvs: Float32Array, axis: 0 | 1): number {
  const vals = Array.from(uvs).filter((_, i) => i % 2 === axis);
  return Math.max(...vals) - Math.min(...vals);
}

describe("worldBoxUvs", () => {
  it("tiles a floor at world scale: 1 repeat per metresPerRepeat, from its world XZ", () => {
    // A 4 m × 2 m floor patch at y = 0.3, far from the origin.
    const floor = quad([10, 0.3, 5], [14, 0.3, 5], [14, 0.3, 7], [10, 0.3, 7]);
    const uvs = worldBoxUvs(floor, 2);
    expect(span(uvs, 0)).toBeCloseTo(2); // 4 m / 2 m per repeat
    expect(span(uvs, 1)).toBeCloseTo(1); // 2 m / 2 m
    expect(uvs[0]).toBeCloseTo(5); // x = 10 m → 5 repeats: world-anchored
  });

  it("projects walls on their own plane: ±Z faces on XY, ±X faces on ZY, upright", () => {
    const wallZ = quad([0, 0, 1], [3, 0, 1], [3, 1.5, 1], [0, 1.5, 1]);
    const uz = worldBoxUvs(wallZ, 1.5);
    expect(span(uz, 0)).toBeCloseTo(2);
    expect(span(uz, 1)).toBeCloseTo(1);
    const wallX = quad([2, 0, 0], [2, 0, 3], [2, 0.75, 3], [2, 0.75, 0]);
    const ux = worldBoxUvs(wallX, 1.5);
    expect(span(ux, 0)).toBeCloseTo(2);
    expect(span(ux, 1)).toBeCloseTo(0.5);
    // v grows with height (textures stand upright).
    expect(ux[5]).toBeGreaterThan(ux[1] ?? 0);
  });

  it("gives the same texel density on every obstacle kind (a slope uses its dominant plane)", () => {
    // A 20° bank, 3 m along X: projected on XZ, so its u spans its 3 m run.
    const h = Math.tan((20 * Math.PI) / 180) * 3;
    const bank = quad([0, 0, 0], [3, h, 0], [3, h, -2], [0, 0, -2]);
    const uvs = worldBoxUvs(bank, 3);
    expect(span(uvs, 0)).toBeCloseTo(1);
    expect(span(uvs, 1)).toBeCloseTo(2 / 3);
  });
});

describe("bannerFaceUvs", () => {
  it("spans 0..1 up the face and whole art tiles along it, left to right as seen", () => {
    // A 4 m × 0.8 m face looking toward +Z: art 5:1 → exactly one tile.
    const pts: [number, number, number][] = [
      [-2, 0.1, 0.2],
      [2, 0.1, 0.2],
      [2, 0.9, 0.2],
      [-2, 0.9, 0.2],
    ];
    const uv = bannerFaceUvs(pts, [0, 0, 1], 5);
    expect(uv).toEqual([0, 0, 1, 0, 1, 1, 0, 1].map((v) => expect.closeTo(v, 9)));
  });

  it("repeats the art along a long panel and mirrors correctly on the back face", () => {
    const long: [number, number, number][] = [
      [-4, 0, 0],
      [4, 0, 0],
      [4, 0.8, 0],
      [-4, 0.8, 0],
    ];
    const tiles = bannerFaceUvs(long, [0, 0, 1], 5);
    expect(Math.max(...tiles.filter((_, i) => i % 2 === 0))).toBeCloseTo(2);
    // Seen from −Z, +X is on the viewer's LEFT: u must fall as x grows.
    const back = bannerFaceUvs(long, [0, 0, -1], 5);
    expect(back[0]).toBeGreaterThan(back[2] ?? 0);
  });
});
