/**
 * Immutable 3D vector value object (plain data, safe to put in events and snapshots).
 * Units depend on usage: name fields with the unit (`positionM`, `forceN`, …).
 * Frame: world is right-handed, Y-up (see docs/adr/0002).
 */
export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

function assertFinite(x: number, y: number, z: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    throw new RangeError(`Vec3 components must be finite, got (${x}, ${y}, ${z})`);
  }
}

/** Creates a validated Vec3. Throws `RangeError` on NaN / Infinity. */
function create(x: number, y: number, z: number): Vec3 {
  assertFinite(x, y, z);
  return Object.freeze({ x, y, z });
}

const ZERO: Vec3 = create(0, 0, 0);
const UNIT_X: Vec3 = create(1, 0, 0);
const UNIT_Y: Vec3 = create(0, 1, 0);
const UNIT_Z: Vec3 = create(0, 0, 1);

function add(a: Vec3, b: Vec3): Vec3 {
  return create(a.x + b.x, a.y + b.y, a.z + b.z);
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return create(a.x - b.x, a.y - b.y, a.z - b.z);
}

function scale(v: Vec3, s: number): Vec3 {
  return create(v.x * s, v.y * s, v.z * s);
}

function negate(v: Vec3): Vec3 {
  return create(-v.x, -v.y, -v.z);
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return create(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}

function lengthSq(v: Vec3): number {
  return dot(v, v);
}

function length(v: Vec3): number {
  return Math.sqrt(lengthSq(v));
}

function distance(a: Vec3, b: Vec3): number {
  return length(sub(a, b));
}

/** Unit vector in the direction of `v`; returns ZERO for a (near-)zero vector. */
function normalize(v: Vec3): Vec3 {
  const len = length(v);
  return len < 1e-12 ? ZERO : scale(v, 1 / len);
}

/** Linear interpolation; `t` is not clamped. */
function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return create(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
}

function equals(a: Vec3, b: Vec3, epsilon = 1e-9): boolean {
  return (
    Math.abs(a.x - b.x) <= epsilon &&
    Math.abs(a.y - b.y) <= epsilon &&
    Math.abs(a.z - b.z) <= epsilon
  );
}

/** Namespace of Vec3 factory + pure operations. Every operation returns a new frozen Vec3. */
export const Vec3 = Object.freeze({
  create,
  ZERO,
  UNIT_X,
  UNIT_Y,
  UNIT_Z,
  add,
  sub,
  scale,
  negate,
  dot,
  cross,
  length,
  lengthSq,
  distance,
  normalize,
  lerp,
  equals,
});
