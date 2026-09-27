import type { SurfaceType, Transform } from "../../../shared";
import { Vec3 } from "../../../shared";
import type { WorldConfig } from "../world.config";
import { WORLD_CONFIG } from "../world.config";
import type {
  BankShape,
  BoxShape,
  KickerShape,
  LedgeShape,
  Obstacle,
  ObstacleShape,
  QuarterPipeShape,
  RailShape,
  StairsShape,
} from "./obstacle";

/*
 * OBSTACLE GEOMETRY (pure). Turns shape parameters into convex pieces. Physics builds
 * one convex-hull collider per piece; rendering triangulates the same faces. So what
 * the player sees is exactly what the board collides with (STYLE.md, ADR 0008).
 *
 * Every piece is a convex polyhedron: its vertices, and its faces as vertex-index loops
 * wound counter-clockwise seen from outside (right-hand normal points outward).
 */

/** Render tone of a face: STYLE.md concrete body, darker edges/coping, metal rails. */
export type FaceTone = "body" | "edge" | "metal";

/** One planar face of a convex piece. */
export interface GeometryFace {
  /** Indices into the piece's vertices, counter-clockwise seen from outside. */
  readonly indices: readonly number[];
  readonly tone: FaceTone;
}

/** A convex polyhedron with one surface type (one collider). Obstacle-local frame. */
export interface ConvexPiece {
  readonly surface: SurfaceType;
  readonly verticesM: readonly Vec3[];
  readonly faces: readonly GeometryFace[];
}

/** Every piece of one obstacle, in its local frame. */
export interface ObstacleGeometry {
  readonly pieces: readonly ConvexPiece[];
}

type GeometryConfig = WorldConfig["geometry"];

/** A 2D profile point [x, y]. */
type P2 = readonly [number, number];

const SAME_POINT_M = 1e-9;

/** Drops consecutive duplicate points (also last == first). */
function dedupe(profile: readonly P2[]): P2[] {
  const out: P2[] = [];
  for (const p of profile) {
    const prev = out[out.length - 1];
    if (prev === undefined || Math.hypot(p[0] - prev[0], p[1] - prev[1]) > SAME_POINT_M) {
      out.push(p);
    }
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (
    out.length > 1 &&
    first !== undefined &&
    last !== undefined &&
    Math.hypot(first[0] - last[0], first[1] - last[1]) <= SAME_POINT_M
  ) {
    out.pop();
  }
  return out;
}

/**
 * A right-handed frame for extrusions: profile x runs along `e1`, profile y along `e2`,
 * and the extrusion along `d` = e1 × e2. Winding is preserved, so faces stay outward.
 */
interface ExtrusionFrame {
  readonly origin: Vec3;
  readonly e1: Vec3;
  readonly e2: Vec3;
  readonly d: Vec3;
}

/** Profile in local XY, extruded along local Z. */
const Z_FRAME: ExtrusionFrame = {
  origin: Vec3.ZERO,
  e1: Vec3.UNIT_X,
  e2: Vec3.UNIT_Y,
  d: Vec3.UNIT_Z,
};

/** Profile x along local −Z, y up, extruded along local +X (for ledges and rails). */
const X_FRAME: ExtrusionFrame = {
  origin: Vec3.ZERO,
  e1: Vec3.create(0, 0, -1),
  e2: Vec3.UNIT_Y,
  d: Vec3.UNIT_X,
};

/**
 * Extrudes a convex profile (counter-clockwise in the frame's e1/e2 plane, seen from +d)
 * along d, from `z0` to `z1` (> z0). `sideTones[i]` is the tone of the side face on
 * profile edge i → i+1; the caps take `capTone`.
 */
function prism(
  surface: SurfaceType,
  rawProfile: readonly P2[],
  z0: number,
  z1: number,
  capTone: FaceTone,
  sideTones?: readonly FaceTone[],
  frame: ExtrusionFrame = Z_FRAME,
): ConvexPiece {
  const profile = dedupe(rawProfile);
  const n = profile.length;
  const at = (x: number, y: number, z: number): Vec3 =>
    Vec3.add(
      frame.origin,
      Vec3.add(Vec3.add(Vec3.scale(frame.e1, x), Vec3.scale(frame.e2, y)), Vec3.scale(frame.d, z)),
    );
  const verticesM: Vec3[] = [];
  for (const [x, y] of profile) verticesM.push(at(x, y, z0));
  for (const [x, y] of profile) verticesM.push(at(x, y, z1));
  const faces: GeometryFace[] = [];
  // Cap at z1 faces +d: the profile order is already counter-clockwise from there.
  faces.push({ indices: profile.map((_, i) => n + i), tone: capTone });
  // Cap at z0 faces −d: reverse order.
  faces.push({ indices: profile.map((_, i) => n - 1 - i), tone: capTone });
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    faces.push({ indices: [i, j, n + j, n + i], tone: sideTones?.[i] ?? capTone });
  }
  return { surface, verticesM, faces };
}

/** `prism` in local XY, extruded along Z. */
function prismZ(
  surface: SurfaceType,
  profile: readonly P2[],
  z0: number,
  z1: number,
  capTone: FaceTone,
  sideTones?: readonly FaceTone[],
): ConvexPiece {
  return prism(surface, profile, z0, z1, capTone, sideTones, Z_FRAME);
}

/** A local-space axis-aligned box piece. */
function boxPiece(
  surface: SurfaceType,
  min: Vec3,
  max: Vec3,
  tone: FaceTone = "body",
): ConvexPiece {
  return prismZ(
    surface,
    [
      [min.x, min.y],
      [max.x, min.y],
      [max.x, max.y],
      [min.x, max.y],
    ],
    min.z,
    max.z,
    tone,
  );
}

/**
 * A regular polygon around (cx, cy), counter-clockwise, CIRCUMSCRIBED about the circle
 * of `radiusM`: every facet is tangent to the circle. One facet's outward normal points
 * at `facetNormalRad` (default π/2: a flat facet on top, exactly at cy + radius).
 */
function roundProfile(
  cx: number,
  cy: number,
  radiusM: number,
  sides: number,
  facetNormalRad = Math.PI / 2,
): P2[] {
  const step = (2 * Math.PI) / sides;
  const vertexRadius = radiusM / Math.cos(step / 2);
  const out: P2[] = [];
  for (let i = 0; i < sides; i += 1) {
    const a = facetNormalRad + step / 2 + i * step;
    out.push([cx + vertexRadius * Math.cos(a), cy + vertexRadius * Math.sin(a)]);
  }
  return out;
}

/**
 * Points on a circular transition of `radiusM` tangent to the ground at x = 0, from the
 * toe (0°) to `endAngleRad`, split so no segment spans more than `maxSegmentAngleRad`.
 * Point i is (R·sin θi, R·(1 − cos θi)).
 */
export function transitionPoints(
  radiusM: number,
  endAngleRad: number,
  maxSegmentAngleRad: number,
): P2[] {
  const segments = Math.max(1, Math.ceil(endAngleRad / maxSegmentAngleRad - 1e-9));
  const out: P2[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const theta = (endAngleRad * i) / segments;
    out.push([radiusM * Math.sin(theta), radiusM * (1 - Math.cos(theta))]);
  }
  return out;
}

/** Angle of the chord from `a` to `b` above horizontal, rad. */
function chordAngleRad(a: P2, b: P2): number {
  return Math.atan2(b[1] - a[1], b[0] - a[0]);
}

/**
 * How far a piece's chord must run on past a seam so that its end edge is buried at least
 * `seamBuryM` under the neighbouring surface, which turns by `kinkRad` there, m.
 */
function seamOverlapM(kinkRad: number, config: GeometryConfig): number {
  return config.seamBuryM / Math.sin(Math.max(Math.abs(kinkRad), config.minSeamKinkRad));
}

/**
 * One convex piece per transition segment: the region under the chord, down to the
 * ground. Each chord runs on past both of its seams along its own line (ADR 0008), so
 * the piece's end edges are buried under the neighbouring segments (and under the ground
 * at the toe). A wheel then never meets an exposed seam edge within the solver's contact
 * prediction distance, which would give it a "ghost" normal and kick it off the ramp.
 * Forward extensions stop at the lip (the seams right below it are buried less deeply);
 * the last segment ends at the lip, where the deck (and coping) take over.
 */
function transitionPieces(
  surface: SurfaceType,
  points: readonly P2[],
  widthM: number,
  config: GeometryConfig,
): ConvexPiece[] {
  const pieces: ConvexPiece[] = [];
  const last = points.length - 2;
  for (let i = 0; i <= last; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (a === undefined || b === undefined) continue;
    const angle = chordAngleRad(a, b);
    const prev = points[i - 1];
    const next = points[i + 2];
    // The ground before the toe is a flat "chord" at angle 0.
    const backKink = prev === undefined ? angle : angle - chordAngleRad(prev, a);
    const back = seamOverlapM(backKink, config);
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    // Forward, the extension must stop at the lip: past it the chord would poke out
    // above the deck. So the seams just below the lip are buried less deeply.
    const lipX = points[points.length - 1]?.[0] ?? b[0];
    const fwd =
      i === last || next === undefined
        ? 0
        : Math.min(seamOverlapM(chordAngleRad(b, next) - angle, config), (lipX - b[0]) / c);
    const a2: P2 = [a[0] - back * c, a[1] - back * s];
    const b2: P2 = [b[0] + fwd * c, b[1] + fwd * s];
    const bottom = Math.min(0, a2[1]);
    pieces.push(
      prismZ(surface, [[a2[0], bottom], [b2[0], bottom], b2, a2], -widthM / 2, widthM / 2, "body"),
    );
  }
  return pieces;
}

/** Angle of the transition at the top of a quarter pipe (0 = flat, π/2 = vert), rad. */
export function quarterPipeLipAngleRad(shape: QuarterPipeShape): number {
  return Math.acos((shape.radiusM - shape.heightM) / shape.radiusM);
}

/** Horizontal distance from the toe to the lip of a quarter pipe, m. */
export function quarterPipeLipXM(shape: QuarterPipeShape): number {
  return shape.radiusM * Math.sin(quarterPipeLipAngleRad(shape));
}

/** Radius of a kicker's arc (tangent to the ground, through the lip), m. */
export function kickerRadiusM(shape: KickerShape): number {
  return (shape.lengthM ** 2 + shape.heightM ** 2) / (2 * shape.heightM);
}

/** Launch angle of a kicker at its lip, rad. */
export function kickerLipAngleRad(shape: KickerShape): number {
  return Math.asin(shape.lengthM / kickerRadiusM(shape));
}

/**
 * Profile of a quarter pipe's coping pipe (local XY). The polygon is turned so that one
 * facet lies along the transition wall, `copingInsetM` behind it: the coping is flush
 * with the wall, so a wheel riding up the wall meets no concave kink there (a coping that
 * bulges p past the wall makes a kink of acos(1 − p/r), ≈ 26° for 3 mm on a 3 cm pipe,
 * and slams the board back, ADR 0008). Its top stands `copingRevealM` proud of the deck,
 * which is what trucks will lock onto for grinds (M4).
 */
export function quarterPipeCopingProfile(
  shape: QuarterPipeShape,
  config: GeometryConfig = WORLD_CONFIG.geometry,
): P2[] {
  const theta = quarterPipeLipAngleRad(shape);
  const r = shape.copingRadiusM;
  const wallNormalRad = Math.PI / 2 + theta; // outward normal of the wall at the lip
  // Place it around the origin first, to measure how far the top reaches.
  const unit = roundProfile(0, 0, r, config.copingSides, wallNormalRad);
  const topM = Math.max(...unit.map((p) => p[1]));
  const cy = shape.heightM + config.copingRevealM - topM;
  // The wall facet (normal n = (−sin θ, cos θ), r from the axis) sits `copingInsetM`
  // behind the wall line through the lip: n · (c − lip) = −(r + inset).
  const behindM = r + config.copingInsetM;
  const cx =
    quarterPipeLipXM(shape) + (behindM + Math.cos(theta) * (cy - shape.heightM)) / Math.sin(theta);
  return unit.map((p) => [p[0] + cx, p[1] + cy]);
}

function boxGeometry(surface: SurfaceType, shape: BoxShape): ConvexPiece[] {
  const h = shape.halfExtentsM;
  return [boxPiece(surface, Vec3.negate(h), h)];
}

function quarterPipeGeometry(
  surface: SurfaceType,
  shape: QuarterPipeShape,
  config: GeometryConfig,
): ConvexPiece[] {
  const { heightM: h, widthM: w } = shape;
  const points = transitionPoints(
    shape.radiusM,
    quarterPipeLipAngleRad(shape),
    config.maxSegmentAngleRad,
  );
  const lip = points[points.length - 1];
  if (lip === undefined) return [];
  // Snap the lip exactly to the deck height, so the transition meets the deck flush.
  const lipX = lip[0];
  points[points.length - 1] = [lipX, h];
  const backX = lipX + shape.deckDepthM;
  // The deck's front face runs down the wall's tangent at the lip (buried behind the
  // curved transition), not straight down: a vertical face there would give a wheel
  // leaving the wall a ghost contact on the lip edge and knock it back (ADR 0008).
  const tanLip = Math.tan(quarterPipeLipAngleRad(shape));
  const tangentFootX = lipX - h / tanLip;
  // Clipped at the toe (x = 0) for shallow quarter pipes.
  const deckProfile: P2[] =
    tangentFootX >= 0
      ? [
          [tangentFootX, 0],
          [backX, 0],
          [backX, h],
          [lipX, h],
        ]
      : [
          [0, 0],
          [backX, 0],
          [backX, h],
          [lipX, h],
          [0, h - lipX * tanLip],
        ];
  const deck = prismZ(surface, deckProfile, -w / 2, w / 2, "body");
  const coping = prismZ(
    "grindable",
    quarterPipeCopingProfile(shape, config),
    -w / 2,
    w / 2,
    "edge",
  );
  return [...transitionPieces(surface, points, w, config), deck, coping];
}

function bankGeometry(
  surface: SurfaceType,
  shape: BankShape,
  config: GeometryConfig,
): ConvexPiece[] {
  const c = Math.cos(shape.angleRad);
  const s = Math.sin(shape.angleRad);
  const x = shape.lengthM * c;
  const y = shape.lengthM * s;
  // The slope runs on below the ground, burying the toe edge (see `transitionPieces`).
  const back = seamOverlapM(shape.angleRad, config);
  return [
    prismZ(
      surface,
      [
        [-back * c, -back * s],
        [x, -back * s],
        [x, y],
      ],
      -shape.widthM / 2,
      shape.widthM / 2,
      "body",
    ),
  ];
}

function kickerGeometry(
  surface: SurfaceType,
  shape: KickerShape,
  config: GeometryConfig,
): ConvexPiece[] {
  const points = transitionPoints(
    kickerRadiusM(shape),
    kickerLipAngleRad(shape),
    config.maxSegmentAngleRad,
  );
  // Snap the lip to the exact parameters.
  points[points.length - 1] = [shape.lengthM, shape.heightM];
  return transitionPieces(surface, points, shape.widthM, config);
}

function ledgeGeometry(surface: SurfaceType, shape: LedgeShape): ConvexPiece[] {
  const d = shape.depthM / 2;
  const h = shape.heightM;
  const c = shape.edgeChamferM;
  // Profile across the ledge (x = across, toward local −Z; y = up), extruded along X.
  const profile: P2[] = [
    [-d, 0],
    [d, 0],
    [d, h - c],
    [d - c, h],
    [-d + c, h],
    [-d, h - c],
  ];
  const sides: FaceTone[] = ["body", "body", "edge", "body", "edge", "body"];
  return [prism(surface, profile, -shape.lengthM / 2, shape.lengthM / 2, "body", sides, X_FRAME)];
}

function railGeometry(shape: RailShape, config: GeometryConfig): ConvexPiece[] {
  const r = shape.barRadiusM;
  const cy = shape.heightM - r;
  const barProfile: P2[] =
    shape.profile === "round"
      ? roundProfile(0, cy, r, config.roundRailSides)
      : [
          [-r, cy - r],
          [r, cy - r],
          [r, cy + r],
          [-r, cy + r],
        ];
  const halfL = shape.lengthM / 2;
  const bar = prism("grindable", barProfile, -halfL, halfL, "metal", undefined, X_FRAME);
  const p = config.railPostHalfSizeM;
  const postX = halfL - config.railPostInsetM;
  const posts = [-postX, postX].map((x) =>
    boxPiece("ground", Vec3.create(x - p, 0, -p), Vec3.create(x + p, cy, p), "metal"),
  );
  return [bar, ...posts];
}

/** Height of a stair set's top platform, m. */
export function stairsHeightM(shape: StairsShape): number {
  return shape.stepCount * shape.riseM;
}

/** Angle of the line of nosings below horizontal, rad. */
export function stairsSlopeRad(shape: StairsShape): number {
  return Math.atan2(shape.riseM, shape.runM);
}

/** Horizontal x where the line of nosings meets the ground (local frame), m. */
export function stairsFootXM(shape: StairsShape): number {
  return shape.stepCount * shape.runM;
}

/**
 * Frame running down the line of nosings on the plane z = `zM`: `d` points down the
 * stairs, `e2` is the upward normal of that line, `e1` = local −Z. Origin at the top
 * nosing's height.
 */
function slopeFrame(shape: StairsShape, zM: number): ExtrusionFrame {
  const a = stairsSlopeRad(shape);
  return {
    origin: Vec3.create(0, stairsHeightM(shape), zM),
    e1: Vec3.create(0, 0, -1),
    e2: Vec3.create(Math.sin(a), Math.cos(a), 0),
    d: Vec3.create(Math.cos(a), -Math.sin(a), 0),
  };
}

function stairsGeometry(
  surface: SurfaceType,
  shape: StairsShape,
  config: GeometryConfig,
): ConvexPiece[] {
  const { stepCount: n, riseM: rise, runM: run, widthM: w } = shape;
  const h = stairsHeightM(shape);
  const halfW = w / 2;
  // Solid pieces: the platform (with its roll-up slope, if any), then one box per tread,
  // each from the ground up (ADR 0008).
  const backX = -shape.topDepthM;
  let platform: ConvexPiece;
  if (shape.backSlopeRad === undefined) {
    platform = boxPiece(surface, Vec3.create(backX, 0, -halfW), Vec3.create(0, h, halfW));
  } else {
    // The slope runs on under the ground, burying its toe edge (see `transitionPieces`).
    const a = shape.backSlopeRad;
    const bury = seamOverlapM(a, config);
    const toeX = backX - h / Math.tan(a) - bury * Math.cos(a);
    const bottom = -bury * Math.sin(a);
    platform = prismZ(
      surface,
      [
        [toeX, bottom],
        [0, bottom],
        [0, h],
        [backX, h],
      ],
      -halfW,
      halfW,
      "body",
    );
  }
  const pieces: ConvexPiece[] = [platform];
  for (let i = 1; i < n; i += 1) {
    pieces.push(
      boxPiece(
        surface,
        Vec3.create((i - 1) * run, 0, -halfW),
        Vec3.create(i * run, h - i * rise, halfW),
      ),
    );
  }
  const footX = stairsFootXM(shape);
  const slope = rise / run;
  const cosA = Math.cos(stairsSlopeRad(shape));

  if (shape.hubba !== undefined) {
    const { widthM: hw, heightM: hh, edgeRadiusM: r } = shape.hubba;
    // Starts one tread's depth back on the platform (flat), then follows the nosings
    // down to the ground line, where it ends in a vertical face `hh` tall.
    const startX = -run;
    pieces.push(
      prismZ(
        "ledge",
        [
          [startX, 0],
          [footX, 0],
          [footX, h + hh - footX * slope],
          [0, h + hh],
          [startX, h + hh],
        ],
        halfW,
        halfW + hw,
        "body",
      ),
    );
    // Steel edge on the inner top edge (toward the stairs): sloped run + flat top.
    // The hubba top is `hh` above the nosings vertically, i.e. hh·cos(slope) square to them.
    const edgeProfile = roundProfile(
      0,
      hh * cosA - r + config.copingRevealM,
      r,
      config.copingSides,
    );
    pieces.push(
      prism("grindable", edgeProfile, 0, footX / cosA, "edge", undefined, slopeFrame(shape, halfW)),
    );
    pieces.push(
      prism(
        "grindable",
        roundProfile(0, h + hh - r + config.copingRevealM, r, config.copingSides),
        startX,
        0,
        "edge",
        undefined,
        { ...X_FRAME, origin: Vec3.create(0, 0, halfW) },
      ),
    );
  }

  if (shape.handrail !== undefined) {
    const { heightM: rh, barRadiusM: r, offsetM } = shape.handrail;
    const z = -halfW - offsetM;
    const inset = config.railPostInsetM;
    const startX = -2 * inset;
    const endX = footX + 2 * inset;
    const axisOffsetM = rh - r; // square to the line of nosings
    pieces.push(
      prism(
        "grindable",
        roundProfile(0, axisOffsetM, r, config.roundRailSides),
        startX / cosA,
        endX / cosA,
        "metal",
        undefined,
        slopeFrame(shape, z),
      ),
    );
    const p = config.railPostHalfSizeM;
    for (const x of [startX + inset, endX - inset]) {
      const axisY = h - x * slope + axisOffsetM / cosA;
      pieces.push(
        boxPiece("ground", Vec3.create(x - p, 0, z - p), Vec3.create(x + p, axisY, z + p), "metal"),
      );
    }
  }
  return pieces;
}

/** Convex pieces of a shape, in the obstacle's local frame. */
export function shapeGeometry(
  surface: SurfaceType,
  shape: ObstacleShape,
  config: GeometryConfig = WORLD_CONFIG.geometry,
): ObstacleGeometry {
  let pieces: ConvexPiece[];
  switch (shape.kind) {
    case "box":
      pieces = boxGeometry(surface, shape);
      break;
    case "quarterPipe":
      pieces = quarterPipeGeometry(surface, shape, config);
      break;
    case "bank":
      pieces = bankGeometry(surface, shape, config);
      break;
    case "kicker":
      pieces = kickerGeometry(surface, shape, config);
      break;
    case "ledge":
      pieces = ledgeGeometry(surface, shape);
      break;
    case "rail":
      pieces = railGeometry(shape, config);
      break;
    case "stairs":
      pieces = stairsGeometry(surface, shape, config);
      break;
  }
  return { pieces };
}

/** Convex pieces of an obstacle, in its local frame (`obstacle.transform` places them). */
export function obstacleGeometry(
  obstacle: Obstacle,
  config: GeometryConfig = WORLD_CONFIG.geometry,
): ObstacleGeometry {
  return shapeGeometry(obstacle.surface, obstacle.shape, config);
}

/** A convex part of a compound collider. Structurally a board `ColliderShape` part. */
export interface ObstacleColliderPart {
  readonly surface: SurfaceType;
  readonly pointsM: readonly Vec3[];
}

/** Collider shape of an obstacle. Structurally a board `ColliderShape`. */
export type ObstacleColliderShape =
  | { readonly kind: "box"; readonly halfExtentsM: Vec3 }
  | { readonly kind: "compound"; readonly parts: readonly ObstacleColliderPart[] };

/**
 * What the physics world needs for one obstacle. Structurally a board
 * `StaticColliderDesc`: the composition root passes it to `addStaticCollider` as-is.
 */
export interface ObstacleColliderDesc {
  readonly id: string;
  readonly surface: SurfaceType;
  readonly transform: Transform;
  readonly shape: ObstacleColliderShape;
}

/**
 * The collider description of an obstacle. A plain box stays a box (the most robust
 * collider for the ground); everything else is a compound of convex hulls, one per
 * piece of `obstacleGeometry`, each with its own surface type (ADR 0008).
 */
export function obstacleCollider(
  obstacle: Obstacle,
  config: GeometryConfig = WORLD_CONFIG.geometry,
): ObstacleColliderDesc {
  const { id, surface, transform, shape } = obstacle;
  if (shape.kind === "box") {
    return { id, surface, transform, shape: { kind: "box", halfExtentsM: shape.halfExtentsM } };
  }
  const parts = obstacleGeometry(obstacle, config).pieces.map((piece) => ({
    surface: piece.surface,
    pointsM: piece.verticesM,
  }));
  return { id, surface, transform, shape: { kind: "compound", parts } };
}
