import { describe, expect, it } from "vitest";
import { Quat, Transform, Vec3 } from "../../../shared";
import { WORLD_CONFIG } from "../world.config";
import {
  closestOnEdge,
  grindEdgesNear,
  levelGrindEdges,
  nearestGrindEdge,
  obstacleGrindEdges,
} from "./grind-edges";
import { Level } from "./level";
import type { Obstacle } from "./obstacle";
import { ObstacleShape } from "./obstacle";
import { obstacleGeometry, stairsFootXM, stairsHeightM, stairsSlopeRad } from "./obstacle-geometry";

const G = WORLD_CONFIG.geometry;

/** A 5-stair with a hubba (+Z) and a handrail (−Z): the stairs kind's fixture. */
const STAIRS = {
  stepCount: 5,
  riseM: 0.16,
  runM: 0.32,
  widthM: 3.5,
  topDepthM: 8,
  hubba: { widthM: 0.45, heightM: 0.35, edgeRadiusM: 0.02, flatTopM: 0.9 },
  handrail: { heightM: 0.8, barRadiusM: 0.024, offsetM: 0.3 },
} as const;

/**
 * One of every grindable kind, placed on a ground point (a fixture, not a map): the
 * stairs at the origin, a ledge at (19, 1.8), a round flat rail at (19, −1.8), and two
 * quarter pipes facing each other across a 4 m flat bottom at z = −12.
 */
function kindsLevel(): Level {
  const qp = ObstacleShape.quarterPipe({
    radiusM: 2.2,
    heightM: 1.3,
    widthM: 5,
    deckDepthM: 1.2,
    copingRadiusM: 0.03,
  });
  const o = (
    id: string,
    surface: Obstacle["surface"],
    transform: Transform,
    shape: Obstacle["shape"],
  ): Obstacle => ({
    id,
    name: id,
    surface,
    transform,
    shape,
  });
  return Level.create({
    id: "kinds",
    name: "Kinds",
    obstacles: [
      o("stairs", "ground", at(0, 0), ObstacleShape.stairs(STAIRS)),
      o(
        "ledge",
        "ledge",
        at(19, 1.8),
        ObstacleShape.ledge({ lengthM: 4, depthM: 0.5, heightM: 0.4, edgeChamferM: 0.03 }),
      ),
      o(
        "flat-rail",
        "grindable",
        at(19, -1.8),
        ObstacleShape.rail({ lengthM: 4, heightM: 0.35, barRadiusM: 0.024, profile: "round" }),
      ),
      o("qp-east", "ramp", at(12, -12), qp),
      o("qp-west", "ramp", at(8, -12, Math.PI), qp),
    ],
    spawn: { positionM: Vec3.ZERO, headingRad: 0 },
  });
}

function at(x: number, z: number, headingRad = 0): Transform {
  return Transform.create(Vec3.create(x, 0, z), Quat.fromAxisAngle(Vec3.UNIT_Y, headingRad));
}

function obstacle(shape: Obstacle["shape"], transform = at(0, 0), surface = "ground"): Obstacle {
  return { id: "o", name: "o", surface: surface as Obstacle["surface"], transform, shape };
}

/** Highest vertex y of the obstacle's pieces of `surface` within 6 cm of world x (a Z extrusion). */
function pieceTopNearX(o: Obstacle, x: number, surface: string): number {
  let best = Number.NEGATIVE_INFINITY;
  for (const piece of obstacleGeometry(o).pieces) {
    if (piece.surface !== surface) continue;
    for (const v of piece.verticesM) {
      const w = Transform.toWorldPoint(o.transform, v);
      if (Math.abs(w.x - x) < 0.06) best = Math.max(best, w.y);
    }
  }
  return best;
}

function close(a: Vec3, b: Vec3, eps = 1e-9): boolean {
  return Vec3.distance(a, b) <= eps;
}

describe("grind edges", () => {
  it("a rail has one two-sided edge along the top of its bar", () => {
    const rail = ObstacleShape.rail({
      lengthM: 4,
      heightM: 0.35,
      barRadiusM: 0.024,
      profile: "round",
    });
    const [edge, ...rest] = obstacleGrindEdges(obstacle(rail, at(19, -1.8)));
    expect(rest).toEqual([]);
    expect(edge?.surface).toBe("grindable");
    expect(edge?.twoSided).toBe(true);
    expect(edge?.halfWidthM).toBe(0.024);
    expect(close(edge?.startM ?? Vec3.ZERO, Vec3.create(17, 0.35, -1.8))).toBe(true);
    expect(close(edge?.endM ?? Vec3.ZERO, Vec3.create(21, 0.35, -1.8))).toBe(true);
    expect(Math.abs(edge?.outwardNormal.z ?? 0)).toBeCloseTo(1);
  });

  it("the rail edge follows the obstacle's heading", () => {
    const rail = ObstacleShape.rail({
      lengthM: 2,
      heightM: 0.3,
      barRadiusM: 0.02,
      profile: "square",
    });
    const [edge] = obstacleGrindEdges(obstacle(rail, at(0, 0, Math.PI / 2)));
    // Heading π/2: local +X points to world −Z.
    expect(close(edge?.startM ?? Vec3.ZERO, Vec3.create(0, 0.3, 1), 1e-9)).toBe(true);
    expect(close(edge?.endM ?? Vec3.ZERO, Vec3.create(0, 0.3, -1), 1e-9)).toBe(true);
    expect(Math.abs(edge?.outwardNormal.x ?? 0)).toBeCloseTo(1);
  });

  it("a ledge has two one-sided edges where its top face meets the chamfers, pointing out", () => {
    const ledge = ObstacleShape.ledge({
      lengthM: 4,
      depthM: 0.5,
      heightM: 0.4,
      edgeChamferM: 0.03,
    });
    const edges = obstacleGrindEdges(obstacle(ledge, at(19, 1.8), "ledge"));
    expect(edges).toHaveLength(2);
    for (const e of edges) {
      expect(e.surface).toBe("ledge");
      expect(e.twoSided).toBe(false);
      expect(e.startM.y).toBeCloseTo(0.4);
      expect(e.endM.y).toBeCloseTo(0.4);
      const side = Math.sign(e.startM.z - 1.8);
      expect(Math.abs(e.startM.z - 1.8)).toBeCloseTo(0.22);
      expect(e.outwardNormal.z).toBeCloseTo(side);
      expect(Vec3.distance(e.startM, e.endM)).toBeCloseTo(4);
    }
  });

  it("a quarter pipe's coping edge runs across on top of the coping, out over the transition", () => {
    const qp = ObstacleShape.quarterPipe({
      radiusM: 2.2,
      heightM: 1.3,
      widthM: 5,
      deckDepthM: 1.2,
      copingRadiusM: 0.03,
    });
    const o = obstacle(qp, at(12, -12), "ramp");
    const [edge] = obstacleGrindEdges(o);
    expect(edge?.surface).toBe("grindable");
    expect(edge?.twoSided).toBe(false);
    expect(edge?.startM.y).toBeCloseTo(1.3 + G.copingRevealM, 6);
    expect(Vec3.distance(edge?.startM ?? Vec3.ZERO, edge?.endM ?? Vec3.ZERO)).toBeCloseTo(5);
    expect(edge?.outwardNormal.x).toBeCloseTo(-1);
    // On top of the coping piece.
    const mid = Vec3.lerp(edge?.startM ?? Vec3.ZERO, edge?.endM ?? Vec3.ZERO, 0.5);
    expect(pieceTopNearX(o, mid.x, "grindable")).toBeCloseTo(mid.y, 3);
    // Turned 180° (west quarter pipe): out points to world +X.
    const [west] = obstacleGrindEdges(obstacle(qp, at(8, -12, Math.PI), "ramp"));
    expect(west?.outwardNormal.x).toBeCloseTo(1);
  });

  it("stairs: the hubba steel edge (flat + sloped) and the handrail follow the nosings", () => {
    const st = STAIRS;
    const shape = ObstacleShape.stairs(STAIRS);
    const edges = obstacleGrindEdges(obstacle(shape));
    const byName = (n: string) => edges.find((e) => e.id === `o:${n}`);
    const flat = byName("hubba-flat");
    const slope = byName("hubba");
    const rail = byName("handrail");
    const h = stairsHeightM(shape);
    const a = stairsSlopeRad(shape);
    const halfW = st.widthM / 2;
    expect(flat?.startM.y).toBeCloseTo(h + st.hubba.heightM + G.copingRevealM);
    expect(flat?.startM.z).toBeCloseTo(halfW);
    expect(slope?.startM.z).toBeCloseTo(halfW);
    // The sloped edge drops at the stairs' angle and ends over the foot of the stairs.
    const d = Vec3.sub(slope?.endM ?? Vec3.ZERO, slope?.startM ?? Vec3.ZERO);
    expect(Math.atan2(-d.y, d.x)).toBeCloseTo(a);
    expect(d.x).toBeCloseTo(stairsFootXM(shape));
    // It ends `heightM·cos²` + reveal·cos above the ground at the foot: about the hubba height.
    expect(slope?.endM.y).toBeGreaterThan(0.25);
    expect(slope?.endM.y).toBeLessThan(st.hubba.heightM + 0.01);
    // Flat and slope meet over the top nosing, with a gap where the steel turns (≈ 16 cm).
    expect(Vec3.distance(flat?.endM ?? Vec3.ZERO, slope?.startM ?? Vec3.ZERO)).toBeLessThan(0.2);
    expect(flat?.outwardNormal.z).toBeCloseTo(-1);
    expect(slope?.twoSided).toBe(false);
    // Handrail: two-sided, on the −Z side, `heightM` square above the nosings.
    expect(rail?.twoSided).toBe(true);
    expect(rail?.startM.z).toBeCloseTo(-halfW - st.handrail.offsetM);
    const r = Vec3.sub(rail?.endM ?? Vec3.ZERO, rail?.startM ?? Vec3.ZERO);
    expect(Math.atan2(-r.y, r.x)).toBeCloseTo(a);
    // At x = 0 the rail top is heightM / cos(a) above the top nosing.
    const t0 = -(rail?.startM.x ?? 0) / r.x;
    const y0 = (rail?.startM.y ?? 0) + t0 * r.y;
    expect(y0 - h).toBeCloseTo(st.handrail.heightM / Math.cos(a), 6);
  });

  it("stairs without a hubba or handrail, banks, kickers and boxes have no edges", () => {
    expect(
      obstacleGrindEdges(
        obstacle(
          ObstacleShape.stairs({ stepCount: 3, riseM: 0.15, runM: 0.3, widthM: 2, topDepthM: 1 }),
        ),
      ),
    ).toEqual([]);
    expect(
      obstacleGrindEdges(obstacle(ObstacleShape.bank({ angleRad: 0.3, lengthM: 2, widthM: 2 }))),
    ).toEqual([]);
    expect(
      obstacleGrindEdges(obstacle(ObstacleShape.kicker({ lengthM: 1, heightM: 0.3, widthM: 1 }))),
    ).toEqual([]);
    expect(
      obstacleGrindEdges(obstacle(ObstacleShape.box({ halfExtentsM: Vec3.create(1, 1, 1) }))),
    ).toEqual([]);
  });

  it("a level with every grindable kind exposes every edge kind with unique ids", () => {
    const edges = levelGrindEdges(kindsLevel().obstacles);
    const ids = edges.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining([
        "stairs:hubba-flat",
        "stairs:hubba",
        "stairs:handrail",
        "ledge:edge+z",
        "ledge:edge-z",
        "flat-rail:bar",
        "qp-east:coping",
        "qp-west:coping",
      ]),
    );
    for (const e of edges) {
      expect(Vec3.length(e.outwardNormal)).toBeCloseTo(1);
      expect(e.outwardNormal.y).toBeCloseTo(0);
      const u = Vec3.normalize(Vec3.sub(e.endM, e.startM));
      expect(Vec3.dot(u, e.outwardNormal)).toBeCloseTo(0);
    }
  });

  describe("queries", () => {
    const edges = levelGrindEdges(kindsLevel().obstacles);

    it("closestOnEdge clamps to the segment's ends", () => {
      const rail = edges.find((e) => e.id === "flat-rail:bar");
      if (rail === undefined) throw new Error("no rail");
      const mid = closestOnEdge(rail, Vec3.create(19, 0.5, -1.8));
      expect(mid.alongM).toBeCloseTo(2);
      expect(mid.distanceM).toBeCloseTo(0.15);
      const past = closestOnEdge(rail, Vec3.create(25, 0.35, -1.8));
      expect(past.alongM).toBeCloseTo(4);
      expect(past.distanceM).toBeCloseTo(4);
    });

    it("nearestGrindEdge finds the rail near its top and nothing far away", () => {
      const hit = nearestGrindEdge(edges, Vec3.create(19.3, 0.42, -1.78), 0.2);
      expect(hit?.edge.id).toBe("flat-rail:bar");
      expect(hit?.distanceM).toBeCloseTo(Math.hypot(0.07, 0.02));
      expect(nearestGrindEdge(edges, Vec3.create(19, 0.42, 0), 0.2)).toBeNull();
    });

    it("grindEdgesNear lists both ledge edges nearest first", () => {
      const hits = grindEdgesNear(edges, Vec3.create(19, 0.45, 1.95), 0.5);
      expect(hits.map((h) => h.edge.id)).toEqual(["ledge:edge+z", "ledge:edge-z"]);
    });
  });
});
