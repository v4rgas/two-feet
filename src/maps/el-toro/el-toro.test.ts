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
import { createElToroLevel, EL_TORO, elToroPlazaHeightM, elToroTerraceHeightM } from "./el-toro";
import { map } from "./map";

/*
 * EL TORO's layout (`?map=el-toro`, DESIGN.md): the 20-stair's dimensions and its two
 * handrails, the upper quad (a ≥ 14 m run-up, one seamless piece that buries the stairs'
 * own platform: ADR 0008), the walkway ramp back up, the courtyard's roll-out, the
 * secondary spots, and that it all fits a compact school block.
 */

const level = createElToroLevel();
const P = EL_TORO;
const BURY_M = WORLD_CONFIG.geometry.seamBuryM;
const QUAD_Y = elToroPlazaHeightM();

function byId(id: string): Obstacle {
  const o = level.obstacles.find((x) => x.id === id);
  if (o === undefined) throw new Error(`no obstacle ${id}`);
  return o;
}

function stairsOf(id: string): Obstacle & { shape: { kind: "stairs" } } {
  const o = byId(id);
  if (o.shape.kind !== "stairs") throw new Error("not stairs");
  return o as Obstacle & { shape: { kind: "stairs" } };
}

interface Box {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly minY: number;
  readonly maxY: number;
}

/** World-space bounds of an obstacle's pieces above the ground (y > 0). */
function footprint(o: Obstacle): Box {
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

/** Flat upward faces (normal straight up) of an obstacle, in the world: their height and box. */
function upwardFaces(o: Obstacle): { y: number; r: Box }[] {
  const out: { y: number; r: Box }[] = [];
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

/** Is any part of `o` (above the ground) inside the x/z box (and below `maxY`, if given)? */
function intrudes(o: Obstacle, minX: number, maxX: number, minZ: number, maxZ: number): boolean {
  const r = footprint(o);
  return r.maxX > minX && r.minX < maxX && r.maxZ > minZ && r.minZ < maxZ;
}

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
    const stairs = stairsOf("stairs").shape;
    expect(stairs.stepCount).toBe(20);
    expect(stairs.riseM).toBeCloseTo(0.165, 9);
    expect(stairs.runM).toBeCloseTo(0.3, 9);
    expect(stairsHeightM(stairs)).toBeCloseTo(3.3, 9);
    expect(stairsFootXM(stairs)).toBeCloseTo(6, 9);
    expect(stairs.widthM).toBe(4);
    // One tread box per step below the platform, each a rise lower than the last.
    const treads = obstacleGeometry(stairsOf("stairs")).pieces.filter(
      (p) =>
        p.surface === "ground" &&
        Math.min(...p.verticesM.map((v) => v.z)) >= -2 - 1e-9 &&
        Math.max(...p.verticesM.map((v) => v.z)) <= 2 + 1e-9,
    );
    const tops = treads.map((p) => Math.max(...p.verticesM.map((v) => v.y))).sort((a, b) => b - a);
    expect(tops).toHaveLength(20); // the platform + 19 treads
    for (let i = 0; i < 20; i += 1) {
      expect(tops[i] ?? 0).toBeCloseTo(3.3 - i * 0.165, 6);
    }
  });

  it("a handrail down each side, its top 0.38 m (vertically) above every nosing", () => {
    const stairs = stairsOf("stairs");
    const edges = obstacleGrindEdges(stairs);
    const a = stairsSlopeRad(stairs.shape);
    for (const [id, side] of [
      ["stairs:handrail", -1],
      ["stairs:handrail-plus-z", 1],
    ] as const) {
      const rail = edges.find((e) => e.id === id);
      if (rail === undefined) throw new Error(`no ${id}`);
      expect(rail.twoSided).toBe(true);
      expect(rail.startM.z).toBeCloseTo(side * (2 + P.stairs.handrail.offsetM), 9);
      const d = Vec3.sub(rail.endM, rail.startM);
      expect(Math.atan2(-d.y, d.x)).toBeCloseTo(a, 9);
      const topAt = (x: number): number => rail.startM.y + ((x - rail.startM.x) / d.x) * d.y;
      for (let i = 0; i < 20; i += 1) {
        expect(topAt(i * 0.3) - (3.3 - i * 0.165)).toBeCloseTo(0.38, 6);
      }
      // It starts at the top nosing (0.35 m over the quad, within the pop) and ends in the
      // air just past the foot, not diving into the ground.
      expect(topAt(0) - QUAD_Y).toBeLessThan(0.36);
      expect(rail.startM.x).toBeGreaterThan(-0.1);
      expect(rail.endM.x).toBeGreaterThan(6);
      expect(rail.endM.y).toBeGreaterThan(0.2);
    }
  });

  it("the upper quad: one seamless piece, ≥ 14 m of flat run-up to the lip at the top nosing, a clear push lane", () => {
    const plaza = byId("plaza");
    expect(plaza.shape.kind).toBe("funbox");
    expect(QUAD_Y).toBeCloseTo(3.33, 9);
    const top = upwardFaces(plaza).filter((f) => Math.abs(f.y - QUAD_Y) < 1e-9);
    expect(top).toHaveLength(1); // ONE flat top: no seam on the run-up
    const [face] = top;
    if (face === undefined) throw new Error("no top");
    expect(face.r.maxX).toBeCloseTo(0, 9); // the lip, over the top nosing
    expect(face.r.maxX - face.r.minX).toBeGreaterThanOrEqual(14);
    // The spawn: on the quad, 14 m behind the lip, between the stairs' sides, facing +X.
    const s = level.spawn;
    expect(s.positionM.y).toBeCloseTo(QUAD_Y, 9);
    expect(-s.positionM.x).toBeGreaterThanOrEqual(14);
    expect(s.positionM.x).toBeGreaterThan(face.r.minX + 1);
    expect(Math.abs(s.positionM.z)).toBeLessThan(1);
    expect(s.headingRad).toBe(0);
    // The push lane (the stairs' width and both handrail approaches) is clear up to the lip.
    for (const o of FEATURES) {
      if (o.id === "plaza" || o.id === "stairs") continue;
      expect(intrudes(o, s.positionM.x, 0, -2.7, 2.7), `${o.id} blocks the push lane`).toBe(false);
    }
  });

  it("seams (ADR 0008): each stair set's platform is buried ≥ seamBuryM under its deck, and the ramp's landing buries the quad's edge", () => {
    // Nothing else has a top face within the prediction distance of the quad's top, over it.
    for (const o of FEATURES) {
      if (o.id === "plaza") continue;
      for (const f of upwardFaces(o)) {
        const over =
          f.r.maxX > P.plaza.minXM &&
          f.r.minX < P.plaza.maxXM &&
          f.r.maxZ > P.plaza.minZM &&
          f.r.minZ < P.plaza.maxZM;
        if (!over) continue;
        const gap = Math.abs(QUAD_Y - f.y);
        expect(gap >= BURY_M, `${o.id} top at ${f.y} vs quad ${QUAD_Y}`).toBe(true);
      }
    }
    // The 20's platform stub lies inside the quad, its top 3 cm (> 2.5 cm) under it.
    const stub = upwardFaces(stairsOf("stairs")).find((f) => f.r.maxX <= 1e-9);
    expect(QUAD_Y - (stub?.y ?? 0)).toBeGreaterThanOrEqual(BURY_M);
    expect(stub?.r.minX ?? -99).toBeGreaterThan(P.plaza.minXM);
    // The 4-stair's platform stub, likewise, under the terrace (it goes down toward −X).
    const terraceY = elToroTerraceHeightM();
    const small = upwardFaces(stairsOf("small-stairs")).find(
      (f) => f.r.minX >= P.terrace.minXM - 1e-9,
    );
    expect(terraceY - (small?.y ?? 0)).toBeGreaterThanOrEqual(BURY_M);
    expect(small?.r.maxX ?? 99).toBeLessThan(P.terrace.maxXM);
    // The ramp's landing stands BURY_M+ over the quad and overlaps its +Z edge: you roll
    // off a 3 cm lip onto the quad, over no exposed edge.
    const ramp = upwardFaces(byId("ada-ramp")).find((f) => f.y > QUAD_Y);
    if (ramp === undefined) throw new Error("no ramp landing");
    expect(ramp.y - QUAD_Y).toBeGreaterThanOrEqual(BURY_M);
    expect(ramp.r.minZ).toBeLessThan(P.plaza.maxZM - 0.2);
    // Everything standing on the quad stands ON it (its bottom at the quad's top).
    for (const b of P.quad) expect(footprint(byId(b.id)).minY).toBeCloseTo(QUAD_Y, 9);
    expect(footprint(byId("lunch-table-1")).minY).toBeCloseTo(QUAD_Y, 9);
  });

  it("the way back up: a 10° walkway ramp along the quad's north wall, from the courtyard to an open landing", () => {
    const ramp = byId("ada-ramp");
    if (ramp.shape.kind !== "funbox") throw new Error("not a funbox");
    expect(ramp.shape.sides.plusX).toBe("bank");
    expect(ramp.shape.sides.minusZ).toBe("wall");
    expect(ramp.shape.bankAngleRad).toBeCloseTo((10 * Math.PI) / 180, 9);
    const r = footprint(ramp);
    // It runs along the quad's north side, its toe out in the courtyard past the stairs' foot.
    expect(r.minZ).toBeLessThan(P.plaza.maxZM);
    expect(r.minZ).toBeGreaterThan(P.plaza.maxZM - 0.5);
    expect(P.adaRamp.landing.maxXM + funboxBankRunM(ramp.shape)).toBeGreaterThan(6);
    // A guard rail down its outer side, out of reach of the pop (0.9 m).
    expect(obstacleGrindEdges(ramp).map((e) => e.id)).toContain("ada-ramp:bank-rail-0");
    // The landing opens onto the quad: nothing on the quad in front of it.
    const l = P.adaRamp.landing;
    for (const o of FEATURES) {
      if (["plaza", "ada-ramp", "building-back", "building-north"].includes(o.id)) continue;
      expect(intrudes(o, l.minXM, l.maxXM + 0.5, l.minZM - 1.5, l.maxZM), o.id).toBe(false);
    }
    // Its toe is clear: a lane in the courtyard to ride into it.
    const toeX = l.maxXM + funboxBankRunM(ramp.shape);
    for (const o of FEATURES) {
      if (o.id === "ada-ramp") continue;
      expect(intrudes(o, toeX, toeX + 6, l.minZM, l.maxZM), `${o.id} blocks the ramp`).toBe(false);
    }
  });

  it("the landing: ≥ 15 m of clear roll-out past the foot, then the fence line", () => {
    const foot = stairsFootXM(stairsOf("stairs").shape);
    for (const o of FEATURES) {
      if (o.id === "stairs") continue;
      expect(intrudes(o, foot, foot + 15, -3, 3), `${o.id} blocks the roll-out`).toBe(false);
    }
    const east = FEATURES.filter((o) => o.id.startsWith("fence-east-"));
    expect(east.length).toBeGreaterThan(3);
    for (const o of east) expect(footprint(o).minX).toBeGreaterThan(foot + 15);
  });

  it("the secondary spots: a 4-stair off the lower terrace, a planter ledge, a curb, lunch benches", () => {
    const small = stairsOf("small-stairs").shape;
    expect(small.stepCount).toBe(4);
    expect(stairsHeightM(small)).toBeCloseTo(0.66, 9);
    // It goes down toward −X, with a clear landing strip ahead of it.
    const nosing = byId("small-stairs").transform.positionM.x;
    const smallFoot = nosing - stairsFootXM(small);
    const z0 = P.terrace.minZM;
    const z1 = P.terrace.maxZM;
    for (const o of FEATURES) {
      if (o.id === "small-stairs") continue;
      expect(intrudes(o, smallFoot - 8, smallFoot, z0, z1), `${o.id} blocks the 4-stair`).toBe(
        false,
      );
    }
    const terrace = byId("terrace");
    if (terrace.shape.kind !== "funbox") throw new Error("not a funbox");
    expect(terrace.shape.sides.plusZ).toBe("bank"); // rolled up onto from the courtyard
    const edgesOf = (id: string): string[] => obstacleGrindEdges(byId(id)).map((e) => e.id);
    expect(edgesOf("planter-ledge")).toHaveLength(2);
    expect(footprint(byId("planter-ledge")).maxY).toBeLessThanOrEqual(0.4);
    expect(footprint(byId("curb")).maxY).toBeLessThanOrEqual(0.16);
    for (const id of ["lunch-bench-1a", "lunch-bench-1b", "lunch-bench-2a", "lunch-bench-2b"]) {
      const b = footprint(byId(id));
      expect(b.maxY - b.minY, id).toBeLessThanOrEqual(0.45);
    }
    expect(edgesOf("plaza")).toEqual([]);
  });

  it("is compact: every feature fits a ≈ 43 × 30 m school block", () => {
    const boxes = FEATURES.map(footprint);
    const w = Math.max(...boxes.map((b) => b.maxX)) - Math.min(...boxes.map((b) => b.minX));
    const d = Math.max(...boxes.map((b) => b.maxZ)) - Math.min(...boxes.map((b) => b.minZ));
    expect(w).toBeLessThanOrEqual(43);
    expect(d).toBeLessThanOrEqual(30);
  });

  it("no two obstacles overlap, apart from each stair set in its deck and the ramp's landing on the quad", () => {
    const stacked = new Set(["plaza|stairs", "plaza|ada-ramp", "terrace|small-stairs"]);
    const boxes = FEATURES.map((o) => ({ id: o.id, r: footprint(o) }));
    const e = 1e-6;
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        if (a === undefined || b === undefined) continue;
        if (stacked.has(`${a.id}|${b.id}`) || stacked.has(`${b.id}|${a.id}`)) continue;
        const overlap =
          a.r.maxX > b.r.minX + e &&
          b.r.maxX > a.r.minX + e &&
          a.r.maxZ > b.r.minZ + e &&
          b.r.maxZ > a.r.minZ + e &&
          a.r.maxY > b.r.minY + e &&
          b.r.maxY > a.r.minY + e;
        expect(overlap, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    }
  });
});

describe("El Toro dressing (fence, banners, graffiti)", () => {
  const fence = FEATURES.filter((o) => o.id.startsWith("fence-"));
  const sponsorOf = (o: Obstacle): string | null =>
    o.shape.kind === "barrier" ? (o.shape.banner?.sponsorId ?? null) : null;
  const facing = (o: Obstacle): Vec3 => Transform.toWorldDirection(o.transform, Vec3.UNIT_Z);
  const isSponsor = (o: Obstacle): boolean => ["bipbop", "v4rgas"].includes(sponsorOf(o) ?? "");

  it("the fence line is barriers on the east, north and south, never grindable", () => {
    for (const side of ["east", "north", "south"]) {
      const run = fence.filter((o) => o.id.startsWith(`fence-${side}-`));
      expect(run.length, side).toBeGreaterThan(3);
    }
    for (const o of fence) {
      expect(o.shape.kind).toBe("barrier");
      expect(obstacleGrindEdges(o)).toEqual([]);
      const r = footprint(o);
      expect(r.minX).toBeGreaterThanOrEqual(P.fence.bounds.minXM - 1e-9);
      expect(r.maxX).toBeLessThanOrEqual(P.fence.bounds.maxXM + 1e-9);
      expect(r.minZ).toBeGreaterThanOrEqual(P.fence.bounds.minZM - 1e-9);
      expect(r.maxZ).toBeLessThanOrEqual(P.fence.bounds.maxZM + 1e-9);
    }
  });

  it("BipBop Labs and v4rgas side by side on the east fence, square to the drop, and again on the north fence", () => {
    const east = fence.filter((o) => o.id.startsWith("fence-east-") && isSponsor(o));
    expect(east.map(sponsorOf).sort()).toEqual(["bipbop", "v4rgas"]);
    for (const o of east) {
      expect(Math.abs(o.transform.positionM.z)).toBeLessThan(4); // framed by the drop
      expect(facing(o).x).toBeCloseTo(-1, 9); // facing the stairs
    }
    const north = fence.filter((o) => o.id.startsWith("fence-north-") && isSponsor(o));
    expect(north.map(sponsorOf).sort()).toEqual(["bipbop", "v4rgas"]);
    const ledge = footprint(byId("planter-ledge"));
    for (const o of north) {
      const r = footprint(o);
      expect(Math.min(r.maxX, ledge.maxX) - Math.max(r.minX, ledge.minX), o.id).toBeGreaterThan(1);
    }
    // Not wall-to-wall logos, and only the real sponsors (no house banners).
    const bannered = fence.filter((o) => sponsorOf(o) !== null);
    expect(bannered.length).toBeLessThanOrEqual(fence.length / 2);
    expect(bannered.every(isSponsor)).toBe(true);
  });

  it("banner boards on the retaining walls beside the stairs face the courtyard, clear of the drop", () => {
    const boards = FEATURES.filter((o) => o.id.startsWith("wall-banner-"));
    expect(boards.map(sponsorOf).sort()).toEqual(["bipbop", "v4rgas"]);
    for (const o of boards) {
      const r = footprint(o);
      expect(facing(o).x).toBeCloseTo(1, 9);
      expect(r.minX).toBeGreaterThanOrEqual(-1e-9); // on the wall's face (x = 0)
      expect(Math.min(Math.abs(r.minZ), Math.abs(r.maxZ))).toBeGreaterThan(2.7); // off the rails
      expect(r.maxY).toBeLessThan(QUAD_Y); // below the lip
    }
  });

  it("carries a couple of graffiti pieces, on walls only", () => {
    const pieces = level.graffiti ?? [];
    expect(pieces.length).toBeGreaterThanOrEqual(2);
    expect(pieces.length).toBeLessThanOrEqual(4);
    for (const g of pieces) expect(Math.abs(g.normal.y), g.pieceId).toBeLessThan(1e-9);
  });
});
