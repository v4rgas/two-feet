import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createGraffiti } from "../../contexts/world";
import { PRESENTATION_CONFIG } from "../presentation.config";
import { PAINTED_PIECE_IDS } from "./graffiti-art";
import { buildGraffitiMeshes, decalCorners, GraffitiMaterials } from "./graffiti-decals";
import { GRAFFITI_PIECES, graffitiPieceById, seededRandom } from "./graffiti-registry";

const g = (pieceId: string, x: number) =>
  createGraffiti({
    pieceId,
    positionM: { x, y: 0.5, z: 2 },
    normal: { x: 0, y: 0, z: 1 },
    sizeM: 1,
  });

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
      materials,
      PRESENTATION_CONFIG,
    );
    expect(meshes.map((m) => m.name).sort()).toEqual([
      "graffiti:pixel-penguin",
      "graffiti:v4rgas-throwup",
    ]);
    const penguin = meshes.find((m) => m.name === "graffiti:pixel-penguin");
    expect(penguin?.geometry.getAttribute("position").count).toBe(12);
    const material = penguin?.material as THREE.MeshBasicMaterial;
    expect(material.blending).toBe(THREE.MultiplyBlending);
    expect(material.depthWrite).toBe(false);
    // In Node the art cannot paint: the decal stays hidden rather than showing a blank quad.
    expect(material.visible).toBe(false);
    expect(graffitiPieceById("nope")).toBeUndefined();
    materials.dispose();
  });
});
