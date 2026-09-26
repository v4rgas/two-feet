import { describe, expect, it } from "vitest";
import { degToRad, radToDeg, shortestDelta, TAU, turns, wrapPi } from "./angle";
import { Quat } from "./quat";
import { Transform } from "./transform";
import { Vec2 } from "./vec2";
import { Vec3 } from "./vec3";

const EPS = 1e-9;

function expectVec(actual: Vec3, expected: Vec3, eps = EPS): void {
  expect(Vec3.equals(actual, expected, eps)).toBe(true);
}

describe("Vec3", () => {
  it("rejects non-finite components", () => {
    expect(() => Vec3.create(Number.NaN, 0, 0)).toThrow(RangeError);
    expect(() => Vec3.create(0, Number.POSITIVE_INFINITY, 0)).toThrow(RangeError);
  });

  it("is immutable", () => {
    const v = Vec3.create(1, 2, 3);
    expect(Object.isFrozen(v)).toBe(true);
  });

  it("does basic arithmetic", () => {
    const a = Vec3.create(1, 2, 3);
    const b = Vec3.create(4, 5, 6);
    expectVec(Vec3.add(a, b), Vec3.create(5, 7, 9));
    expectVec(Vec3.sub(b, a), Vec3.create(3, 3, 3));
    expectVec(Vec3.scale(a, 2), Vec3.create(2, 4, 6));
    expect(Vec3.dot(a, b)).toBe(32);
    expect(Vec3.length(Vec3.create(3, 4, 0))).toBe(5);
  });

  it("cross product follows the right-hand rule", () => {
    expectVec(Vec3.cross(Vec3.UNIT_X, Vec3.UNIT_Y), Vec3.UNIT_Z);
  });

  it("normalizes, and maps zero to zero", () => {
    expect(Vec3.length(Vec3.normalize(Vec3.create(0, 3, 4)))).toBeCloseTo(1);
    expectVec(Vec3.normalize(Vec3.ZERO), Vec3.ZERO);
  });

  it("lerps", () => {
    expectVec(Vec3.lerp(Vec3.ZERO, Vec3.create(2, 4, 6), 0.5), Vec3.create(1, 2, 3));
  });
});

describe("Vec2", () => {
  it("validates and computes length", () => {
    expect(() => Vec2.create(Number.NaN, 0)).toThrow(RangeError);
    expect(Vec2.length(Vec2.create(3, 4))).toBe(5);
  });
});

describe("Quat", () => {
  it("normalizes on create and rejects zero length", () => {
    const q = Quat.create(0, 0, 0, 2);
    expect(q.w).toBe(1);
    expect(() => Quat.create(0, 0, 0, 0)).toThrow(RangeError);
  });

  it("rotates +X by 90° around +Y to -Z (right-handed, Y-up)", () => {
    const q = Quat.fromAxisAngle(Vec3.UNIT_Y, Math.PI / 2);
    expectVec(Quat.rotate(q, Vec3.UNIT_X), Vec3.create(0, 0, -1));
  });

  it("inverseRotate undoes rotate", () => {
    const q = Quat.fromAxisAngle(Vec3.create(1, 2, 3), 1.1);
    const v = Vec3.create(0.3, -2, 5);
    expectVec(Quat.inverseRotate(q, Quat.rotate(q, v)), v);
  });

  it("multiply applies the right operand first", () => {
    const yaw = Quat.fromAxisAngle(Vec3.UNIT_Y, Math.PI / 2);
    const roll = Quat.fromAxisAngle(Vec3.UNIT_X, Math.PI / 2);
    // roll first: +Y -> +Z; then yaw: +Z -> +X
    expectVec(Quat.rotate(Quat.multiply(yaw, roll), Vec3.UNIT_Y), Vec3.UNIT_X);
  });

  it("slerp hits the endpoints and the midpoint", () => {
    const a = Quat.IDENTITY;
    const b = Quat.fromAxisAngle(Vec3.UNIT_Z, Math.PI / 2);
    expect(Quat.equals(Quat.slerp(a, b, 0), a)).toBe(true);
    expect(Quat.equals(Quat.slerp(a, b, 1), b)).toBe(true);
    expect(Quat.equals(Quat.slerp(a, b, 0.5), Quat.fromAxisAngle(Vec3.UNIT_Z, Math.PI / 4))).toBe(
      true,
    );
  });

  it("toRotationVector returns axis * angle (shortest arc)", () => {
    const q = Quat.fromAxisAngle(Vec3.UNIT_X, 0.5);
    expectVec(Quat.toRotationVector(q), Vec3.create(0.5, 0, 0));
    const negated = Quat.create(-q.x, -q.y, -q.z, -q.w);
    expectVec(Quat.toRotationVector(negated), Vec3.create(0.5, 0, 0));
    expectVec(Quat.toRotationVector(Quat.IDENTITY), Vec3.ZERO);
  });

  it("equals treats q and -q as the same rotation", () => {
    const q = Quat.fromAxisAngle(Vec3.UNIT_Y, 1);
    expect(Quat.equals(q, Quat.create(-q.x, -q.y, -q.z, -q.w))).toBe(true);
  });
});

describe("Transform", () => {
  const t = Transform.create(Vec3.create(1, 0, 0), Quat.fromAxisAngle(Vec3.UNIT_Y, Math.PI / 2));

  it("maps local points to world and back", () => {
    const world = Transform.toWorldPoint(t, Vec3.UNIT_X);
    expectVec(world, Vec3.create(1, 0, -1));
    expectVec(Transform.toLocalPoint(t, world), Vec3.UNIT_X);
  });

  it("maps directions without translation", () => {
    expectVec(Transform.toWorldDirection(t, Vec3.UNIT_X), Vec3.create(0, 0, -1));
    expectVec(Transform.toLocalDirection(t, Vec3.create(0, 0, -1)), Vec3.UNIT_X);
  });

  it("interpolates", () => {
    const mid = Transform.interpolate(Transform.IDENTITY, t, 0.5);
    expectVec(mid.positionM, Vec3.create(0.5, 0, 0));
  });
});

describe("angle helpers", () => {
  it("converts degrees and radians", () => {
    expect(degToRad(180)).toBeCloseTo(Math.PI);
    expect(radToDeg(Math.PI / 2)).toBeCloseTo(90);
  });

  it("wraps into (-π, π]", () => {
    expect(wrapPi(Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapPi(-Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapPi(TAU + 0.1)).toBeCloseTo(0.1);
    expect(wrapPi(-TAU - 0.1)).toBeCloseTo(-0.1);
  });

  it("computes the shortest signed delta", () => {
    expect(shortestDelta(degToRad(170), degToRad(-170))).toBeCloseTo(degToRad(20));
    expect(shortestDelta(degToRad(-170), degToRad(170))).toBeCloseTo(degToRad(-20));
  });

  it("counts turns", () => {
    expect(turns(TAU * 1.5)).toBeCloseTo(1.5);
  });
});
