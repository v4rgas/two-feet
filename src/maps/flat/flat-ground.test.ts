import { describe, expect, it } from "vitest";
import type { Obstacle } from "../../contexts/world";
import { obstacleGeometry, obstacleGrindEdges } from "../../contexts/world";
import { Transform } from "../../shared";
import { FLAT_CONFIG } from "./flat.config";
import { createFlatGroundLevel } from "./flat-ground";
import { map } from "./map";

/** World x/z extent of an obstacle. */
function extent(o: Obstacle): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const pts = obstacleGeometry(o).pieces.flatMap((p) =>
    p.verticesM.map((v) => Transform.toWorldPoint(o.transform, v)),
  );
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    maxX: Math.max(...pts.map((p) => p.x)),
    minZ: Math.min(...pts.map((p) => p.z)),
    maxZ: Math.max(...pts.map((p) => p.z)),
  };
}

describe("flat map", () => {
  const level = map.createLevel();
  const barriers = level.obstacles.filter((o) => o.id !== "ground");
  const sponsor = (o: Obstacle): string | null =>
    o.shape.kind === "barrier" ? (o.shape.banner?.sponsorId ?? null) : null;

  it("is the ground slab in a small ring of barriers, the spawn at the origin; the tutorial map", () => {
    expect(level.id).toBe("flat");
    expect(level.obstacles[0]?.id).toBe("ground");
    expect(barriers.length).toBeGreaterThan(10);
    for (const o of barriers) {
      expect(o.shape.kind).toBe("barrier");
      expect(obstacleGrindEdges(o)).toEqual([]);
    }
    expect(level.spawn).toEqual(map.spawn);
    expect(map.spawn.positionM).toEqual({ x: 0, y: 0, z: 0 });
    expect(map.tutorial).toBe(true);
    // The slab alone (scenarios) keeps the same spawn.
    expect(createFlatGroundLevel().obstacles.map((o) => o.id)).toEqual(["ground"]);
    expect(createFlatGroundLevel().spawn).toEqual(map.spawn);
  });

  it("leaves the tutorial room: ≥ 20 m of open concrete ahead of the spawn, ≥ 8 m either side", () => {
    const s = map.spawn.positionM;
    for (const o of barriers) {
      const r = extent(o);
      if (r.maxZ > s.z - 8 && r.minZ < s.z + 8) {
        const ahead = r.minX - s.x;
        const behind = s.x - r.maxX;
        expect(ahead >= 20 || behind >= 6, `${o.id} is in the way`).toBe(true);
      } else {
        expect(Math.min(Math.abs(r.minZ - s.z), Math.abs(r.maxZ - s.z))).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it("carries a few banners, not wall-to-wall: BipBop Labs dead ahead, v4rgas beside", () => {
    const bannered = barriers.filter((o) => sponsor(o) !== null);
    expect(bannered.length).toBe(FLAT_CONFIG.perimeter.banners.length);
    expect(bannered.length).toBeLessThanOrEqual(barriers.length / 3);
    const ahead = bannered.find((o) => sponsor(o) === "bipbop");
    expect(ahead?.transform.positionM.z).toBeCloseTo(0, 9);
    expect(ahead?.transform.positionM.x).toBeGreaterThan(20);
    expect(bannered.some((o) => sponsor(o) === "v4rgas")).toBe(true);
  });
});
