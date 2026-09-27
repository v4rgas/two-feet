import { Transform, Vec3 } from "../../../shared";
import type { Obstacle } from "./obstacle";
import type { ConvexPiece } from "./obstacle-geometry";
import { obstacleGeometry } from "./obstacle-geometry";

/*
 * GRAFFITI (pure level data). A graffiti placement is DECORATION: the renderer projects the
 * artwork named `pieceId` along `-normal` onto whatever surfaces are there (a wall, the
 * ground, a sloped bank, a curved transition) as a decal that follows them. It is never a
 * collider and never changes physics. Maps list these in `Level.graffiti`.
 */

/** One graffiti decal on a surface (value object, world frame). */
export interface GraffitiPlacement {
  /** Artwork id in the presentation's graffiti registry (unknown ids are skipped there). */
  readonly pieceId: string;
  /** Centre of the piece, ON the surface, m. */
  readonly positionM: Vec3;
  /** Outward unit normal of the surface there (the decal is projected along its reverse). */
  readonly normal: Vec3;
  /** Width of the piece, m (its height follows the artwork's aspect). */
  readonly sizeM: number;
  /** Turn about the normal, rad (0 = the art's up is as close to world +Y as it gets). */
  readonly rotationRad?: number;
}

/** A local face direction of an obstacle: its ±X or ±Z side. */
export type ObstacleFaceSide = "+x" | "-x" | "+z" | "-z";

export interface GraffitiOnFaceOptions {
  readonly pieceId: string;
  readonly face: ObstacleFaceSide;
  readonly sizeM: number;
  /** Shift along the face (local X for ±Z faces, local Z for ±X faces), m. Default 0. */
  readonly alongM?: number;
  /**
   * Height of the piece's centre above the obstacle's base, m. Default: the middle of the
   * chosen face.
   */
  readonly heightM?: number;
  readonly rotationRad?: number;
}

const FACE_NORMALS: Readonly<Record<ObstacleFaceSide, Vec3>> = {
  "+x": Vec3.create(1, 0, 0),
  "-x": Vec3.create(-1, 0, 0),
  "+z": Vec3.create(0, 0, 1),
  "-z": Vec3.create(0, 0, -1),
};

/** A face counts as looking along a side when its normal is within ≈ 2.5° of it. */
const PARALLEL_DOT = 0.999;

interface FaceHit {
  readonly centroid: Vec3;
  /** The face's vertices (local frame). */
  readonly pts: readonly Vec3[];
  readonly area: number;
  readonly offset: number;
  readonly minY: number;
  readonly maxY: number;
}

function faceHits(pieces: readonly ConvexPiece[], n: Vec3): FaceHit[] {
  const out: FaceHit[] = [];
  for (const piece of pieces) {
    for (const face of piece.faces) {
      const pts = face.indices.map((i) => piece.verticesM[i]).filter((p) => p !== undefined);
      if (pts.length < 3) continue;
      let newell = Vec3.ZERO;
      for (let k = 0; k < pts.length; k += 1) {
        const a = pts[k];
        const b = pts[(k + 1) % pts.length];
        if (a === undefined || b === undefined) continue;
        newell = Vec3.add(newell, Vec3.cross(a, b));
      }
      const len = Vec3.length(newell);
      if (len < 1e-9 || Vec3.dot(Vec3.scale(newell, 1 / len), n) < PARALLEL_DOT) continue;
      let c = Vec3.ZERO;
      for (const p of pts) c = Vec3.add(c, p);
      c = Vec3.scale(c, 1 / pts.length);
      const ys = pts.map((p) => p.y);
      out.push({
        centroid: c,
        pts,
        area: len / 2,
        offset: Vec3.dot(c, n),
        minY: Math.min(...ys),
        maxY: Math.max(...ys),
      });
    }
  }
  return out;
}

/**
 * A graffiti placement on one side of an obstacle: on the outermost face (the biggest,
 * if several are equally far out) that looks along `face` (local ±X or ±Z): a ledge's or
 * barrier's long side, a funbox wall, a stair set's side wall, the back of a quarter
 * pipe. On a barrier with a front banner, the `+z` face is the banner plate: paint the
 * back (`-z`) instead. The piece then sits on the outermost of those faces that is
 * actually under its (shifted) centre, so a shift past a step in the side (a stair set's
 * hubba, a deck wall behind it) still lands on the wall. Throws if the obstacle has no
 * face looking that way.
 */
export function graffitiOnFace(
  obstacle: Obstacle,
  options: GraffitiOnFaceOptions,
): GraffitiPlacement {
  const n = FACE_NORMALS[options.face];
  const hits = faceHits(obstacleGeometry(obstacle).pieces, n);
  if (hits.length === 0) {
    throw new RangeError(`graffitiOnFace: "${obstacle.id}" has no ${options.face} face`);
  }
  const outer = Math.max(...hits.map((h) => h.offset));
  const best = hits
    .filter((h) => h.offset > outer - 1e-6)
    .reduce((a, b) => (b.area > a.area ? b : a));
  const along = options.alongM ?? 0;
  const alongDir = Math.abs(n.z) > 0.5 ? Vec3.UNIT_X : Vec3.UNIT_Z;
  const y = options.heightM ?? (best.minY + best.maxY) / 2;
  const shifted = Vec3.add(
    Vec3.create(best.centroid.x, y, best.centroid.z),
    Vec3.scale(alongDir, along),
  );
  // The outermost face whose extent (along the side, and in height) holds the centre.
  const a = Vec3.dot(shifted, alongDir);
  const under = hits.filter((h) => {
    const as = h.pts.map((p) => Vec3.dot(p, alongDir));
    return (
      a >= Math.min(...as) - 1e-6 &&
      a <= Math.max(...as) + 1e-6 &&
      y >= h.minY - 1e-6 &&
      y <= h.maxY + 1e-6
    );
  });
  const onto = under.length === 0 ? best : under.reduce((p, q) => (q.offset > p.offset ? q : p));
  const local = Vec3.add(shifted, Vec3.scale(n, onto.offset - Vec3.dot(shifted, n)));
  return createGraffiti({
    pieceId: options.pieceId,
    positionM: Transform.toWorldPoint(obstacle.transform, local),
    normal: Transform.toWorldDirection(obstacle.transform, n),
    sizeM: options.sizeM,
    ...(options.rotationRad === undefined ? {} : { rotationRad: options.rotationRad }),
  });
}

export interface GraffitiOnGroundOptions {
  readonly pieceId: string;
  /** Centre of the piece on the ground, world m. */
  readonly xM: number;
  readonly zM: number;
  readonly sizeM: number;
  /**
   * Turn about +Y, rad. At 0 the art's up points to world −Z (its bottom toward +Z), so
   * it reads upright for someone standing on its +Z side looking toward −Z.
   */
  readonly rotationRad?: number;
  /** Height of the ground there, m. Default 0 (every map's slab top). */
  readonly yM?: number;
}

/** A graffiti placement flat on the ground (normal +Y). */
export function graffitiOnGround(options: GraffitiOnGroundOptions): GraffitiPlacement {
  return createGraffiti({
    pieceId: options.pieceId,
    positionM: Vec3.create(options.xM, options.yM ?? 0, options.zM),
    normal: Vec3.UNIT_Y,
    sizeM: options.sizeM,
    ...(options.rotationRad === undefined ? {} : { rotationRad: options.rotationRad }),
  });
}

export interface GraffitiOnSurfaceOptions {
  readonly pieceId: string;
  readonly sizeM: number;
  /**
   * The point to paint, seen from above: obstacle-local X/Z (`frame: "local"`, the
   * default) or world X/Z (`frame: "world"`). The piece lands on the obstacle's highest
   * upward-facing surface over that point: a deck, a bank, a curved transition.
   */
  readonly xM: number;
  readonly zM: number;
  readonly frame?: "local" | "world";
  /**
   * Turn about the surface normal, rad. At 0 the art's up points up the slope (on a
   * flat top: toward world −Z, like `graffitiOnGround`).
   */
  readonly rotationRad?: number;
}

/** Faces that count as "looking up" for `graffitiOnObstacleSurface` (normal y ≥ this). */
const UPWARD_MIN_NY = 0.05;

/**
 * A graffiti placement on the riding surface of an obstacle (a funbox bank or top, a
 * quarter pipe's transition or deck, a hip, a platform top): a straight-down ray at the
 * given X/Z meets the obstacle's highest upward-facing face; the piece is centred there
 * with that face's normal (on a curved transition, the facet's normal), and the renderer
 * projects it so it follows the slope and the curve. Throws a `RangeError` when the
 * obstacle has no upward-facing surface over that point.
 */
export function graffitiOnObstacleSurface(
  obstacle: Obstacle,
  options: GraffitiOnSurfaceOptions,
): GraffitiPlacement {
  const at =
    (options.frame ?? "local") === "world"
      ? Vec3.create(options.xM, 0, options.zM)
      : Transform.toWorldPoint(obstacle.transform, Vec3.create(options.xM, 0, options.zM));
  let best: { y: number; normal: Vec3 } | undefined;
  for (const piece of obstacleGeometry(obstacle).pieces) {
    const v = piece.verticesM.map((p) => Transform.toWorldPoint(obstacle.transform, p));
    for (const face of piece.faces) {
      const pts = face.indices.map((i) => v[i]).filter((p): p is Vec3 => p !== undefined);
      if (pts.length < 3) continue;
      let newell = Vec3.ZERO;
      for (let k = 0; k < pts.length; k += 1) {
        const a = pts[k];
        const b = pts[(k + 1) % pts.length];
        if (a !== undefined && b !== undefined) newell = Vec3.add(newell, Vec3.cross(a, b));
      }
      const len = Vec3.length(newell);
      if (len < 1e-12) continue;
      const n = Vec3.scale(newell, 1 / len);
      if (n.y < UPWARD_MIN_NY || !insideXZ(pts, at.x, at.z)) continue;
      const p0 = pts[0] as Vec3;
      // The face's plane: n · (p − p0) = 0, solved for y at (x, z).
      const y = p0.y - (n.x * (at.x - p0.x) + n.z * (at.z - p0.z)) / n.y;
      if (best === undefined || y > best.y) best = { y, normal: n };
    }
  }
  if (best === undefined) {
    throw new RangeError(
      `graffitiOnObstacleSurface: "${obstacle.id}" has no upward surface at (${at.x}, ${at.z})`,
    );
  }
  return createGraffiti({
    pieceId: options.pieceId,
    positionM: Vec3.create(at.x, best.y, at.z),
    normal: best.normal,
    sizeM: options.sizeM,
    ...(options.rotationRad === undefined ? {} : { rotationRad: options.rotationRad }),
  });
}

/** True when (x, z) lies inside (or on) the convex polygon `pts` seen from above. */
function insideXZ(pts: readonly Vec3[], x: number, z: number): boolean {
  let sign = 0;
  for (let k = 0; k < pts.length; k += 1) {
    const a = pts[k] as Vec3;
    const b = pts[(k + 1) % pts.length] as Vec3;
    const cross = (b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x);
    if (Math.abs(cross) < 1e-12) continue;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** Validates and freezes a placement (unit normal). Throws a `RangeError` when invalid. */
export function createGraffiti(input: GraffitiPlacement): GraffitiPlacement {
  if (typeof input.pieceId !== "string" || input.pieceId.trim() === "") {
    throw new RangeError("graffiti: pieceId must be a non-empty string");
  }
  if (!(Number.isFinite(input.sizeM) && input.sizeM > 0)) {
    throw new RangeError(`graffiti "${input.pieceId}": sizeM must be positive`);
  }
  const len = Vec3.length(input.normal);
  if (!(Number.isFinite(len) && len > 1e-6)) {
    throw new RangeError(`graffiti "${input.pieceId}": normal must be non-zero`);
  }
  const p = input.positionM;
  if (![p.x, p.y, p.z].every(Number.isFinite)) {
    throw new RangeError(`graffiti "${input.pieceId}": positionM must be finite`);
  }
  if (input.rotationRad !== undefined && !Number.isFinite(input.rotationRad)) {
    throw new RangeError(`graffiti "${input.pieceId}": rotationRad must be finite`);
  }
  return Object.freeze({ ...input, normal: Vec3.scale(input.normal, 1 / len) });
}
