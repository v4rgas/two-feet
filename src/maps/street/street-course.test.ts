import { describe, expect, it } from "vitest";
import type { Obstacle } from "../../contexts/world";
import {
  levelGrindEdges,
  obstacleGeometry,
  obstacleGrindEdges,
  stairsFootXM,
  stairsHeightM,
} from "../../contexts/world";
import { Transform, Vec3 } from "../../shared";
import { map } from "./map";
import { STREET_CONFIG } from "./street.config";
import { createStreetCourseLevel } from "./street-course";

/*
 * The street course layout (`?map=street`): obstacles don't overlap, every drop has a
 * clear roll-out, the spawn has a run-up, every grind edge is there, and the heights stay
 * within the ≈ 0.45 m pop from where you take off.
 */

const level = createStreetCourseLevel();
const S = STREET_CONFIG;

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

/** Everything above the ground slab: the features and the barriers round them. */
const STANDING = level.obstacles.filter((o) => o.id !== "ground");
/** The skateable features (the barriers and the deck fence are dressing, tested below). */
const FEATURES = STANDING.filter((o) => o.shape.kind !== "barrier");
const BARRIERS = STANDING.filter((o) => o.shape.kind === "barrier");

/**
 * Nothing (but `except`) stands in the lane x ∈ [x0, x0 + lengthM], z ∈ [z0, z1]: no
 * feature and no barrier.
 */
function expectClear(
  what: string,
  x0: number,
  lengthM: number,
  z0: number,
  z1: number,
  except: readonly string[],
): void {
  for (const o of STANDING) {
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

  it("fits in about 37 × 22 m, ≥ 1 m inside the planned perimeter, the quarter pipe at the east end", () => {
    const rects = FEATURES.map(footprint);
    const minX = Math.min(...rects.map((r) => r.minX));
    const maxX = Math.max(...rects.map((r) => r.maxX));
    const minZ = Math.min(...rects.map((r) => r.minZ));
    const maxZ = Math.max(...rects.map((r) => r.maxZ));
    expect(maxX - minX).toBeGreaterThan(36);
    expect(maxX - minX).toBeLessThan(40);
    expect(maxZ - minZ).toBeGreaterThan(21);
    expect(maxZ - minZ).toBeLessThan(26);
    const p = S.perimeter;
    expect(minX - p.minXM).toBeGreaterThanOrEqual(1 - 1e-9);
    expect(p.maxXM - maxX).toBeGreaterThanOrEqual(1 - 1e-9);
    expect(minZ - p.minZM).toBeGreaterThanOrEqual(1 - 1e-9);
    expect(p.maxZM - maxZ).toBeGreaterThanOrEqual(1 - 1e-9);
    const east = footprint(byId("qp-east"));
    expect(east.maxX).toBeCloseTo(maxX, 6);
  });

  it("features are within a push or two: every feature has a neighbour ≤ 7 m away", () => {
    const rects = FEATURES.map((o) => ({ id: o.id, r: footprint(o) }));
    const gap = (a: Rect, b: Rect): number =>
      Math.hypot(
        Math.max(0, a.minX - b.maxX, b.minX - a.maxX),
        Math.max(0, a.minZ - b.maxZ, b.minZ - a.maxZ),
      );
    for (const a of rects) {
      const nearest = Math.min(...rects.filter((b) => b !== a).map((b) => gap(a.r, b.r)));
      expect(nearest, `${a.id} is isolated`).toBeLessThanOrEqual(7);
    }
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

  it("leaves at least 4 m of clear roll-out after every feature (6 m after the stairs and the gap)", () => {
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

    // The two manual pads are a line: 2 m of flat between them (a manual off one, onto the next).
    const lowPad = footprint(byId("manual-pad-low"));
    expectClear("manual-pad-low", lowPad.maxX, 2, lowPad.minZ, lowPad.maxZ, ["manual-pad-low"]);
    for (const id of [
      "hip",
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
    // The hubbas: 0.28 m above the landing (like the park's).
    expect(S.bigStairs.hubba.heightM).toBeLessThanOrEqual(0.3);
    // The handrail: 0.38 m square to the nosings, from over the top nosing to over the
    // foot. Its top end starts past the nosing (never back over the landing) within an
    // ollie of the landing, and its low end stays clear of the ground.
    expect(S.bigStairs.handrail.heightM).toBeLessThanOrEqual(0.4);
    const rail = levelGrindEdges(level.obstacles).find((e) => e.id === "big-stairs:handrail");
    const landingY = S.bigStairs.stepCount * S.bigStairs.riseM;
    expect(rail?.startM.x).toBeGreaterThan(S.bigStairs.xM);
    expect((rail?.startM.y ?? Infinity) - landingY).toBeLessThan(0.4);
    expect(rail?.endM.y).toBeGreaterThan(0.3);
    // The bar piece (local frame): the grindable piece down the middle (z ≈ 0).
    const bar = obstacleGeometry(byId("big-stairs")).pieces.find(
      (p) => p.surface === "grindable" && p.verticesM.every((v) => Math.abs(v.z) < 0.1),
    );
    const barTopY = Math.max(...(bar?.verticesM ?? []).map((v) => v.y));
    expect(barTopY - landingY).toBeLessThan(0.4);
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

describe("street course dressing (barriers, banners, graffiti)", () => {
  const P = S.perimeter;
  const ring = BARRIERS.filter((o) => o.id.startsWith("barrier-"));
  const sponsorOf = (o: Obstacle): string | null =>
    o.shape.kind === "barrier" ? (o.shape.banner?.sponsorId ?? null) : null;
  const overlaps = (a: Rect, b: Rect): boolean =>
    a.maxX > b.minX + 1e-6 &&
    b.maxX > a.minX + 1e-6 &&
    a.maxZ > b.minZ + 1e-6 &&
    b.maxZ > a.minZ + 1e-6;

  it("rings the course inside the perimeter, clear of every feature, with the entry gaps open", () => {
    expect(ring.length).toBeGreaterThan(20);
    for (const o of ring) {
      const r = footprint(o);
      expect(r.minX).toBeGreaterThanOrEqual(P.minXM - 1e-9);
      expect(r.maxX).toBeLessThanOrEqual(P.maxXM + 1e-9);
      expect(r.minZ).toBeGreaterThanOrEqual(P.minZM - 1e-9);
      expect(r.maxZ).toBeLessThanOrEqual(P.maxZM + 1e-9);
      expect(obstacleGrindEdges(o), `${o.id} is never grindable`).toEqual([]);
      for (const f of FEATURES) {
        expect(overlaps(r, footprint(f)), `${o.id} overlaps ${f.id}`).toBe(false);
      }
    }
    for (const gap of P.openings) {
      const alongX = gap.side === "north" || gap.side === "south";
      for (const o of ring.filter((b) => b.id.includes(`-${gap.side}-`))) {
        const r = footprint(o);
        const lo = alongX ? r.minX : r.minZ;
        const hi = alongX ? r.maxX : r.maxZ;
        const blocks =
          hi > gap.centerM - gap.widthM / 2 + 1e-6 && lo < gap.centerM + gap.widthM / 2 - 1e-6;
        expect(blocks, `${o.id} closes the ${gap.side} gap`).toBe(false);
      }
    }
  });

  it("leaves a flat run-up of ≥ 4.5 m west of both stair decks' roll-up slopes", () => {
    const westFace = Math.max(
      ...ring.filter((o) => o.id.includes("-west-")).map((o) => footprint(o).maxX),
    );
    for (const id of ["big-stairs", "small-stairs"]) {
      expect(footprint(byId(id)).minX - westFace, id).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("puts BipBop Labs and v4rgas on their prime spots, each flanked by plain wall", () => {
    const fence = BARRIERS.filter((o) => o.id.startsWith("qp-deck-fence-"));
    const bipbopDeck = fence.filter((o) => sponsorOf(o) === "bipbop");
    expect(bipbopDeck).toHaveLength(1);
    const deck = bipbopDeck[0] as Obstacle;
    // On the quarter pipe's deck (so it shows above it), centred on the main line, facing −X.
    expect(deck.transform.positionM.y).toBeCloseTo(S.quarterPipe.heightM, 9);
    expect(deck.transform.positionM.z).toBeCloseTo(0, 9);
    expect(Transform.toWorldDirection(deck.transform, Vec3.UNIT_Z).x).toBeCloseTo(-1, 9);
    const qp = footprint(byId("qp-east"));
    expect(footprint(deck).maxX).toBeLessThanOrEqual(qp.maxX + 1e-9);
    expect(footprint(deck).minX).toBeGreaterThan(qp.maxX - S.quarterPipe.deckDepthM / 2);

    const spanX = (o: Obstacle) => footprint(o);
    const onSide = (side: string, sponsor: string) =>
      ring.filter((o) => o.id.includes(`-${side}-`) && sponsorOf(o) === sponsor);
    const southBipbop = onSide("south", "bipbop");
    expect(southBipbop).toHaveLength(1);
    const ledge = footprint(byId("long-ledge"));
    const sb = spanX(southBipbop[0] as Obstacle);
    expect(Math.min(sb.maxX, ledge.maxX) - Math.max(sb.minX, ledge.minX)).toBeGreaterThan(3);
    const northV4 = onSide("north", "v4rgas");
    expect(northV4).toHaveLength(1);
    const pad = footprint(byId("manual-pad-high"));
    const nv = spanX(northV4[0] as Obstacle);
    expect(Math.min(nv.maxX, pad.maxX) - Math.max(nv.minX, pad.minX)).toBeGreaterThan(3);
    const westV4 = onSide("west", "v4rgas");
    expect(westV4).toHaveLength(1);
    const wv = spanX(westV4[0] as Obstacle);
    expect(wv.minZ).toBeLessThan(S.bigStairs.zM + S.bigStairs.widthM / 2);
    expect(wv.maxZ).toBeGreaterThan(S.bigStairs.zM - S.bigStairs.widthM / 2);

    // Not wall-to-wall logos: at most a third of the ring carries a banner, and every
    // sponsor banner has plain wall on both sides.
    expect(ring.filter((o) => sponsorOf(o) !== null).length).toBeLessThanOrEqual(ring.length / 3);
    ring.forEach((o, i) => {
      const id = sponsorOf(o);
      if (id !== "bipbop" && id !== "v4rgas") return;
      const side = o.id.split("-").at(-2);
      for (const n of [ring[i - 1], ring[i + 1]]) {
        if (n === undefined || n.id.split("-").at(-2) !== side) continue;
        expect(sponsorOf(n), `${n.id} beside ${o.id}`).toBeNull();
      }
    });
  });

  it("carries a couple of graffiti pieces, on walls only (never a riding surface)", () => {
    const pieces = level.graffiti ?? [];
    expect(pieces.length).toBeGreaterThanOrEqual(2);
    expect(pieces.length).toBeLessThanOrEqual(4);
    for (const g of pieces) {
      expect(Math.abs(g.normal.y), g.pieceId).toBeLessThan(1e-9);
      expect(g.positionM.y).toBeGreaterThan(g.sizeM * 0.2);
    }
  });
});

describe("street map definition", () => {
  it("is the `street` map, its spawn the level's", () => {
    expect(map.id).toBe("street");
    expect(map.tutorial).toBeUndefined();
    const built = map.createLevel();
    expect(built.id).toBe("street");
    expect(built.spawn).toEqual(map.spawn);
    expect(built.obstacles.map((o) => o.id)).toEqual(level.obstacles.map((o) => o.id));
  });
});
