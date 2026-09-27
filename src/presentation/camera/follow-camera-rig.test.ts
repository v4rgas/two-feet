import { describe, expect, it } from "vitest";
import { Vec3 } from "../../shared";
import type { MutablePose } from "../math/pose-interpolation";
import { createPose } from "../math/pose-interpolation";
import { PRESENTATION_CONFIG } from "../presentation.config";
import {
  FollowCameraRig,
  headingOf,
  heelSideSign,
  landingDipOffsetM,
  shakeEnvelope,
  targetHeading,
} from "./follow-camera-rig";

const CAM = PRESENTATION_CONFIG.camera;
const DT = 1 / 60;

function rollPose(rollRad: number): MutablePose {
  const pose = createPose();
  pose.py = 0.1;
  pose.qx = Math.sin(rollRad / 2);
  pose.qw = Math.cos(rollRad / 2);
  return pose;
}

describe("heading helpers", () => {
  it("heading 0 is +X, +π/2 is -Z (rotation around +Y)", () => {
    expect(headingOf(1, 0, 0.1)).toBeCloseTo(0);
    expect(headingOf(0, -1, 0.1)).toBeCloseTo(Math.PI / 2);
    expect(headingOf(0.01, 0, 0.1)).toBeNull();
  });

  it("follows travel when moving, the nose when slow on the ground, nothing when slow in the air", () => {
    expect(targetHeading(Vec3.create(0, 0, 3), 1, 0, true, 0.5)).toBeCloseTo(-Math.PI / 2);
    expect(targetHeading(Vec3.ZERO, 0, -1, true, 0.5)).toBeCloseTo(Math.PI / 2);
    expect(targetHeading(Vec3.ZERO, 1, 0, false, 0.5)).toBeNull();
  });

  it("offsets toward the heel side: -Z in regular, +Z in goofy", () => {
    expect(heelSideSign("regular")).toBe(-1);
    expect(heelSideSign("goofy")).toBe(1);
  });
});

describe("landing dip and bail shake", () => {
  it("dips down and comes back within the duration", () => {
    expect(landingDipOffsetM(0, 0.06, 0.3)).toBeCloseTo(0);
    expect(landingDipOffsetM(0.15, 0.06, 0.3)).toBeCloseTo(-0.06);
    expect(landingDipOffsetM(0.3, 0.06, 0.3)).toBe(0);
  });

  it("shake lasts at most its duration (STYLE.md: ≤150 ms)", () => {
    expect(CAM.bailShakeDurationS).toBeLessThanOrEqual(0.15);
    expect(shakeEnvelope(0, 0.15)).toBe(1);
    expect(shakeEnvelope(0.15, 0.15)).toBe(0);
    expect(shakeEnvelope(0.075, 0.15)).toBeCloseTo(0.5);
  });
});

describe("FollowCameraRig", () => {
  it("sits ~2.2 m behind, 1.2 m up and slightly to the heel side of a still board", () => {
    const rig = new FollowCameraRig(CAM);
    rig.update(rollPose(0), Vec3.ZERO, true, 0, "regular", DT);
    expect(rig.eye[0]).toBeCloseTo(-CAM.distanceBehindM);
    expect(rig.eye[1]).toBeCloseTo(0.1 + CAM.heightM);
    expect(rig.eye[2]).toBeCloseTo(-CAM.heelSideOffsetM);
    expect(rig.target[0]).toBeGreaterThan(0);
    expect(rig.fovDeg).toBe(CAM.fovDeg);
  });

  it("does not follow the board's roll (a flip keeps the camera still)", () => {
    const rig = new FollowCameraRig(CAM);
    const velocity = Vec3.create(3, 0, 0);
    rig.update(rollPose(0), velocity, true, 0, "regular", DT);
    const beforeY = rig.eye[1];
    const beforeZ = rig.eye[2];
    for (let i = 1; i <= 30; i += 1) {
      rig.update(rollPose((i / 30) * Math.PI * 2), velocity, false, i * DT, "regular", DT);
    }
    expect(rig.eye[1]).toBeCloseTo(beforeY, 6);
    expect(rig.eye[2]).toBeCloseTo(beforeZ, 6);
  });

  it("widens the FOV by +5° in the air and eases back after landing", () => {
    const rig = new FollowCameraRig(CAM);
    const pose = rollPose(0);
    for (let i = 0; i < 120; i += 1) rig.update(pose, Vec3.ZERO, false, 0.5, "regular", DT);
    expect(rig.fovDeg).toBeCloseTo(CAM.fovDeg + CAM.airborneFovExtraDeg, 1);
    rig.update(pose, Vec3.ZERO, true, 0, "regular", DT);
    expect(rig.fovDeg).toBeGreaterThan(CAM.fovDeg);
    for (let i = 0; i < 120; i += 1) rig.update(pose, Vec3.ZERO, true, 0, "regular", DT);
    expect(rig.fovDeg).toBeCloseTo(CAM.fovDeg, 1);
  });

  it("dips on landing and shakes on bail, then settles", () => {
    const rig = new FollowCameraRig(CAM);
    const pose = rollPose(0);
    for (let i = 0; i < 60; i += 1) rig.update(pose, Vec3.ZERO, true, 0, "regular", DT);
    const restY = rig.eye[1];
    rig.notifyLanding(-CAM.landingDipRefSpeedMps);
    for (let i = 0; i < 6; i += 1) rig.update(pose, Vec3.ZERO, true, 0, "regular", DT);
    expect(rig.eye[1]).toBeLessThan(restY - 0.01);
    rig.notifyBail();
    for (let i = 0; i < 30; i += 1) rig.update(pose, Vec3.ZERO, true, 0, "regular", DT);
    expect(rig.eye[1]).toBeCloseTo(restY, 6);
  });
});
