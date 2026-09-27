import type * as THREE from "three";
import { describe, expect, it } from "vitest";
import { PRESENTATION_CONFIG } from "../presentation.config";
import {
  buildShoeGeometry,
  createShoeMaterials,
  SHOE_MATERIAL,
  shoeAnkleLocal,
} from "./shoe-geometry";

const SIZE = PRESENTATION_CONFIG.feet.shoe;

function bounds(geometry: THREE.BufferGeometry): THREE.Box3 {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (box === null) throw new Error("no bounding box");
  return box;
}

describe("procedural skate shoe", () => {
  const geometry = buildShoeGeometry(SIZE);
  const position = geometry.getAttribute("position");

  it("matches the configured size (length along X, width along Z, collar height)", () => {
    const box = bounds(geometry);
    expect(box.max.x - box.min.x).toBeCloseTo(SIZE.lengthM, 2);
    expect(box.max.z - box.min.z).toBeCloseTo(SIZE.widthM, 2);
    // The tongue may peek a few mm over the collar.
    expect(box.max.y).toBeGreaterThan(SIZE.heightM * 0.97);
    expect(box.max.y).toBeLessThan(SIZE.heightM * 1.1);
  });

  it("is centred on the sole's bottom face: the sole bottom sits at y = 0", () => {
    const box = bounds(geometry);
    expect(box.min.y).toBeCloseTo(0, 6);
    expect(Math.abs(box.max.x + box.min.x)).toBeLessThan(0.002);
    expect(Math.abs(box.max.z + box.min.z)).toBeLessThan(1e-6);
    let flatCount = 0;
    for (let i = 0; i < position.count; i++) if (Math.abs(position.getY(i)) < 1e-6) flatCount++;
    expect(flatCount).toBeGreaterThan(20);
  });

  it("points its toe at +X: low toe box in front, high collar behind, toe spring lifts the tip", () => {
    let toeTop = 0;
    let heelTop = 0;
    let toeBottom = Number.POSITIVE_INFINITY;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const y = position.getY(i);
      if (x > SIZE.lengthM * 0.3) {
        toeTop = Math.max(toeTop, y);
        toeBottom = Math.min(toeBottom, y);
      }
      if (x < -SIZE.lengthM * 0.3) heelTop = Math.max(heelTop, y);
    }
    expect(heelTop).toBeGreaterThan(SIZE.heightM * 0.9);
    expect(toeTop).toBeLessThan(heelTop * 0.75);
    expect(toeBottom).toBeGreaterThan(0);
    expect(shoeAnkleLocal(SIZE).x).toBeLessThan(0);
  });

  it("stays low-poly, with a draw group per material", () => {
    const triangles = position.count / 3;
    expect(triangles).toBeGreaterThan(200);
    expect(triangles).toBeLessThan(700);
    expect(geometry.groups.map((g) => g.materialIndex)).toEqual([
      SHOE_MATERIAL.upper,
      SHOE_MATERIAL.sole,
      SHOE_MATERIAL.lace,
    ]);
    for (const g of geometry.groups) expect(g.count).toBeGreaterThan(0);
  });

  it("fades every part together when detached", () => {
    const colors = { upper: "#3d7a3a", sole: "#efe6d2", lace: "#1c1b19" };
    const ghost = createShoeMaterials(colors, 0.4);
    expect(ghost).toHaveLength(3);
    for (const m of ghost) {
      expect(m.transparent).toBe(true);
      expect(m.opacity).toBe(0.4);
      expect(m.depthWrite).toBe(false);
      m.dispose();
    }
    for (const m of createShoeMaterials(colors)) {
      expect(m.transparent).toBe(false);
      m.dispose();
    }
  });
});
