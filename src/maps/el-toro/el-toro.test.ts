import { describe, expect, it } from "vitest";
import type { Obstacle } from "../../contexts/world";
import {
  funboxBankRunM,
  obstacleGeometry,
  obstacleGrindEdges,
  stairsFootXM,
  stairsHeightM,
  stairsSlopeRad,
  WORLD_CONFIG,
} from "../../contexts/world";
import { Transform, Vec3 } from "../../shared";
import { createElToroLevel, EL_TORO, elToroPlazaHeightM } from "./el-toro";
import { map } from "./map";

/*
 * EL TORO's layout (`?map=el-toro`): the 20-stair's dimensions, the handrail's height
 * over the nosings, the plaza (a ≥ 12 m run-up, one seamless piece that buries the
 * stairs' own platform: ADR 0008), the way back up, and ≥ 15 m of clear roll-out.
 */

const level = createElToroLevel();
const P = EL_TORO;
const BURY_M = WORLD_CONFIG.geometry.seamBuryM;

function byId(id: string): Obstacle {
  const o = level.obstacles.find((x) => x.id === id);
  if (o === undefined) throw new Error(`no obstacle ${id}`);
  return o;
}

function stairsOf(): Obstacle & { shape: { kind: "stairs" } } {
  const o = byId("stairs");
  if (o.shape.kind !== "stairs") throw new Error("not stairs");
  return o as Obstacle & { shape: { kind: "stairs" } };
}

interface Rect {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly minY: number;
  readonly maxY: number;
}

/** World-space bounds of an obstacle's pieces above the ground (y > 0). */
function footprint(o: Obstacle): Rect {
  const up = obstacleGeometry(o)
    .pieces.flatMap((p) => p.verticesM.map((v) => Transform.toWorldPoint(o.transform, v)))
    .filter((p) => p.y > 1e-6);
  const xs = up.map((p) => p.x);
  const zs = up.map((p) => p.z);
  const ys = up.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

/** Flat upward faces (normal straight up) of an obstacle, in the world: their height and x/z box. */
function upwardFaces(o: Obstacle): { y: number; r: Rect }[] {
  const out: { y: number; r: Rect }[] = [];
  for (const piece of obstacleGeometry(o).pieces) {
    const w = piece.verticesM.map((v) => Transform.toWorldPoint(o.transform, v));
    for (const face of piece.faces) {
      const pts = face.indices.map((i) => w[i] ?? Vec3.ZERO);
      const [a, b, c] = pts;
      if (a === undefined || b === undefined || c === undefined) continue;
      const n = Vec3.normalize(Vec3.cross(Vec3.sub(b, a), Vec3.sub(c, a)));
      if (n.y < 1 - 1e-9) continue;
      const xs = pts.map((p) => p.x);
      const zs = pts.map((p) => p.z);
      out.push({
        y: a.y,
        r: {
          minX: Math.min(...xs),
          maxX: Math.max(...xs),
          minZ: Math.min(...zs),
          maxZ: Math.max(...zs),
          minY: a.y,
          maxY: a.y,
        },
      });
    }
  }
  return out;
}

const FEATURES = level.obstacles.filter((o) => o.id !== "ground");

describe("El Toro", () => {
  it("is the `el-toro` level, and its map definition says so", () => {
    expect(level.id).toBe("el-toro");
    expect(level.name).toBe("El Toro");
    expect(map.id).toBe("el-toro");
    expect(map.name).toBe("El Toro");
    expect(map.description).toBe("20 stairs. Good luck.");
    expect(map.createLevel().obstacles).toHaveLength(level.obstacles.length);
    expect(map.spawn).toEqual(level.spawn);
  });

  it("has 20 stairs: 0.165 m rise, 0.30 m run — a 3.3 m drop over 6 m, 4 m wide", () => {
    const stairs = stairsOf().shape;
    expect(stairs.stepCount).toBe(20);
    expect(stairs.riseM).toBeCloseTo(0.165, 9);
    expect(stairs.runM).toBeCloseTo(0.3, 9);
    expect(stairsHeightM(stairs)).toBeCloseTo(3.3, 9);
    expect(stairsFootXM(stairs)).toBeCloseTo(6, 9);
    expect(stairs.widthM).toBe(4);
    // One tread box per step below the platform, each a rise lower than the last.
    const treads = obstacleGeometry(stairsOf()).pieces.filter(
      (p) =>
        Math.min(...p.verticesM.map((v) => v.z)) >= -2 - 1e-9 &&
        Math.max(...p.verticesM.map((v) => v.z)) <= 2 + 1e-9,
    );
    const tops = treads.map((p) => Math.max(...p.verticesM.map((v) => v.y))).sort((a, b) => b - a);
    expect(tops).toHaveLength(20); // the platform + 19 treads
    for (let i = 0; i < 20; i += 1) {
      expect(tops[i] ?? 0).toBeCloseTo(3.3 - i * 0.165, 6);
    }
  });

  it("the handrail runs down the −Z side, its top 0.38 m (vertically) above every nosing", () => {
    const stairs = stairsOf();
    const edges = obstacleGrindEdges(stairs);
    const rail = edges.find((e) => e.id === "stairs:handrail");
    if (rail === undefined) throw new Error("no handrail edge");
    expect(rail.twoSided).toBe(true);
    expect(rail.startM.z).toBeCloseTo(-2 - P.stairs.handrail.offsetM, 9);
    const a = stairsSlopeRad(stairs.shape);
    const d = Vec3.sub(rail.endM, rail.startM);
    expect(Math.atan2(-d.y, d.x)).toBeCloseTo(a, 9);
    const topAt = (x: number): number => rail.startM.y + ((x - rail.startM.x) / d.x) * d.y;
    // Every nosing i sits at (i·run, h − i·rise); the bar top is 0.38 m above it.
    for (let i = 0; i < 20; i += 1) {
      const nosingY = 3.3 - i * 0.165;
      expect(topAt(i * 0.3) - nosingY).toBeCloseTo(0.38, 6);
    }
    // It starts at the top nosing (0.35 m over the plaza, within the pop) and ends in the
    // air just past the foot, not diving into the ground.
    expect(topAt(0) - elToroPlazaHeightM()).toBeLessThan(0.36);
    expect(rail.startM.x).toBeGreaterThan(-0.1);
    expect(rail.endM.x).toBeGreaterThan(6);
    expect(rail.endM.y).toBeGreaterThan(0.2);
  });

  it("the plaza: one seamless piece (plus toe fillets), ≥ 12 m of flat run-up to the lip at the top nosing", () => {
    const plaza = byId("plaza");
    expect(plaza.shape.kind).toBe("funbox");
    if (plaza.shape.kind !== "funbox") throw new Error("not a funbox");
    const h = elToroPlazaHeightM();
    expect(h).toBeCloseTo(3.33, 9);
    const top = upwardFaces(plaza).filter((f) => Math.abs(f.y - h) < 1e-9);
    expect(top).toHaveLength(1); // ONE flat top: no seam on the run-up
    const [face] = top;
    if (face === undefined) throw new Error("no top");
    // Its +X edge is the lip: exactly over the top nosing.
    expect(face.r.maxX).toBeCloseTo(0, 9);
    expect(face.r.maxX - face.r.minX).toBeGreaterThanOrEqual(12);
    // The spawn: on the plaza, ≥ 12 m behind the lip, between the stairs' sides, facing +X.
    const s = level.spawn;
    expect(s.positionM.y).toBeCloseTo(h, 9);
    expect(-s.positionM.x).toBeGreaterThanOrEqual(12);
    expect(s.positionM.x).toBeGreaterThan(face.r.minX + 1);
    expect(Math.abs(s.positionM.z)).toBeLessThan(1);
    expect(s.headingRad).toBe(0);
    // The push lane down the middle (the stairs' width, plus the handrail approach) is clear.
    for (const o of FEATURES) {
      if (o.id === "plaza" || o.id === "stairs") continue;
      const r = footprint(o);
      const blocks = r.maxX > s.positionM.x && r.minX < 0 && r.maxZ > -2.3 && r.minZ < 2;
      expect(blocks, `${o.id} blocks the push lane`).toBe(false);
    }
  });

  it("seams (ADR 0008): the stairs' own platform is buried ≥ seamBuryM under the plaza; nothing else is flush with its top", () => {
    const h = elToroPlazaHeightM();
    for (const o of FEATURES) {
      if (o.id === "plaza") continue;
      for (const f of upwardFaces(o)) {
        // No other top face within the prediction distance of the plaza's top, over it.
        const overPlaza = f.r.maxX > -P.plaza.lengthM && f.r.minX < 0;
        if (!overPlaza) continue;
        const gap = h - f.y;
        expect(gap >= BURY_M || gap < -BURY_M, `${o.id} top at ${f.y} vs plaza ${h}`).toBe(true);
      }
    }
    // The stairs' platform stub lies inside the plaza, its top 3 cm (> 2.5 cm) under it.
    const stub = upwardFaces(stairsOf()).find((f) => f.r.maxX <= 1e-9);
    expect(stub).toBeDefined();
    expect(h - (stub?.y ?? 0)).toBeGreaterThanOrEqual(BURY_M);
    expect(stub?.r.minX ?? -99).toBeGreaterThan(-P.plaza.lengthM);
    expect(stub?.r.minZ ?? -99).toBeGreaterThan(P.plaza.minZM);
    expect(stub?.r.maxZ ?? 99).toBeLessThan(P.plaza.maxZM);
    // The planters stand ON the plaza (their bottoms at its top), the first tread is below the lip.
    for (const id of ["top-planter", "edge-planter"]) {
      expect(footprint(byId(id)).minY).toBeCloseTo(h, 9);
    }
  });

  it("a way back up: long 10° banks from the ground to the plaza on −X (the roll-up) and +Z", () => {
    const plaza = byId("plaza");
    if (plaza.shape.kind !== "funbox") throw new Error("not a funbox");
    expect(plaza.shape.sides.minusX).toBe("bank");
    expect(plaza.shape.sides.plusZ).toBe("bank");
    expect(plaza.shape.sides.plusX).toBe("wall"); // the drop
    expect(plaza.shape.bankAngleRad).toBeCloseTo((10 * Math.PI) / 180, 9);
    const r = footprint(plaza);
    // ≈ 18.9 m of bank from the ground to the crest (its rounded toe fillet reaches further).
    const run = funboxBankRunM(plaza.shape);
    expect(run).toBeCloseTo(18.9, 1);
    expect(-P.plaza.lengthM - r.minX).toBeGreaterThan(run - 0.5);
    expect(r.maxZ - P.plaza.maxZM).toBeGreaterThan(run - 0.5);
    // Nothing stands at the foot of the +Z bank (a clear lane to ride up it).
    for (const o of FEATURES) {
      if (o.id === "plaza") continue;
      const f = footprint(o);
      const blocks =
        f.maxX > -P.plaza.lengthM && f.minX < 0 && f.maxZ > r.maxZ - 2 && f.minZ < r.maxZ + 4;
      expect(blocks, `${o.id} blocks the +Z bank`).toBe(false);
    }
  });

  it("the landing: ≥ 15 m of clear roll-out past the foot, low walls and planters (≤ 0.55 m) around", () => {
    const foot = stairsFootXM(stairsOf().shape);
    for (const o of FEATURES) {
      if (o.id === "stairs") continue;
      const r = footprint(o);
      const blocks = r.maxX > foot && r.minX < foot + 15 && r.maxZ > -3 && r.minZ < 3;
      expect(blocks, `${o.id} blocks the roll-out`).toBe(false);
    }
    const low = FEATURES.filter((o) => o.shape.kind === "ledge");
    expect(low.length).toBeGreaterThanOrEqual(5);
    for (const o of low) {
      const r = footprint(o);
      expect(r.maxY - r.minY, o.id).toBeLessThanOrEqual(0.55 + 1e-9);
    }
  });

  it("no two obstacles overlap, apart from the stairs in the plaza and the planters standing on it", () => {
    const stacked = new Set(["plaza|stairs", "plaza|top-planter", "plaza|edge-planter"]);
    const rects = FEATURES.map((o) => ({ id: o.id, r: footprint(o) }));
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        const a = rects[i];
        const b = rects[j];
        if (a === undefined || b === undefined) continue;
        if (stacked.has(`${a.id}|${b.id}`) || stacked.has(`${b.id}|${a.id}`)) continue;
        const overlap =
          a.r.maxX > b.r.minX + 1e-6 &&
          b.r.maxX > a.r.minX + 1e-6 &&
          a.r.maxZ > b.r.minZ + 1e-6 &&
          b.r.maxZ > a.r.minZ + 1e-6;
        expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });

  it("grind edges: the handrail and the planters' edges; the plaza's walls have none", () => {
    const ids = level.obstacles.flatMap((o) => obstacleGrindEdges(o).map((e) => e.id));
    expect(ids).toContain("stairs:handrail");
    expect(ids.filter((id) => id.startsWith("top-planter:"))).toHaveLength(2);
    expect(ids.filter((id) => id.startsWith("plaza:"))).toEqual([]);
    // The top planter is a low ledge: grindable from the plaza with the pop.
    const planter = footprint(byId("top-planter"));
    expect(planter.maxY - elToroPlazaHeightM()).toBeLessThanOrEqual(0.4 + 1e-9);
  });
});
