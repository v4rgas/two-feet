import type { SurfaceType, Transform } from "../../../shared";
import { Vec3 } from "../../../shared";
import type { WorldConfig } from "../world.config";
import { WORLD_CONFIG } from "../world.config";
import type {
  BankLedgeShape,
  BankShape,
  BarrierShape,
  BoxShape,
  FunboxShape,
  FunboxSide,
  KickerShape,
  KinkedRailShape,
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

/**
 * Render tone of a face: STYLE.md concrete body, darker edges/coping, metal rails, and
 * `banner`: the artwork face of a barrier's banner panel (the renderer maps the
 * obstacle's sponsor artwork onto it).
 */
export type FaceTone = "body" | "edge" | "metal" | "banner";

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

/** A piece mirrored through the plane z = 0 (faces re-wound so they stay outward). */
function mirrorZ(piece: ConvexPiece): ConvexPiece {
  return {
    surface: piece.surface,
    verticesM: piece.verticesM.map((v) => Vec3.create(v.x, v.y, -v.z)),
    faces: piece.faces.map((f) => ({ indices: [...f.indices].reverse(), tone: f.tone })),
  };
}

/** A half-space n · p ≤ offset (n outward, unit), and the tone of the face it makes. */
interface HalfSpace {
  readonly normal: Vec3;
  readonly offsetM: number;
  readonly tone: FaceTone;
}

/** The half-space bounded by the plane through `pointM` with outward normal `normal`. */
function halfSpace(normal: Vec3, pointM: Vec3, tone: FaceTone = "body"): HalfSpace {
  const n = Vec3.normalize(normal);
  return { normal: n, offsetM: Vec3.dot(n, pointM), tone };
}

const PLANE_EPS_M = 1e-10;

/**
 * The convex polyhedron that is the intersection of `spaces` (a bounded set), as one
 * piece. Its vertices are where three planes meet inside every half-space; each plane that
 * touches three or more of them (with some area) is a face, wound counter-clockwise from
 * outside. Brute force (cubic in the plane count), fine for the few planes of an obstacle,
 * built once per level.
 */
function halfSpacePiece(surface: SurfaceType, spaces: readonly HalfSpace[]): ConvexPiece {
  const verticesM: Vec3[] = [];
  const inside = (p: Vec3): boolean =>
    spaces.every((s) => Vec3.dot(s.normal, p) <= s.offsetM + PLANE_EPS_M);
  for (let i = 0; i < spaces.length; i += 1) {
    for (let j = i + 1; j < spaces.length; j += 1) {
      for (let k = j + 1; k < spaces.length; k += 1) {
        const a = spaces[i];
        const b = spaces[j];
        const c = spaces[k];
        if (a === undefined || b === undefined || c === undefined) continue;
        const bc = Vec3.cross(b.normal, c.normal);
        const det = Vec3.dot(a.normal, bc);
        if (Math.abs(det) < 1e-12) continue;
        const p = Vec3.scale(
          Vec3.add(
            Vec3.add(
              Vec3.scale(bc, a.offsetM),
              Vec3.scale(Vec3.cross(c.normal, a.normal), b.offsetM),
            ),
            Vec3.scale(Vec3.cross(a.normal, b.normal), c.offsetM),
          ),
          1 / det,
        );
        if (!inside(p)) continue;
        if (verticesM.some((v) => Vec3.distance(v, p) < PLANE_EPS_M * 10)) continue;
        verticesM.push(p);
      }
    }
  }
  const faces: GeometryFace[] = [];
  for (const s of spaces) {
    const on = verticesM
      .map((v, index) => ({ v, index }))
      .filter(({ v }) => Math.abs(Vec3.dot(s.normal, v) - s.offsetM) < PLANE_EPS_M * 10);
    if (on.length < 3) continue;
    let centre = Vec3.ZERO;
    for (const { v } of on) centre = Vec3.add(centre, v);
    centre = Vec3.scale(centre, 1 / on.length);
    const helper = Math.abs(s.normal.y) < 0.9 ? Vec3.UNIT_Y : Vec3.UNIT_X;
    const t1 = Vec3.normalize(Vec3.cross(helper, s.normal));
    const t2 = Vec3.cross(s.normal, t1);
    const angle = (v: Vec3): number => {
      const d = Vec3.sub(v, centre);
      return Math.atan2(Vec3.dot(d, t2), Vec3.dot(d, t1));
    };
    on.sort((p, q) => angle(p.v) - angle(q.v));
    // Skip a plane that only grazes the piece along an edge.
    let area = 0;
    for (let k = 0; k < on.length; k += 1) {
      const p = on[k]?.v;
      const q = on[(k + 1) % on.length]?.v;
      if (p !== undefined && q !== undefined)
        area += Vec3.dot(Vec3.cross(Vec3.sub(p, centre), Vec3.sub(q, centre)), s.normal);
    }
    if (area < 1e-9) continue;
    const indices = on.map(({ index }) => index);
    const key = [...indices].sort((p, q) => p - q).join(",");
    if (faces.some((f) => [...f.indices].sort((p, q) => p - q).join(",") === key)) continue;
    faces.push({ indices, tone: s.tone });
  }
  return { surface, verticesM, faces };
}

/**
 * A round bar whose TOP runs along the polyline `topLineM` (points in local XY at z = `zM`,
 * x increasing), one convex piece per straight run: the circumscribed polygon around its
 * axis (a flat facet on top, exactly on the line) between two end planes. At a kink both
 * runs end on the MITRE plane (the bisector through the kink), like a welded pipe: the
 * tops meet exactly at the kink and nothing pokes above the next run's top. (Runs that
 * reach past a convex kink would leave a bump a few mm high, as tall as the grind lock's
 * hover, and a truck crossing the kink would catch on it.)
 */
function barPieces(
  topLineM: readonly P2[],
  zM: number,
  radiusM: number,
  config: GeometryConfig,
): ConvexPiece[] {
  const at = (p: P2): Vec3 => Vec3.create(p[0], p[1], zM);
  const dirs: Vec3[] = [];
  for (let i = 0; i + 1 < topLineM.length; i += 1) {
    const a = topLineM[i];
    const b = topLineM[i + 1];
    if (a === undefined || b === undefined) continue;
    dirs.push(Vec3.normalize(Vec3.sub(at(b), at(a))));
  }
  const pieces: ConvexPiece[] = [];
  const sides = config.roundRailSides;
  dirs.forEach((u, i) => {
    const a = topLineM[i];
    const b = topLineM[i + 1];
    if (a === undefined || b === undefined) return;
    const start = at(a);
    const end = at(b);
    const e1 = Vec3.create(0, 0, -1);
    const e2 = Vec3.cross(u, e1); // up, square to the run (e1 × e2 = u)
    const axis = Vec3.sub(start, Vec3.scale(e2, radiusM));
    const spaces: HalfSpace[] = [];
    for (let k = 0; k < sides; k += 1) {
      const angle = Math.PI / 2 + (k * 2 * Math.PI) / sides;
      const n = Vec3.add(Vec3.scale(e1, Math.cos(angle)), Vec3.scale(e2, Math.sin(angle)));
      spaces.push({ normal: n, offsetM: Vec3.dot(n, axis) + radiusM, tone: "metal" });
    }
    const prev = dirs[i - 1];
    const next = dirs[i + 1];
    const kink = (a: Vec3, b: Vec3): number => Math.acos(Math.max(-1, Math.min(1, Vec3.dot(a, b))));
    // Start: square to the run. After a CONVEX kink (the line bends down onto this run) the
    // run starts `e` past it, so its back edge lies `seamBuryM` under the previous run's
    // line (the previous run reaches over, see below); after a CONCAVE kink it runs on
    // back along its own line, under the previous run's top (ADR 0008).
    let startAt = start;
    if (prev !== undefined) {
      const e = seamOverlapM(kink(prev, u), config);
      startAt = Vec3.add(start, Vec3.scale(u, u.y < prev.y ? e : -e));
    }
    spaces.push(halfSpace(Vec3.negate(u), startAt, "metal"));
    // End: square to the run; before a kink it runs on `e` along its own line. Before a
    // convex kink its top is clipped by the next run's top plane, so it never pokes above
    // the next run: the kink sits inside this one piece, with no seam edge on the top.
    let endAt = end;
    if (next !== undefined) {
      endAt = Vec3.add(end, Vec3.scale(u, seamOverlapM(kink(u, next), config)));
      if (next.y < u.y) {
        const nextUp = Vec3.cross(next, e1);
        spaces.push({ normal: nextUp, offsetM: Vec3.dot(nextUp, end), tone: "metal" });
      }
    }
    spaces.push(halfSpace(u, endAt, "metal"));
    pieces.push(halfSpacePiece("grindable", spaces));
  });
  return pieces;
}

/** Height of the polyline `topLineM` at x (clamped to its ends), m. */
function polylineYAt(topLineM: readonly P2[], x: number): number {
  for (let i = 0; i + 1 < topLineM.length; i += 1) {
    const a = topLineM[i];
    const b = topLineM[i + 1];
    if (a === undefined || b === undefined) continue;
    if (x <= b[0] || i + 2 === topLineM.length) {
      const t = Math.max(0, Math.min(1, (x - a[0]) / (b[0] - a[0])));
      return a[1] + t * (b[1] - a[1]);
    }
  }
  return topLineM[0]?.[1] ?? 0;
}

/** Square metal posts from the ground up to the bar's axis under `topLineM`, at each x. */
function postPieces(
  topLineM: readonly P2[],
  zM: number,
  radiusM: number,
  xs: readonly number[],
  config: GeometryConfig,
): ConvexPiece[] {
  const p = config.railPostHalfSizeM;
  return xs.map((x) =>
    boxPiece(
      "ground",
      Vec3.create(x - p, 0, zM - p),
      Vec3.create(x + p, polylineYAt(topLineM, x) - radiusM, zM + p),
      "metal",
    ),
  );
}

/** The top line of a kinked rail (flat → down → flat), local XY, m. */
export function kinkedRailTopLine(shape: KinkedRailShape): P2[] {
  const top = shape.heightM + shape.dropM;
  const x1 = shape.flatTopM;
  const x2 = x1 + shape.downRunM;
  return [
    [0, top],
    [x1, top],
    [x2, shape.heightM],
    [x2 + shape.flatBottomM, shape.heightM],
  ];
}

function kinkedRailGeometry(shape: KinkedRailShape, config: GeometryConfig): ConvexPiece[] {
  const line = kinkedRailTopLine(shape);
  const r = shape.barRadiusM;
  const endX = line[line.length - 1]?.[0] ?? 0;
  const inset = Math.min(config.railPostInsetM, shape.flatTopM / 2, shape.flatBottomM / 2);
  // A post near each end and one under each kink.
  const postXs = [inset, shape.flatTopM, shape.flatTopM + shape.downRunM, endX - inset];
  return [...barPieces(line, 0, r, config), ...postPieces(line, 0, r, postXs, config)];
}

/** Horizontal run of a funbox's banks, m. */
export function funboxBankRunM(shape: FunboxShape): number {
  return shape.heightM / Math.tan(shape.bankAngleRad);
}

type FunboxSideName = keyof FunboxShape["sides"];

/** Outward horizontal direction of each funbox side (local). */
const FUNBOX_SIDE_DIRS: Readonly<Record<FunboxSideName, Vec3>> = {
  plusX: Vec3.UNIT_X,
  minusX: Vec3.create(-1, 0, 0),
  plusZ: Vec3.UNIT_Z,
  minusZ: Vec3.create(0, 0, -1),
};

/** Half the top's size along a side's outward direction, m. */
function funboxHalfTopM(shape: FunboxShape, side: FunboxSideName): number {
  return side === "plusX" || side === "minusX" ? shape.topLengthM / 2 : shape.topWidthM / 2;
}

/**
 * A straight bank seen in its own vertical plane: `s` is the horizontal distance outward
 * (along `out`) from the bank's top edge line (at o · p = `halfM`, y = `heightM`), and the
 * bank runs down from there at `angleRad` to the ground. `lateral` bounds its pieces
 * sideways.
 */
interface BankFrame {
  readonly out: Vec3;
  readonly halfM: number;
  readonly heightM: number;
  readonly angleRad: number;
  readonly lateral: readonly HalfSpace[];
}

/** The 3D point at profile (s, y) of a bank frame (on its centre line). */
function bankPoint(f: BankFrame, s: number, y: number): Vec3 {
  return Vec3.add(Vec3.scale(f.out, f.halfM + s), Vec3.create(0, y, 0));
}

/** Outward normal of a bank-frame line sloping down outward at `angleRad`. */
function bankNormal(f: BankFrame, angleRad: number): Vec3 {
  return Vec3.add(Vec3.scale(f.out, Math.sin(angleRad)), Vec3.create(0, Math.cos(angleRad), 0));
}

/**
 * The CONCAVE toe of a bank, rounded: a circular fillet of `radiusM` tangent to the
 * ground and to the bank, one convex piece per ≤ `maxSegmentAngleRad` segment, each the
 * region under its chord (ADR 0008). Every chord runs on past both of its seams far
 * enough to be buried `seamBuryM` under its neighbour (the ground at the toe, the next
 * chord, the bank's straight face at the top), so a wheel meets no exposed seam edge, and
 * the bank's own sharp toe is buried under the fillet. Without it a wheel hits the bank's
 * full angle at once: a 20° kink costs 6 % of the speed and lifts a wheel pair.
 */
function bankToePieces(
  surface: SurfaceType,
  f: BankFrame,
  radiusM: number,
  config: GeometryConfig,
): ConvexPiece[] {
  const a = f.angleRad;
  const run = f.heightM / Math.tan(a);
  const groundS = run + radiusM * Math.tan(a / 2); // where the fillet leaves the ground
  const segments = Math.max(1, Math.ceil(a / config.maxSegmentAngleRad - 1e-9));
  const points: P2[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const theta = (a * i) / segments;
    points.push([groundS - radiusM * Math.sin(theta), radiusM * (1 - Math.cos(theta))]);
  }
  // Chord angles (rising inward); the ground before the first is 0, the bank after the last is a.
  const angles: number[] = [];
  for (let i = 0; i + 1 < points.length; i += 1) {
    const p = points[i];
    const q = points[i + 1];
    if (p === undefined || q === undefined) continue;
    angles.push(Math.atan2(q[1] - p[1], p[0] - q[0]));
  }
  const pieces: ConvexPiece[] = [];
  angles.forEach((phi, i) => {
    const p = points[i];
    const q = points[i + 1];
    if (p === undefined || q === undefined) return;
    const back = seamOverlapM(phi - (angles[i - 1] ?? 0), config);
    const fwd = seamOverlapM((angles[i + 1] ?? a) - phi, config);
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    const outer: P2 = [p[0] + back * c, p[1] - back * s];
    const inner: P2 = [q[0] - fwd * c, q[1] + fwd * s];
    const bottom = Math.min(0, outer[1]);
    pieces.push(
      halfSpacePiece(surface, [
        halfSpace(bankNormal(f, phi), bankPoint(f, p[0], p[1])),
        halfSpace(Vec3.create(0, -1, 0), Vec3.create(0, bottom, 0)),
        halfSpace(f.out, bankPoint(f, outer[0], 0)),
        halfSpace(Vec3.negate(f.out), bankPoint(f, inner[0], 0)),
        ...f.lateral,
      ]),
    );
  });
  return pieces;
}

/**
 * The CONVEX crest of a bank, rounded: the chords of a circle of `radiusM` tangent to the
 * top and to the bank, as half-spaces that cut the sharp edge off a convex piece. Inside
 * one hull there is no seam at all; the rounding keeps wheels on the surface over the
 * crest (at the course's speeds v²/R < g) instead of hopping off a sharp edge.
 */
function bankCrestSpaces(f: BankFrame, radiusM: number, config: GeometryConfig): HalfSpace[] {
  const a = f.angleRad;
  const t = radiusM * Math.tan(a / 2);
  const segments = Math.max(1, Math.ceil(a / config.maxSegmentAngleRad - 1e-9));
  const out: HalfSpace[] = [];
  let prev: P2 = [-t, f.heightM];
  for (let i = 1; i <= segments; i += 1) {
    const theta = (a * i) / segments;
    const next: P2 = [
      -t + radiusM * Math.sin(theta),
      f.heightM - radiusM + radiusM * Math.cos(theta),
    ];
    const psi = Math.atan2(prev[1] - next[1], next[0] - prev[0]);
    out.push(halfSpace(bankNormal(f, psi), bankPoint(f, prev[0], prev[1])));
    prev = next;
  }
  return out;
}

/** The two sides at right angles to a funbox side. */
const FUNBOX_NEIGHBOURS: Readonly<Record<FunboxSideName, readonly FunboxSideName[]>> = {
  plusX: ["plusZ", "minusZ"],
  minusX: ["plusZ", "minusZ"],
  plusZ: ["plusX", "minusX"],
  minusZ: ["plusX", "minusX"],
};

/** A funbox bank side as a bank frame; its pieces end at the neighbours (miters at hips). */
function funboxBankFrame(shape: FunboxShape, name: FunboxSideName): BankFrame {
  const out = FUNBOX_SIDE_DIRS[name];
  const half = funboxHalfTopM(shape, name);
  const lateral = FUNBOX_NEIGHBOURS[name].map((j) => {
    const oj = FUNBOX_SIDE_DIRS[j];
    const hj = funboxHalfTopM(shape, j);
    // Next to another bank: the miter (outward distances equal, the hip's diagonal);
    // next to a wall or ledge: that wall's plane.
    return shape.sides[j] === "bank"
      ? {
          normal: Vec3.normalize(Vec3.sub(oj, out)),
          offsetM: (hj - half) / Math.SQRT2,
          tone: "body" as const,
        }
      : halfSpace(oj, Vec3.scale(oj, hj));
  });
  return { out, halfM: half, heightM: shape.heightM, angleRad: shape.bankAngleRad, lateral };
}

/** Outward half-space of a funbox bank's straight face. */
function funboxBankSpace(shape: FunboxShape, name: FunboxSideName): HalfSpace {
  const f = funboxBankFrame(shape, name);
  return halfSpace(bankNormal(f, shape.bankAngleRad), bankPoint(f, 0, shape.heightM));
}

/**
 * The rounded ridge of a hip (two banks meeting at a corner): tangent planes of a cylinder
 * of `hipRidgeRadiusM` that touches both banks, along the ridge, one per ≤
 * `maxSegmentAngleRad` of the turn between the two faces. Convex, so they are faces of
 * the funbox's one hull.
 */
function hipRidgeSpaces(
  shape: FunboxShape,
  k: FunboxSideName,
  j: FunboxSideName,
  config: GeometryConfig,
): HalfSpace[] {
  const a = funboxBankSpace(shape, k);
  const b = funboxBankSpace(shape, j);
  const r = config.hipRidgeRadiusM;
  // A point on the cylinder's axis: R inside both faces, at y = 0.
  const up = Vec3.UNIT_Y;
  const nbu = Vec3.cross(b.normal, up);
  const det = Vec3.dot(a.normal, nbu);
  if (Math.abs(det) < 1e-12) return [];
  const axis = Vec3.scale(
    Vec3.add(Vec3.scale(nbu, a.offsetM - r), Vec3.scale(Vec3.cross(up, a.normal), b.offsetM - r)),
    1 / det,
  );
  const theta = Math.acos(Math.max(-1, Math.min(1, Vec3.dot(a.normal, b.normal))));
  const steps = Math.max(1, Math.ceil(theta / config.maxSegmentAngleRad - 1e-9));
  const out: HalfSpace[] = [];
  for (let i = 1; i < steps; i += 1) {
    const phi = (theta * i) / steps;
    const n = Vec3.normalize(
      Vec3.add(Vec3.scale(a.normal, Math.sin(theta - phi)), Vec3.scale(b.normal, Math.sin(phi))),
    );
    out.push({ normal: n, offsetM: Vec3.dot(n, axis) + r, tone: "body" });
  }
  return out;
}

/** The half-spaces of one funbox side. */
function funboxSideSpaces(
  shape: FunboxShape,
  name: FunboxSideName,
  kind: FunboxSide,
  config: GeometryConfig,
): HalfSpace[] {
  const out = FUNBOX_SIDE_DIRS[name];
  const h = shape.heightM;
  const half = funboxHalfTopM(shape, name);
  // A point on the top edge of this side (the crest of a bank).
  const crest = Vec3.add(Vec3.scale(out, half), Vec3.create(0, h, 0));
  if (kind === "bank") {
    const f = funboxBankFrame(shape, name);
    return [
      halfSpace(bankNormal(f, shape.bankAngleRad), crest),
      ...bankCrestSpaces(f, config.bankCrestRadiusM, config),
    ];
  }
  const wall = halfSpace(out, crest);
  if (kind === "wall") return [wall];
  // Ledge: a 45° chamfer on the top edge, in the edge tone.
  const c = shape.edgeChamferM;
  const chamferPoint = Vec3.add(Vec3.scale(out, half), Vec3.create(0, h - c, 0));
  return [wall, halfSpace(Vec3.add(out, Vec3.UNIT_Y), chamferPoint, "edge")];
}

/** One rail of a funbox: the top line of its bar (local XY, x increasing) at z. */
export interface FunboxRailLine {
  readonly name: "top-rail" | "bank-rail";
  readonly lineM: P2[];
  readonly zM: number;
  readonly radiusM: number;
}

/** The funbox's rails (the flat top rail, the down rail). */
export function funboxRailLines(shape: FunboxShape): FunboxRailLine[] {
  const h = shape.heightM;
  const out: FunboxRailLine[] = [];
  const top = shape.topRail;
  if (top !== undefined) {
    const y = h + top.heightM;
    out.push({
      name: "top-rail",
      lineM: [
        [-top.lengthM / 2, y],
        [top.lengthM / 2, y],
      ],
      zM: top.zM,
      radiusM: top.barRadiusM,
    });
  }
  const down = shape.bankRail;
  if (down !== undefined) {
    const s = down.side === "plusX" ? 1 : -1;
    const crestX = s * (shape.topLengthM / 2);
    const startX = crestX - s * down.flatM;
    const toeX = crestX + s * funboxBankRunM(shape);
    const line: P2[] = [
      [startX, h + down.heightM],
      [crestX, h + down.heightM],
      [toeX, down.heightM],
    ];
    if (s < 0) line.reverse();
    out.push({ name: "bank-rail", lineM: line, zM: down.zM, radiusM: down.barRadiusM });
  }
  return out;
}

function funboxGeometry(
  surface: SurfaceType,
  shape: FunboxShape,
  config: GeometryConfig,
): ConvexPiece[] {
  const spaces: HalfSpace[] = [
    // The bottom is under the ground, so every bank's toe edge is buried (ADR 0008).
    halfSpace(Vec3.create(0, -1, 0), Vec3.create(0, -config.seamBuryM, 0)),
    halfSpace(Vec3.UNIT_Y, Vec3.create(0, shape.heightM, 0)),
  ];
  const sideNames = ["plusX", "minusX", "plusZ", "minusZ"] as const;
  for (const name of sideNames) {
    spaces.push(...funboxSideSpaces(shape, name, shape.sides[name], config));
  }
  for (const [k, j] of [
    ["plusX", "plusZ"],
    ["plusX", "minusZ"],
    ["minusX", "plusZ"],
    ["minusX", "minusZ"],
  ] as const) {
    if (shape.sides[k] === "bank" && shape.sides[j] === "bank") {
      spaces.push(...hipRidgeSpaces(shape, k, j, config));
    }
  }
  const pieces: ConvexPiece[] = [halfSpacePiece(surface, spaces)];
  for (const name of sideNames) {
    if (shape.sides[name] !== "bank") continue;
    pieces.push(
      ...bankToePieces(surface, funboxBankFrame(shape, name), config.bankToeRadiusM, config),
    );
  }
  const inset = config.railPostInsetM;
  for (const rail of funboxRailLines(shape)) {
    const first = rail.lineM[0]?.[0] ?? 0;
    const last = rail.lineM[rail.lineM.length - 1]?.[0] ?? 0;
    const postInset = Math.min(inset, (last - first) / 4);
    pieces.push(
      ...barPieces(rail.lineM, rail.zM, rail.radiusM, config),
      ...postPieces(
        rail.lineM,
        rail.zM,
        rail.radiusM,
        [first + postInset, last - postInset],
        config,
      ),
    );
  }
  return pieces;
}

/** Horizontal run of a bank-to-ledge's bank (toe to the ledge's face), m. */
export function bankLedgeRunM(shape: BankLedgeShape): number {
  return shape.bankHeightM / Math.tan(shape.angleRad);
}

function bankLedgeGeometry(
  surface: SurfaceType,
  shape: BankLedgeShape,
  config: GeometryConfig,
): ConvexPiece[] {
  const a = shape.angleRad;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const runX = bankLedgeRunM(shape);
  const halfW = shape.widthM / 2;
  // The slope runs on under the ground at the toe and into the ledge block at the top, so
  // neither end edge is exposed (ADR 0008).
  const bury = seamOverlapM(a, config);
  const into = Math.min(bury, (0.5 * shape.ledgeDepthM) / c);
  const bank = prismZ(
    surface,
    [
      [-bury * c, -bury * s],
      [runX + into * c, -bury * s],
      [runX + into * c, shape.bankHeightM + into * s],
    ],
    -halfW,
    halfW,
    "body",
  );
  const top = shape.bankHeightM + shape.ledgeHeightM;
  const ch = shape.edgeChamferM;
  const x0 = runX;
  const x1 = runX + shape.ledgeDepthM;
  const ledge = prismZ(
    "ledge",
    [
      [x0, 0],
      [x1, 0],
      [x1, top - ch],
      [x1 - ch, top],
      [x0 + ch, top],
      [x0, top - ch],
    ],
    -halfW,
    halfW,
    "body",
    ["body", "body", "edge", "body", "edge", "body"],
  );
  // The toe is rounded like a funbox bank's (the bank faces −X: its top edge is at x = runX).
  const frame: BankFrame = {
    out: Vec3.create(-1, 0, 0),
    halfM: -runX,
    heightM: shape.bankHeightM,
    angleRad: a,
    lateral: [
      halfSpace(Vec3.UNIT_Z, Vec3.create(0, 0, halfW)),
      halfSpace(Vec3.create(0, 0, -1), Vec3.create(0, 0, -halfW)),
    ],
  };
  return [bank, ...bankToePieces(surface, frame, config.bankToeRadiusM, config), ledge];
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

/** A stair set's roll-up slope as a bank frame (it faces −X; its top edge is at x = −topDepthM). */
function stairsBackFrame(shape: StairsShape, angleRad: number): BankFrame {
  const halfW = shape.widthM / 2;
  return {
    out: Vec3.create(-1, 0, 0),
    halfM: shape.topDepthM,
    heightM: stairsHeightM(shape),
    angleRad,
    lateral: [
      halfSpace(Vec3.UNIT_Z, Vec3.create(0, 0, halfW)),
      halfSpace(Vec3.create(0, 0, -1), Vec3.create(0, 0, -halfW)),
    ],
  };
}

/**
 * The rounded crest of a stair set's roll-up slope, as profile points (local XY) from the
 * top (x decreasing) down to where the arc meets the slope.
 */
function stairsCrestProfile(shape: StairsShape, config: GeometryConfig): P2[] {
  const a = shape.backSlopeRad ?? 0;
  const f = stairsBackFrame(shape, a);
  const r = config.bankCrestRadiusM;
  const t = r * Math.tan(a / 2);
  const segments = Math.max(1, Math.ceil(a / config.maxSegmentAngleRad - 1e-9));
  const out: P2[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const theta = (a * i) / segments;
    const s = -t + r * Math.sin(theta);
    const y = f.heightM - r + r * Math.cos(theta);
    out.push([-shape.topDepthM - s, y]);
  }
  return out;
}

/** Local z of a stair set's handrail axis: beside the −Z side, or down the middle, m. */
export function handrailZM(shape: StairsShape): number {
  const rail = shape.handrail;
  if (rail === undefined || rail.centered === true) return 0;
  return -shape.widthM / 2 - rail.offsetM;
}

/**
 * Horizontal extent of a stair set's handrail bar (local x of its top and bottom ends,
 * m): `topOverhangM` back past the top nosing, `bottomOverhangM` on past the foot (each
 * twice `railPostInsetM` by default). Null without a handrail.
 */
export function handrailSpanXM(
  shape: StairsShape,
  config: GeometryConfig = WORLD_CONFIG.geometry,
): { readonly startXM: number; readonly endXM: number } | null {
  const rail = shape.handrail;
  if (rail === undefined) return null;
  const inset = config.railPostInsetM;
  return {
    startXM: -(rail.topOverhangM ?? 2 * inset),
    endXM: stairsFootXM(shape) + (rail.bottomOverhangM ?? 2 * inset),
  };
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
    // A rounded crest adds the arc's points between the top and the slope (still convex).
    const crest: P2[] =
      shape.roundedBackSlope === true ? stairsCrestProfile(shape, config) : [[backX, h]];
    platform = prismZ(
      surface,
      [[toeX, bottom], [0, bottom], [0, h], ...crest],
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
    // Starts `flatTopM` (default one tread) back on the platform (flat), then follows the
    // nosings down to the ground line, where it ends in a vertical face `hh` tall.
    const startX = -(shape.hubba.flatTopM ?? run);
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

  if (shape.hubba?.bothSides === true) {
    // Every piece after the platform and the n − 1 treads is the +Z hubba: mirror it to −Z.
    for (const piece of pieces.slice(n)) pieces.push(mirrorZ(piece));
  }

  const railRange = handrailSpanXM(shape, config);
  if (shape.handrail !== undefined && railRange !== null) {
    const { heightM: rh, barRadiusM: r } = shape.handrail;
    const z = handrailZM(shape);
    const inset = config.railPostInsetM;
    const { startXM: startX, endXM: endX } = railRange;
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
    if (shape.handrail.bothSides === true && shape.handrail.centered !== true) {
      // The bar and its two posts (the last three pieces), mirrored to the +Z side.
      for (const piece of pieces.slice(-3)) pieces.push(mirrorZ(piece));
    }
  }
  if (shape.roundedBackSlope === true && shape.backSlopeRad !== undefined) {
    const frame = stairsBackFrame(shape, shape.backSlopeRad);
    pieces.push(...bankToePieces(surface, frame, config.bankToeRadiusM, config));
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
    case "funbox":
      pieces = funboxGeometry(surface, shape, config);
      break;
    case "kinkedRail":
      pieces = kinkedRailGeometry(shape, config);
      break;
    case "bankLedge":
      pieces = bankLedgeGeometry(surface, shape, config);
      break;
    case "barrier":
      pieces = barrierGeometry(shape, config);
      break;
  }
  return { pieces };
}

/**
 * A barrier: one chamfered concrete block along X (the profile of a ledge), plus a thin
 * banner plate proud of the front (+Z) face, and of the back face too with
 * `banner.sides: "both"`. The plate's outer face has the `banner` tone, its rim `metal`.
 * Every piece is `ground`: a barrier is solid but never grindable (it has no grind edges).
 */
function barrierGeometry(shape: BarrierShape, config: GeometryConfig): ConvexPiece[] {
  const b = config.barrier;
  const t = shape.thicknessM / 2;
  const h = shape.heightM;
  const c = Math.min(b.edgeChamferM, t / 2, h / 2);
  const profile: P2[] = [
    [-t, 0],
    [t, 0],
    [t, h - c],
    [t - c, h],
    [-t + c, h],
    [-t, h - c],
  ];
  const sides: FaceTone[] = ["body", "body", "edge", "body", "edge", "body"];
  const halfL = shape.lengthM / 2;
  const pieces = [prism("ground", profile, -halfL, halfL, "body", sides, X_FRAME)];

  const banner = shape.banner;
  const x0 = -halfL + b.bannerInsetEndsM;
  const x1 = halfL - b.bannerInsetEndsM;
  const y0 = b.bannerInsetBottomM;
  const y1 = h - c - b.bannerInsetTopM;
  if (banner === undefined || x1 <= x0 || y1 <= y0) return pieces;
  const p = b.bannerPanelThicknessM;
  // boxPiece faces: [0] the +Z cap, [1] the −Z cap, then the rim.
  const panel = (z0: number, z1: number, artFace: 0 | 1): ConvexPiece => {
    const box = boxPiece("ground", Vec3.create(x0, y0, z0), Vec3.create(x1, y1, z1), "metal");
    return {
      ...box,
      faces: box.faces.map((f, i) => (i === artFace ? { ...f, tone: "banner" } : f)),
    };
  };
  pieces.push(panel(t, t + p, 0));
  if (banner.sides === "both") pieces.push(panel(-t - p, -t, 1));
  return pieces;
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
