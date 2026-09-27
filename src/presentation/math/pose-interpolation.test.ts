import { describe, expect, it } from "vitest";
import { Quat, Transform, Vec3 } from "../../shared";
import { createPose, interpolateTransformInto, rotateByPose } from "./pose-interpolation";

function expectPoseMatches(alpha: number, a: Transform, b: Transform): void {
  const pose = createPose();
  interpolateTransformInto(pose, a, b, alpha);
  const ref = Transform.interpolate(a, b, alpha);
  expect(pose.px).toBeCloseTo(ref.positionM.x, 9);
  expect(pose.py).toBeCloseTo(ref.positionM.y, 9);
  expect(pose.pz).toBeCloseTo(ref.positionM.z, 9);
  const q = Quat.create(pose.qx, pose.qy, pose.qz, pose.qw);
  expect(Quat.equals(q, ref.rotation, 1e-9)).toBe(true);
}

describe("interpolateTransformInto", () => {
  const a = Transform.create(Vec3.create(0, 0.1, 0), Quat.IDENTITY);
  const b = Transform.create(
    Vec3.create(1, 0.5, -2),
    Quat.fromAxisAngle(Vec3.create(1, 0.3, 0), 2.4),
  );

  it("matches the shared kernel's Transform.interpolate", () => {
    for (const alpha of [0, 0.25, 0.5, 0.9, 1]) expectPoseMatches(alpha, a, b);
  });

  it("takes the shortest arc when the quaternions are in opposite hemispheres", () => {
    const q = Quat.fromAxisAngle(Vec3.UNIT_X, 0.4);
    const negated = Quat.create(-q.x, -q.y, -q.z, -q.w);
    const pose = createPose();
    interpolateTransformInto(
      pose,
      Transform.create(Vec3.ZERO, Quat.IDENTITY),
      Transform.create(Vec3.ZERO, negated),
      0.5,
    );
    const mid = Quat.create(pose.qx, pose.qy, pose.qz, pose.qw);
    expect(Quat.equals(mid, Quat.fromAxisAngle(Vec3.UNIT_X, 0.2), 1e-9)).toBe(true);
  });

  it("clamps alpha into [0, 1]", () => {
    const pose = createPose();
    interpolateTransformInto(pose, a, b, 1.7);
    expect(pose.px).toBeCloseTo(1);
    interpolateTransformInto(pose, a, b, -3);
    expect(pose.px).toBeCloseTo(0);
  });

  it("produces unit quaternions for nearly identical rotations (nlerp branch)", () => {
    const pose = createPose();
    const q1 = Quat.fromAxisAngle(Vec3.UNIT_Y, 0.001);
    interpolateTransformInto(pose, Transform.IDENTITY, Transform.create(Vec3.ZERO, q1), 0.5);
    expect(Math.hypot(pose.qx, pose.qy, pose.qz, pose.qw)).toBeCloseTo(1, 12);
  });
});

describe("rotateByPose", () => {
  it("agrees with Quat.rotate", () => {
    const q = Quat.fromAxisAngle(Vec3.create(0.2, 1, -0.5), 1.3);
    const pose = createPose();
    Object.assign(pose, { qx: q.x, qy: q.y, qz: q.z, qw: q.w });
    const out: [number, number, number] = [0, 0, 0];
    rotateByPose(pose, 0.3, -1, 2, out);
    const ref = Quat.rotate(q, Vec3.create(0.3, -1, 2));
    expect(out[0]).toBeCloseTo(ref.x, 12);
    expect(out[1]).toBeCloseTo(ref.y, 12);
    expect(out[2]).toBeCloseTo(ref.z, 12);
  });
});
