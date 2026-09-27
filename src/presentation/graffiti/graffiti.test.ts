import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createGraffiti } from "../../contexts/world";
import { PRESENTATION_CONFIG } from "../presentation.config";
import { PAINTED_PIECE_IDS } from "./graffiti-art";
import {
  buildGraffitiMeshes,
  decalCorners,
  GraffitiMaterials,
  projectDecal,
} from "./graffiti-decals";
import { GRAFFITI_PIECES, graffitiPieceById, seededRandom } from "./graffiti-registry";

const g = (pieceId: string, x: number) =>
  createGraffiti({
    pieceId,
    positionM: { x, y: 0.5, z: 2 },
    normal: { x: 0, y: 0, z: 1 },
    sizeM: 1,
  });

/** Two triangles (world, 9 numbers each) of the quad a, b, c, d (counter-clockwise). */
const quad = (a: number[], b: number[], c: number[], d: number[]): number[] => [
  ...a,
  ...b,
  ...c,
  ...a,
  ...c,
  ...d,
];
/** A wall facing +Z at z = 2, x ∈ [−5, 15], y ∈ [0, 3]. */
const WALL = quad([-5, 0, 2], [15, 0, 2], [15, 3, 2], [-5, 3, 2]);

/** Positions of a projection, as [x, y, z] triples. */
function project(g: ReturnType<typeof createGraffiti>, aspect: number, surfaces: number[]) {
  const out = { positions: [] as number[], uvs: [] as number[] };
  projectDecal(g, aspect, surfaces, PRESENTATION_CONFIG, out);
  const pts: [number, number, number][] = [];
  for (let i = 0; i < out.positions.length; i += 3) {
    pts.push([out.positions[i] ?? 0, out.positions[i + 1] ?? 0, out.positions[i + 2] ?? 0]);
  }
  return { pts, uvs: out.uvs };
}

describe("graffiti", () => {
  it("every registry piece has a painter, a unique id and a fixed seed", () => {
    const ids = GRAFFITI_PIECES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(PAINTED_PIECE_IDS.slice().sort()).toEqual(ids.slice().sort());
    for (const p of GRAFFITI_PIECES) {
      expect(p.aspect).toBeGreaterThan(0);
      expect(Number.isInteger(p.seed)).toBe(true);
    }
    // Never BipBop Labs' marks: their brand rules keep the marks unaltered.
    expect(ids.some((id) => id.includes("bipbop"))).toBe(false);
  });

  it("the spray noise is deterministic per seed", () => {
    const a = seededRandom(7);
    const b = seededRandom(7);
    const c = seededRandom(8);
    const seqA = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(seqA);
    expect([c(), c(), c()]).not.toEqual(seqA);
    for (const v of seqA) expect(v >= 0 && v < 1).toBe(true);
  });

  it("a decal is an upright quad of the piece's aspect, just off the wall", () => {
    const [bl, br, tr, tl] = decalCorners(g("pixel-penguin", 0), 2, 0.003);
    expect(br.x - bl.x).toBeCloseTo(1);
    expect(tl.y - bl.y).toBeCloseTo(0.5);
    for (const p of [bl, br, tr, tl]) expect(p.z).toBeCloseTo(2.003);
    // Counter-clockwise seen from the wall's normal (+Z): it faces out.
    const n = new THREE.Vector3().crossVectors(br.clone().sub(bl), tr.clone().sub(bl));
    expect(n.z).toBeGreaterThan(0);
  });

  it("merges placements per piece (one draw call each), skips unknown pieces, never collides", () => {
    const materials = new GraffitiMaterials(PRESENTATION_CONFIG, 1);
    const meshes = buildGraffitiMeshes(
      [g("pixel-penguin", 0), g("pixel-penguin", 3), g("v4rgas-throwup", 6), g("nope", 9)],
      WALL,
      materials,
      PRESENTATION_CONFIG,
    );
    expect(meshes.map((m) => m.name).sort()).toEqual([
      "graffiti:pixel-penguin",
      "graffiti:v4rgas-throwup",
    ]);
    const penguin = meshes.find((m) => m.name === "graffiti:pixel-penguin");
    // Two placements on a flat wall: each is the wall clipped to the piece (≥ 2 triangles).
    expect(penguin?.geometry.getAttribute("position").count).toBeGreaterThanOrEqual(12);
    const material = penguin?.material as THREE.MeshBasicMaterial;
    expect(material.blending).toBe(THREE.MultiplyBlending);
    expect(material.depthWrite).toBe(false);
    expect(material.polygonOffset).toBe(true);
    // In Node the art cannot paint: the decal stays hidden rather than showing a blank quad.
    expect(material.visible).toBe(false);
    expect(graffitiPieceById("nope")).toBeUndefined();
    // A piece over no surface makes no mesh at all.
    expect(
      buildGraffitiMeshes([g("pixel-penguin", 0)], [], materials, PRESENTATION_CONFIG),
    ).toEqual([]);
    materials.dispose();
  });

  it("a flat projection covers exactly the piece's rectangle, UVs 0..1, lifted off the wall", () => {
    const { pts, uvs } = project(g("pixel-penguin", 0), 2, WALL);
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    expect(Math.min(...xs)).toBeCloseTo(-0.5);
    expect(Math.max(...xs)).toBeCloseTo(0.5);
    expect(Math.min(...ys)).toBeCloseTo(0.25);
    expect(Math.max(...ys)).toBeCloseTo(0.75);
    for (const p of pts) expect(p[2]).toBeCloseTo(2 + PRESENTATION_CONFIG.graffiti.liftM);
    for (const v of uvs) expect(v >= -1e-9 && v <= 1 + 1e-9).toBe(true);
  });

  it("clips to the surface: a piece hanging off a wall's end is cut there", () => {
    const short = quad([-5, 0, 2], [0.2, 0, 2], [0.2, 3, 2], [-5, 3, 2]);
    const { pts } = project(g("pixel-penguin", 0), 2, short);
    expect(Math.max(...pts.map((p) => p[0]))).toBeCloseTo(0.2);
  });

  it("follows a slope and a curve: every vertex sits on its facet, both facets painted", () => {
    // A kink: flat ground for x < 0, then a 30° slope rising toward +X (a transition).
    const k = Math.tan(Math.PI / 6);
    const surfaces = [
      ...quad([-5, 0, 5], [0, 0, 5], [0, 0, -5], [-5, 0, -5]),
      ...quad([0, 0, 5], [5, 5 * k, 5], [5, 5 * k, -5], [0, 0, -5]),
    ];
    const onGround = createGraffiti({
      pieceId: "pixel-penguin",
      positionM: { x: 0, y: 0, z: 0 },
      normal: { x: -0.26, y: 0.97, z: 0 },
      sizeM: 1.6,
    });
    const { pts } = project(onGround, 1, surfaces);
    expect(pts.length).toBeGreaterThan(0);
    const lift = PRESENTATION_CONFIG.graffiti.liftM;
    for (const [x, y] of pts) {
      const surfaceY = x < 0 ? 0 : x * k;
      expect(Math.abs(y - surfaceY)).toBeLessThan(lift * 2 + 1e-6);
    }
    expect(pts.some((p) => p[0] < -0.3)).toBe(true); // on the flat
    expect(pts.some((p) => p[0] > 0.3 && p[1] > 0.1)).toBe(true); // up the slope
  });

  it("never paints faces that look away (the back of a wall, a side wall)", () => {
    const back = quad([-5, 3, 2], [15, 3, 2], [15, 0, 2], [-5, 0, 2]); // faces −Z
    const side = quad([0, 0, 1], [0, 0, 3], [0, 3, 3], [0, 3, 1]); // faces ±X
    expect(project(g("pixel-penguin", 0), 1, [...back, ...side]).pts).toEqual([]);
  });
});
