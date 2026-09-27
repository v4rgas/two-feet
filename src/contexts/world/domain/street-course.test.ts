import { describe, expect, it } from "vitest";
import { Transform, Vec3 } from "../../../shared";
import { WORLD_CONFIG } from "../world.config";
import { levelGrindEdges, obstacleGrindEdges } from "./grind-edges";
import type { Obstacle } from "./obstacle";
import { obstacleGeometry, stairsFootXM, stairsHeightM } from "./obstacle-geometry";
import { createStreetCourseLevel } from "./street-course";

/*
 * The street course layout (`?level=street`): obstacles don't overlap, every drop has a
 * clear roll-out, the spawn has a run-up, every grind edge is there, and the heights stay
 * within the ≈ 0.45 m pop from where you take off.
 */

const level = createStreetCourseLevel();
const S = WORLD_CONFIG.street;

interface Rect {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly maxY: number;
}

/** World-space footprint of an obstacle's pieces above the ground (y > 0). */
function footprint(o: Obstacle): Rect {
  const pts = obstacleGeometry(o).pieces.flatMap((p) =>
    p.verticesM.map((v) => Transform.toWorldPoint(o.transform, v)),
  );
  // Only what stands above the ground: buried toes (y < 0) are not in the way.
  const up = pts.filter((p) => p.y > 1e-6);
  const xs = up.map((p) => p.x);
  const zs = up.map((p) => p.z);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
    maxY: Math.max(...up.map((p) => p.y)),
  };
}

function byId(id: string): Obstacle {
  const o = level.obstacles.find((x) => x.id === id);
  if (o === undefined) throw new Error(`no obstacle ${id}`);
  return o;
}

const FEATURES = level.obstacles.filter((o) => o.id !== "ground");

/** Nothing (but `except`) stands in the lane x ∈ [x0, x0 + lengthM], z ∈ [z0, z1]. */
function expectClear(
  what: string,
  x0: number,
  lengthM: number,
  z0: number,
  z1: number,
  except: readonly string[],
): void {
  for (const o of FEATURES) {
    if (except.includes(o.id)) continue;
    const r = footprint(o);
    const blocks = r.maxX > x0 && r.minX < x0 + lengthM && r.maxZ > z0 && r.minZ < z1;
    expect(blocks, `${o.id} blocks the roll-out after ${what}`).toBe(false);
  }
}

describe("street course level", () => {
  it("is the `street` level with every obstacle kind a street course needs", () => {
    expect(level.id).toBe("street");
    expect(level.name).toBe("Street Course");
    const kinds = new Set(level.obstacles.map((o) => o.shape.kind));
    for (const kind of [
      "quarterPipe",
      "stairs",
      "funbox",
      "kinkedRail",
      "ledge",
      "rail",
      "bankLedge",
    ] as const) {
      expect(kinds.has(kind), kind).toBe(true);
    }
  });

  it("fits in about 53 × 30 m, quarter pipes at both short ends", () => {
    const rects = FEATURES.map(footprint);
    const minX = Math.min(...rects.map((r) => r.minX));
    const maxX = Math.max(...rects.map((r) => r.maxX));
    const minZ = Math.min(...rects.map((r) => r.minZ));
    const maxZ = Math.max(...rects.map((r) => r.maxZ));
    expect(maxX - minX).toBeLessThan(56);
    expect(maxZ - minZ).toBeLessThan(31);
    const west = footprint(byId("qp-west"));
    const east = footprint(byId("qp-east"));
    expect(west.minX).toBeCloseTo(minX, 6);
    expect(east.maxX).toBeCloseTo(maxX, 6);
  });

  it("no two obstacles overlap (the kinked rail stands in its 3-stair, over its middle)", () => {
    const rects = FEATURES.map((o) => ({ id: o.id, r: footprint(o) }));
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        const a = rects[i];
        const b = rects[j];
        if (a === undefined || b === undefined) continue;
        if (a.id === "small-stairs" && b.id === "kinked-rail") continue;
        const overlap =
          a.r.maxX > b.r.minX + 1e-6 &&
          b.r.maxX > a.r.minX + 1e-6 &&
          a.r.maxZ > b.r.minZ + 1e-6 &&
          b.r.maxZ > a.r.minZ + 1e-6;
        expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });

  it("spawns on the 7-stair's landing with a clear run-up of at least 6 m toward the drop", () => {
    const stairs = byId("big-stairs");
    if (stairs.shape.kind !== "stairs") throw new Error("not stairs");
    expect(level.spawn.positionM.y).toBeCloseTo(stairsHeightM(stairs.shape), 9);
    expect(stairs.shape.stepCount).toBe(7);
    const nosingX = stairs.transform.positionM.x;
    expect(nosingX - level.spawn.positionM.x).toBeGreaterThanOrEqual(6);
    expect(level.spawn.positionM.x).toBeGreaterThan(nosingX - stairs.shape.topDepthM);
    expect(level.spawn.headingRad).toBe(0); // facing the drop (+X)
    // The push lane (between the handrail and the +Z hubba) is clear.
    expect(Math.abs(level.spawn.positionM.z)).toBeGreaterThan(0.5);
    expect(Math.abs(level.spawn.positionM.z)).toBeLessThan(stairs.shape.widthM / 2 - 0.5);
  });

  it("leaves at least 4 m of clear roll-out after every drop (6 m after the stairs and the gap)", () => {
    const big = byId("big-stairs");
    if (big.shape.kind !== "stairs") throw new Error("not stairs");
    const bigFoot = big.transform.positionM.x + stairsFootXM(big.shape);
    const bigHalf = big.shape.widthM / 2 + 0.5;
    expectClear("the 7-stair", bigFoot, 6, -bigHalf, bigHalf, ["big-stairs"]);

    const small = byId("small-stairs");
    if (small.shape.kind !== "stairs") throw new Error("not stairs");
    const smallFoot = small.transform.positionM.x + stairsFootXM(small.shape);
    const sz = small.transform.positionM.z;
    const sHalf = small.shape.widthM / 2;
    expectClear("the 3-stair", smallFoot, 6, sz - sHalf, sz + sHalf, [
      "small-stairs",
      "kinked-rail",
    ]);
    const rail = footprint(byId("kinked-rail"));
    expectClear("the kinked rail", rail.maxX, 4, rail.minZ - 0.5, rail.maxZ + 0.5, []);

    const gap = byId("gap-platform");
    const gz = gap.transform.positionM.z;
    expectClear("the euro gap", gap.transform.positionM.x, 6, gz - 2, gz + 2, ["gap-platform"]);

    for (const id of [
      "manual-pad-low",
      "manual-pad-high",
      "long-ledge",
      "flat-bar",
      "up-ledge",
      "bank-ledge",
      "funbox",
    ]) {
      const r = footprint(byId(id));
      expectClear(id, r.maxX, 4, r.minZ, r.maxZ, [id]);
    }
  });

  it("heights: grindable tops within the pop (≤ 0.4 m) above where you take off", () => {
    const h = (id: string): number => footprint(byId(id)).maxY;
    expect(h("long-ledge")).toBeGreaterThanOrEqual(0.35);
    expect(h("long-ledge")).toBeLessThanOrEqual(0.4);
    expect(h("flat-bar")).toBeCloseTo(0.3, 6);
    expect(h("manual-pad-low")).toBeCloseTo(0.15, 6);
    expect(h("manual-pad-high")).toBeCloseTo(0.25, 6);
    expect(h("up-ledge")).toBeLessThanOrEqual(0.4);
    // Funbox rails and the kinked rail's top flat: 0.3–0.35 m above the top they start on.
    expect(S.funbox.topRail.heightM).toBeLessThanOrEqual(0.4);
    expect(S.funbox.bankRail.heightM).toBeLessThanOrEqual(0.4);
    expect(S.kinkedRail.heightM).toBeLessThanOrEqual(0.4);
    // The bank-to-ledge: the ledge stands 0.3 m above the top of the bank.
    expect(S.bankLedge.ledgeHeightM).toBeLessThanOrEqual(0.4);
    // The hubbas: 0.35 m above the landing (like the park's).
    expect(S.bigStairs.hubba.heightM).toBeLessThanOrEqual(0.4);
    // The funbox is a funbox, not a wall: about 0.5 m.
    expect(h("funbox")).toBeLessThan(0.9); // incl. its top rail
  });

  it("every grindable and ledge feature has its edges; the kinked rail one per run, joined", () => {
    const edges = levelGrindEdges(level.obstacles);
    const ids = new Set(edges.map((e) => e.id));
    expect(ids.size).toBe(edges.length); // unique
    const of = (id: string): string[] => obstacleGrindEdges(byId(id)).map((e) => e.id);
    expect(of("big-stairs")).toEqual([
      "big-stairs:hubba-flat",
      "big-stairs:hubba",
      "big-stairs:hubba-flat-minus-z",
      "big-stairs:hubba-minus-z",
      "big-stairs:handrail",
    ]);
    expect(of("funbox")).toEqual([
      "funbox:ledge+z",
      "funbox:top-rail",
      "funbox:bank-rail-0",
      "funbox:bank-rail-1",
    ]);
    expect(of("kinked-rail")).toEqual([
      "kinked-rail:bar-0",
      "kinked-rail:bar-1",
      "kinked-rail:bar-2",
    ]);
    expect(of("bank-ledge")).toHaveLength(2);
    for (const id of ["long-ledge", "manual-pad-low", "manual-pad-high", "up-ledge"]) {
      expect(of(id)).toHaveLength(2);
    }
    expect(of("flat-bar")).toHaveLength(1);
    expect(of("qp-west")).toHaveLength(1);
    expect(of("qp-east")).toHaveLength(1);

    // Kinked rail: flat → down → flat, each segment starting where the last one ended.
    const kinked = obstacleGrindEdges(byId("kinked-rail"));
    for (let i = 0; i + 1 < kinked.length; i += 1) {
      const a = kinked[i];
      const b = kinked[i + 1];
      if (a === undefined || b === undefined) throw new Error("segments");
      expect(Vec3.distance(a.endM, b.startM)).toBeLessThan(1e-9);
    }
    const [top, down, bottom] = kinked;
    if (top === undefined || down === undefined || bottom === undefined) throw new Error("runs");
    expect(top.startM.y).toBeCloseTo(top.endM.y, 9);
    expect(bottom.startM.y).toBeCloseTo(bottom.endM.y, 9);
    expect(down.endM.y).toBeLessThan(down.startM.y - 0.4);
    // The kink sits right over the top nosing of the 3-stair, and the bottom flat starts
    // over its foot: the rail follows the nosings, 0.35 m above them.
    const small = byId("small-stairs");
    if (small.shape.kind !== "stairs") throw new Error("not stairs");
    expect(top.endM.x).toBeCloseTo(small.transform.positionM.x, 9);
    expect(top.endM.y).toBeCloseTo(stairsHeightM(small.shape) + S.kinkedRail.heightM, 9);
    expect(down.endM.x).toBeCloseTo(small.transform.positionM.x + stairsFootXM(small.shape), 9);
  });
});
