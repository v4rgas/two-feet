import type { ObstacleId, SurfaceType } from "../../../shared";
import { Transform, Vec3 } from "../../../shared";
import type { WorldConfig } from "../world.config";
import { WORLD_CONFIG } from "../world.config";
import type {
  BankLedgeShape,
  FunboxShape,
  KinkedRailShape,
  Obstacle,
  ObstacleShape,
  QuarterPipeShape,
  StairsShape,
} from "./obstacle";
import {
  bankLedgeRunM,
  funboxRailLines,
  handrailSpanXM,
  handrailZM,
  kinkedRailTopLine,
  quarterPipeCopingProfile,
  stairsFootXM,
  stairsHeightM,
  stairsSlopeRad,
} from "./obstacle-geometry";

/*
 * GRIND EDGES (pure, M4). Every edge a board can grind or slide on, as a straight line
 * segment on TOP of the edge's profile (where a truck or the deck rests), with the
 * horizontal normal that points away from the obstacle (where a pop out goes). The
 * geometry is taken from the same parameters as `obstacleGeometry`, so the segment lies on
 * the collider's surface (MECHANICS.md "Grinds and slides", ADR 0009).
 */

type GeometryConfig = WorldConfig["geometry"];

/** One grindable / ledge edge of an obstacle (value object, world frame unless noted). */
export interface GrindEdge {
  /** `<obstacleId>:<name>`, unique in a level. */
  readonly id: string;
  readonly obstacleId: ObstacleId;
  /** `grindable` (steel: rails, coping, the hubba's edge) or `ledge` (concrete). */
  readonly surface: SurfaceType;
  /** Ends of the segment, on top of the edge's profile, m. */
  readonly startM: Vec3;
  readonly endM: Vec3;
  /**
   * Horizontal unit normal, square to the edge, pointing away from the obstacle: the side
   * a pop out leaves to. For a two-sided bar (a rail) it is one of the two sides.
   */
  readonly outwardNormal: Vec3;
  /**
   * True for a bar with open space on both sides (rail, handrail). False for the edge of a
   * top surface (ledge, hubba, coping): the top lies on the −`outwardNormal` side.
   */
  readonly twoSided: boolean;
  /** Half the width of the edge's profile (bar or coping radius; 0 for a sharp corner), m. */
  readonly halfWidthM: number;
}

/** An edge in its obstacle's local frame (before `obstacle.transform`). */
interface LocalEdge {
  readonly name: string;
  readonly surface: SurfaceType;
  readonly startM: Vec3;
  readonly endM: Vec3;
  readonly outwardNormal: Vec3;
  readonly twoSided: boolean;
  readonly halfWidthM: number;
}

const PLUS_Z = Vec3.create(0, 0, 1);
const MINUS_Z = Vec3.create(0, 0, -1);

function quarterPipeEdges(shape: QuarterPipeShape, config: GeometryConfig): LocalEdge[] {
  const profile = quarterPipeCopingProfile(shape, config);
  const cx = profile.reduce((sum, p) => sum + p[0], 0) / profile.length;
  const topY = Math.max(...profile.map((p) => p[1]));
  const halfW = shape.widthM / 2;
  return [
    {
      name: "coping",
      surface: "grindable",
      startM: Vec3.create(cx, topY, -halfW),
      endM: Vec3.create(cx, topY, halfW),
      // Back over the transition (the ramp rises toward +X).
      outwardNormal: Vec3.create(-1, 0, 0),
      twoSided: false,
      halfWidthM: shape.copingRadiusM,
    },
  ];
}

function stairsEdges(shape: StairsShape, config: GeometryConfig): LocalEdge[] {
  const out: LocalEdge[] = [];
  const h = stairsHeightM(shape);
  const a = stairsSlopeRad(shape);
  const cosA = Math.cos(a);
  const sinA = Math.sin(a);
  const footX = stairsFootXM(shape);
  const halfW = shape.widthM / 2;
  // A point `upM` square above the line of nosings, `s` along it, on the plane z.
  const onSlope = (s: number, upM: number, z: number): Vec3 =>
    Vec3.create(sinA * upM + cosA * s, h + cosA * upM - sinA * s, z);

  if (shape.hubba !== undefined) {
    const { heightM: hh, edgeRadiusM: r } = shape.hubba;
    const reveal = config.copingRevealM;
    const flatY = h + hh + reveal;
    out.push({
      name: "hubba-flat",
      surface: "grindable",
      startM: Vec3.create(-(shape.hubba.flatTopM ?? shape.runM), flatY, halfW),
      endM: Vec3.create(0, flatY, halfW),
      outwardNormal: MINUS_Z,
      twoSided: false,
      halfWidthM: r,
    });
    const up = hh * cosA + reveal;
    out.push({
      name: "hubba",
      surface: "grindable",
      startM: onSlope(0, up, halfW),
      endM: onSlope(footX / cosA, up, halfW),
      outwardNormal: MINUS_Z,
      twoSided: false,
      halfWidthM: r,
    });
    if (shape.hubba.bothSides === true) {
      // The mirror image on −Z (its top lies on the +Z side of its edge).
      for (const e of out.slice()) {
        out.push({
          ...e,
          name: `${e.name}-minus-z`,
          startM: Vec3.create(e.startM.x, e.startM.y, -e.startM.z),
          endM: Vec3.create(e.endM.x, e.endM.y, -e.endM.z),
          outwardNormal: PLUS_Z,
        });
      }
    }
  }

  if (shape.handrail !== undefined) {
    const { heightM: rh, barRadiusM: r } = shape.handrail;
    const z = handrailZM(shape);
    const { startXM, endXM } = handrailSpanXM(shape, config);
    out.push({
      name: "handrail",
      surface: "grindable",
      startM: onSlope(startXM / cosA, rh, z),
      endM: onSlope(endXM / cosA, rh, z),
      outwardNormal: MINUS_Z,
      twoSided: true,
      halfWidthM: r,
    });
  }
  return out;
}

/** One two-sided bar edge per straight run of a rail's top line (local XY at z). */
function barEdges(
  name: string,
  lineM: readonly (readonly [number, number])[],
  zM: number,
  radiusM: number,
): LocalEdge[] {
  const out: LocalEdge[] = [];
  for (let i = 0; i + 1 < lineM.length; i += 1) {
    const a = lineM[i];
    const b = lineM[i + 1];
    if (a === undefined || b === undefined) continue;
    out.push({
      name: lineM.length > 2 ? `${name}-${i}` : name,
      surface: "grindable",
      startM: Vec3.create(a[0], a[1], zM),
      endM: Vec3.create(b[0], b[1], zM),
      outwardNormal: PLUS_Z,
      twoSided: true,
      halfWidthM: radiusM,
    });
  }
  return out;
}

function kinkedRailEdges(shape: KinkedRailShape): LocalEdge[] {
  return barEdges("bar", kinkedRailTopLine(shape), 0, shape.barRadiusM);
}

function funboxEdges(shape: FunboxShape): LocalEdge[] {
  const out: LocalEdge[] = [];
  const h = shape.heightM;
  const c = shape.edgeChamferM;
  const hx = shape.topLengthM / 2;
  const hz = shape.topWidthM / 2;
  // Ledge sides: where the top meets the chamfer, along the whole top edge.
  if (shape.sides.plusZ === "ledge") {
    out.push(ledgeEdge("ledge+z", [-hx, h, hz - c], [hx, h, hz - c], PLUS_Z));
  }
  if (shape.sides.minusZ === "ledge") {
    out.push(ledgeEdge("ledge-z", [-hx, h, -(hz - c)], [hx, h, -(hz - c)], MINUS_Z));
  }
  if (shape.sides.plusX === "ledge") {
    out.push(ledgeEdge("ledge+x", [hx - c, h, -hz], [hx - c, h, hz], Vec3.UNIT_X));
  }
  if (shape.sides.minusX === "ledge") {
    out.push(ledgeEdge("ledge-x", [-(hx - c), h, -hz], [-(hx - c), h, hz], Vec3.create(-1, 0, 0)));
  }
  for (const rail of funboxRailLines(shape)) {
    out.push(...barEdges(rail.name, rail.lineM, rail.zM, rail.radiusM));
  }
  return out;
}

function ledgeEdge(
  name: string,
  start: readonly [number, number, number],
  end: readonly [number, number, number],
  outwardNormal: Vec3,
): LocalEdge {
  return {
    name,
    surface: "ledge",
    startM: Vec3.create(...start),
    endM: Vec3.create(...end),
    outwardNormal,
    twoSided: false,
    halfWidthM: 0,
  };
}

function bankLedgeEdges(shape: BankLedgeShape): LocalEdge[] {
  const y = shape.bankHeightM + shape.ledgeHeightM;
  const c = shape.edgeChamferM;
  const halfW = shape.widthM / 2;
  const front = bankLedgeRunM(shape) + c;
  const back = bankLedgeRunM(shape) + shape.ledgeDepthM - c;
  return [
    // Over the bank: the edge you ride up to.
    ledgeEdge("ledge-bank", [front, y, -halfW], [front, y, halfW], Vec3.create(-1, 0, 0)),
    ledgeEdge("ledge-back", [back, y, -halfW], [back, y, halfW], Vec3.UNIT_X),
  ];
}

/** Grind edges of a shape, in the obstacle's local frame. */
function shapeEdges(shape: ObstacleShape, config: GeometryConfig): LocalEdge[] {
  switch (shape.kind) {
    case "rail": {
      const halfL = shape.lengthM / 2;
      return [
        {
          name: "bar",
          surface: "grindable",
          startM: Vec3.create(-halfL, shape.heightM, 0),
          endM: Vec3.create(halfL, shape.heightM, 0),
          outwardNormal: PLUS_Z,
          twoSided: true,
          halfWidthM: shape.barRadiusM,
        },
      ];
    }
    case "ledge": {
      // The top face ends where the chamfers start: z = ±(depth/2 − chamfer), y = height.
      const halfL = shape.lengthM / 2;
      const z = shape.depthM / 2 - shape.edgeChamferM;
      const y = shape.heightM;
      return [
        {
          name: "edge+z",
          surface: "ledge",
          startM: Vec3.create(-halfL, y, z),
          endM: Vec3.create(halfL, y, z),
          outwardNormal: PLUS_Z,
          twoSided: false,
          halfWidthM: 0,
        },
        {
          name: "edge-z",
          surface: "ledge",
          startM: Vec3.create(-halfL, y, -z),
          endM: Vec3.create(halfL, y, -z),
          outwardNormal: MINUS_Z,
          twoSided: false,
          halfWidthM: 0,
        },
      ];
    }
    case "quarterPipe":
      return quarterPipeEdges(shape, config);
    case "stairs":
      return stairsEdges(shape, config);
    case "funbox":
      return funboxEdges(shape);
    case "kinkedRail":
      return kinkedRailEdges(shape);
    case "bankLedge":
      return bankLedgeEdges(shape);
    case "box":
    case "bank":
    case "kicker":
    case "barrier":
      return [];
  }
}

/** Grind edges of an obstacle, in the world frame. */
export function obstacleGrindEdges(
  obstacle: Obstacle,
  config: GeometryConfig = WORLD_CONFIG.geometry,
): GrindEdge[] {
  const t = obstacle.transform;
  return shapeEdges(obstacle.shape, config).map((e) =>
    Object.freeze({
      id: `${obstacle.id}:${e.name}`,
      obstacleId: obstacle.id,
      surface: e.surface,
      startM: Transform.toWorldPoint(t, e.startM),
      endM: Transform.toWorldPoint(t, e.endM),
      outwardNormal: Transform.toWorldDirection(t, e.outwardNormal),
      twoSided: e.twoSided,
      halfWidthM: e.halfWidthM,
    }),
  );
}

/** Every grind edge of a level's obstacles, in the world frame. */
export function levelGrindEdges(
  obstacles: readonly Obstacle[],
  config: GeometryConfig = WORLD_CONFIG.geometry,
): GrindEdge[] {
  return obstacles.flatMap((o) => obstacleGrindEdges(o, config));
}

/** A grind edge near a point: where on it the point is closest, and how far. */
export interface GrindEdgeHit {
  readonly edge: GrindEdge;
  /** Closest point of the segment, m (world). */
  readonly closestM: Vec3;
  /** Distance along the segment from `startM` to `closestM`, m. */
  readonly alongM: number;
  readonly distanceM: number;
}

/** Closest point of an edge's segment to `pointM`. */
export function closestOnEdge(edge: GrindEdge, pointM: Vec3): GrindEdgeHit {
  const d = Vec3.sub(edge.endM, edge.startM);
  const length = Vec3.length(d);
  const u = length > 0 ? Vec3.scale(d, 1 / length) : Vec3.ZERO;
  const along = Math.max(0, Math.min(length, Vec3.dot(Vec3.sub(pointM, edge.startM), u)));
  const closestM = Vec3.add(edge.startM, Vec3.scale(u, along));
  return { edge, closestM, alongM: along, distanceM: Vec3.distance(pointM, closestM) };
}

/** Every edge whose segment passes within `radiusM` of `pointM`, nearest first. */
export function grindEdgesNear(
  edges: readonly GrindEdge[],
  pointM: Vec3,
  radiusM: number,
): GrindEdgeHit[] {
  return edges
    .map((edge) => closestOnEdge(edge, pointM))
    .filter((hit) => hit.distanceM <= radiusM)
    .sort((a, b) => a.distanceM - b.distanceM);
}

/** The edge nearest to `pointM` within `radiusM`, or null. */
export function nearestGrindEdge(
  edges: readonly GrindEdge[],
  pointM: Vec3,
  radiusM: number,
): GrindEdgeHit | null {
  return grindEdgesNear(edges, pointM, radiusM)[0] ?? null;
}
