import type { Quat, Transform, Vec3 } from "../../shared";

/**
 * Allocation-free render interpolation (REQUIREMENTS §1.4: rendering interpolates between
 * physics states). Results are written into caller-owned mutable structs, so the hot
 * path creates no objects. Semantics match `Transform.interpolate` in the shared kernel.
 */

/** Mutable position + rotation, reused every frame. */
export interface MutablePose {
  px: number;
  py: number;
  pz: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
}

export function createPose(): MutablePose {
  return { px: 0, py: 0, pz: 0, qx: 0, qy: 0, qz: 0, qw: 1 };
}

/** Below this angle between the quaternions, slerp falls back to nlerp (numerically safer). */
const NLERP_COS_THRESHOLD = 0.9995;

/** Writes lerp(a, b, t) into `out` position. */
export function lerpPositionInto(out: MutablePose, a: Vec3, b: Vec3, t: number): void {
  out.px = a.x + (b.x - a.x) * t;
  out.py = a.y + (b.y - a.y) * t;
  out.pz = a.z + (b.z - a.z) * t;
}

/** Writes slerp(a, b, t) (shortest arc, normalized) into `out` rotation. */
export function slerpRotationInto(out: MutablePose, a: Quat, b: Quat, t: number): void {
  let cos = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  const sign = cos < 0 ? -1 : 1;
  cos *= sign;
  let wa: number;
  let wb: number;
  if (cos > NLERP_COS_THRESHOLD) {
    wa = 1 - t;
    wb = t * sign;
  } else {
    const theta = Math.acos(cos);
    const sinTheta = Math.sin(theta);
    wa = Math.sin((1 - t) * theta) / sinTheta;
    wb = (Math.sin(t * theta) / sinTheta) * sign;
  }
  const x = wa * a.x + wb * b.x;
  const y = wa * a.y + wb * b.y;
  const z = wa * a.z + wb * b.z;
  const w = wa * a.w + wb * b.w;
  const len = Math.hypot(x, y, z, w) || 1;
  out.qx = x / len;
  out.qy = y / len;
  out.qz = z / len;
  out.qw = w / len;
}

/** Interpolates two transforms by `alpha` (clamped to [0, 1]) into `out`. */
export function interpolateTransformInto(
  out: MutablePose,
  previous: Transform,
  current: Transform,
  alpha: number,
): void {
  const t = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
  lerpPositionInto(out, previous.positionM, current.positionM, t);
  slerpRotationInto(out, previous.rotation, current.rotation, t);
}

/** Rotates the local vector (lx, ly, lz) by the pose rotation and writes into `out` (a 3-array). */
export function rotateByPose(
  pose: MutablePose,
  lx: number,
  ly: number,
  lz: number,
  out: [number, number, number],
): void {
  // v' = v + 2w(u × v) + 2u × (u × v)
  const { qx, qy, qz, qw } = pose;
  const tx = 2 * (qy * lz - qz * ly);
  const ty = 2 * (qz * lx - qx * lz);
  const tz = 2 * (qx * ly - qy * lx);
  out[0] = lx + qw * tx + (qy * tz - qz * ty);
  out[1] = ly + qw * ty + (qz * tx - qx * tz);
  out[2] = lz + qw * tz + (qx * ty - qy * tx);
}
