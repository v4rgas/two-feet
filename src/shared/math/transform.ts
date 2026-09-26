import { Quat } from "./quat";
import { Vec3 } from "./vec3";

/**
 * Rigid transform value object: position (m, world) + rotation (local → world).
 * For the board, "local" is the board frame: +X nose, +Y up, +Z see ADR 0002.
 */
export interface Transform {
  readonly positionM: Vec3;
  readonly rotation: Quat;
}

function create(positionM: Vec3, rotation: Quat): Transform {
  return Object.freeze({ positionM, rotation });
}

const IDENTITY: Transform = create(Vec3.ZERO, Quat.IDENTITY);

/** Local point → world point. */
function toWorldPoint(t: Transform, localPoint: Vec3): Vec3 {
  return Vec3.add(t.positionM, Quat.rotate(t.rotation, localPoint));
}

/** World point → local point. */
function toLocalPoint(t: Transform, worldPoint: Vec3): Vec3 {
  return Quat.inverseRotate(t.rotation, Vec3.sub(worldPoint, t.positionM));
}

/** Local direction → world direction (no translation). */
function toWorldDirection(t: Transform, localDir: Vec3): Vec3 {
  return Quat.rotate(t.rotation, localDir);
}

/** World direction → local direction (no translation). */
function toLocalDirection(t: Transform, worldDir: Vec3): Vec3 {
  return Quat.inverseRotate(t.rotation, worldDir);
}

/** Interpolates position linearly and rotation spherically (render interpolation). */
function interpolate(a: Transform, b: Transform, t: number): Transform {
  return create(Vec3.lerp(a.positionM, b.positionM, t), Quat.slerp(a.rotation, b.rotation, t));
}

/** Namespace of Transform factory + pure operations. */
export const Transform = Object.freeze({
  create,
  IDENTITY,
  toWorldPoint,
  toLocalPoint,
  toWorldDirection,
  toLocalDirection,
  interpolate,
});
