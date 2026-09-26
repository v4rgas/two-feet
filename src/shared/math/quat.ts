import { Vec3 } from "./vec3";

/**
 * Immutable unit quaternion value object (plain data). Represents a rotation.
 * Convention: Hamilton product, `rotate(q, v)` = q · v · q⁻¹ (active rotation),
 * `multiply(a, b)` applies `b` first, then `a` (same as Three.js / Rapier).
 */
export interface Quat {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

const NORMALIZE_EPSILON = 1e-12;

function raw(x: number, y: number, z: number, w: number): Quat {
  return Object.freeze({ x, y, z, w });
}

/**
 * Creates a validated quaternion, normalized to unit length.
 * Throws `RangeError` on non-finite components or a zero-length quaternion.
 */
function create(x: number, y: number, z: number, w: number): Quat {
  if (![x, y, z, w].every(Number.isFinite)) {
    throw new RangeError(`Quat components must be finite, got (${x}, ${y}, ${z}, ${w})`);
  }
  const len = Math.hypot(x, y, z, w);
  if (len < NORMALIZE_EPSILON) {
    throw new RangeError("Quat must have non-zero length");
  }
  return raw(x / len, y / len, z / len, w / len);
}

const IDENTITY: Quat = raw(0, 0, 0, 1);

/** Rotation of `angleRad` around `axis` (any length, normalized internally). */
function fromAxisAngle(axis: Vec3, angleRad: number): Quat {
  const n = Vec3.normalize(axis);
  if (Vec3.lengthSq(n) === 0) return IDENTITY;
  const half = angleRad / 2;
  const s = Math.sin(half);
  return create(n.x * s, n.y * s, n.z * s, Math.cos(half));
}

/** Hamilton product `a * b`: the rotation that applies `b` first, then `a`. */
function multiply(a: Quat, b: Quat): Quat {
  return create(
    a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  );
}

/** Inverse rotation (for unit quaternions the conjugate). */
function conjugate(q: Quat): Quat {
  return raw(-q.x, -q.y, -q.z, q.w);
}

function dot(a: Quat, b: Quat): number {
  return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
}

/** Rotates vector `v` by `q` (e.g. board-local direction → world direction). */
function rotate(q: Quat, v: Vec3): Vec3 {
  // v' = v + 2w(u × v) + 2u × (u × v), with u = (x, y, z)
  const u = Vec3.create(q.x, q.y, q.z);
  const t = Vec3.scale(Vec3.cross(u, v), 2);
  return Vec3.add(Vec3.add(v, Vec3.scale(t, q.w)), Vec3.cross(u, t));
}

/** Rotates `v` by the inverse of `q` (e.g. world direction → board-local direction). */
function inverseRotate(q: Quat, v: Vec3): Vec3 {
  return rotate(conjugate(q), v);
}

/** Spherical interpolation along the shortest arc; `t` in [0, 1]. */
function slerp(a: Quat, b: Quat, t: number): Quat {
  let cos = dot(a, b);
  let bx = b.x;
  let by = b.y;
  let bz = b.z;
  let bw = b.w;
  if (cos < 0) {
    cos = -cos;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  if (cos > 0.9995) {
    return create(
      a.x + (bx - a.x) * t,
      a.y + (by - a.y) * t,
      a.z + (bz - a.z) * t,
      a.w + (bw - a.w) * t,
    );
  }
  const theta = Math.acos(cos);
  const sinTheta = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / sinTheta;
  const wb = Math.sin(t * theta) / sinTheta;
  return create(wa * a.x + wb * bx, wa * a.y + wb * by, wa * a.z + wb * bz, wa * a.w + wb * bw);
}

/**
 * Rotation vector (axis × angle, rad) of `q`, with angle in [0, π] (shortest arc).
 * Useful to turn a small per-step delta rotation into roll/yaw/pitch increments.
 */
function toRotationVector(q: Quat): Vec3 {
  // Pick the representative with w >= 0 so the angle is the shortest one.
  const sign = q.w < 0 ? -1 : 1;
  const x = q.x * sign;
  const y = q.y * sign;
  const z = q.z * sign;
  const w = Math.min(1, q.w * sign);
  const sinHalf = Math.hypot(x, y, z);
  if (sinHalf < 1e-9) {
    // Small-angle approximation: angle ≈ 2·sinHalf, axis ≈ (x, y, z)/sinHalf.
    return Vec3.create(2 * x, 2 * y, 2 * z);
  }
  const angle = 2 * Math.atan2(sinHalf, w);
  const k = angle / sinHalf;
  return Vec3.create(x * k, y * k, z * k);
}

/** True when both quaternions represent the same rotation (q and -q are equal). */
function equals(a: Quat, b: Quat, epsilon = 1e-9): boolean {
  return 1 - Math.abs(dot(a, b)) <= epsilon;
}

/** Namespace of Quat factory + pure operations. Every operation returns a new frozen Quat. */
export const Quat = Object.freeze({
  create,
  IDENTITY,
  fromAxisAngle,
  multiply,
  conjugate,
  dot,
  rotate,
  inverseRotate,
  slerp,
  toRotationVector,
  equals,
});
