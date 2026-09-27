import { Transform, Vec3 } from "../../../shared";
import type { Obstacle } from "./obstacle";
import type { ConvexPiece } from "./obstacle-geometry";
import { obstacleGeometry } from "./obstacle-geometry";

/*
 * GRAFFITI (pure level data). A graffiti placement is DECORATION: the renderer paints the
 * artwork named `pieceId` flat onto a surface as a decal. It is never a collider and never
 * changes physics. Maps list a couple of these in `Level.graffiti`.
 */

/** One graffiti decal on a surface (value object, world frame). */
export interface GraffitiPlacement {
  /** Artwork id in the presentation's graffiti registry (unknown ids are skipped there). */
  readonly pieceId: string;
  /** Centre of the piece, ON the surface, m. */
  readonly positionM: Vec3;
  /** Outward unit normal of the surface there. */
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
 * back (`-z`) instead. Throws if the obstacle has no face looking that way.
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
  const local = Vec3.add(
    Vec3.create(best.centroid.x, y, best.centroid.z),
    Vec3.scale(alongDir, along),
  );
  return createGraffiti({
    pieceId: options.pieceId,
    positionM: Transform.toWorldPoint(obstacle.transform, local),
    normal: Transform.toWorldDirection(obstacle.transform, n),
    sizeM: options.sizeM,
    ...(options.rotationRad === undefined ? {} : { rotationRad: options.rotationRad }),
  });
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
