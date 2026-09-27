import { describe, expect, it } from "vitest";
import { Quat, Transform, Vec3 } from "../../../shared";
import { BOARD_CONFIG } from "../board.config";
import { BoardSpec } from "./board-spec";
import type { BoardContact } from "./physics-world";
import {
  followLeanRad,
  rollingLoadScale,
  targetLeanRad,
  truckSteerRad,
  tyreForces,
  wheelLoadRollMomentNm,
  wheelRollingDirLocal,
} from "./tyre-model";

const spec = BoardSpec.create(BOARD_CONFIG.spec);
const params = BOARD_CONFIG.physics;
const DT = 1 / 120;

function wheelContact(part: BoardContact["part"], loadN: number): BoardContact {
  return {
    part,
    surface: "ground",
    obstacleId: "ground",
    pointWorldM: Vec3.ZERO,
    normalWorld: Vec3.UNIT_Y,
    normalImpulseNs: loadN * DT,
  };
}

describe("tyre model", () => {
  it("turns more load on the +Z wheels into a positive lean and steer, clamped", () => {
    const contacts = [
      wheelContact("noseRightWheel", 60),
      wheelContact("tailRightWheel", 60),
      wheelContact("noseLeftWheel", 40),
      wheelContact("tailLeftWheel", 40),
    ];
    const moment = wheelLoadRollMomentNm(spec, contacts, DT, params);
    expect(moment).toBeCloseTo(40 * (spec.trucks.axleTrackM / 2));
    const lean = targetLeanRad(spec, moment, params);
    expect(lean).toBeGreaterThan(0);
    expect(truckSteerRad(spec, lean)).toBeCloseTo(lean * spec.trucks.steerPerLean);
    expect(targetLeanRad(spec, 1e6, params)).toBe(spec.trucks.maxLeanRad);
    expect(targetLeanRad(spec, -1e6, params)).toBe(-spec.trucks.maxLeanRad);
    expect(truckSteerRad(spec, 10)).toBe(spec.trucks.maxSteerRad);
  });

  it("follows the target lean with a first-order lag", () => {
    const next = followLeanRad(0, 0.2, DT, params);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(0.2);
    expect(followLeanRad(0, 0.2, 10, params)).toBe(0.2);
  });

  it("steers the nose axle toward +Z and the tail axle toward -Z for positive steer", () => {
    expect(wheelRollingDirLocal("noseLeftWheel", 0.1).z).toBeGreaterThan(0);
    expect(wheelRollingDirLocal("tailLeftWheel", 0.1).z).toBeLessThan(0);
    expect(Vec3.equals(wheelRollingDirLocal("noseRightWheel", 0), Vec3.UNIT_X)).toBe(true);
  });

  it("opposes sideways slip up to μ·N and rolling with Crr·N", () => {
    const base = {
      wheel: "noseLeftWheel" as const,
      contact: wheelContact("noseLeftWheel", 100),
      boardTransform: Transform.IDENTITY,
      steerRad: 0,
      rollingLoadScale: 1,
      dtS: DT,
    };
    const slow = tyreForces({ ...base, velocityAtContactMps: Vec3.create(2, 0, 0.1) }, params);
    const grip = slow.find((f) => f.label === "grip");
    const rolling = slow.find((f) => f.label === "rolling");
    expect(grip?.forceN.z).toBeCloseTo(-params.lateralGripDampingNsPerM * 0.1);
    expect(rolling?.forceN.x).toBeCloseTo(-params.rollingResistanceCoeff * 100);

    const skid = tyreForces({ ...base, velocityAtContactMps: Vec3.create(0, 0, 50) }, params);
    const skidGrip = skid.find((f) => f.label === "grip");
    expect(skidGrip?.forceN.z).toBeCloseTo(-params.lateralGripCoeff * 100);
  });

  it("works in the board frame, whatever the board heading", () => {
    const heading = Quat.fromAxisAngle(Vec3.UNIT_Y, Math.PI / 2); // nose toward world -Z
    const forces = tyreForces(
      {
        wheel: "tailRightWheel",
        contact: wheelContact("tailRightWheel", 100),
        boardTransform: Transform.create(Vec3.ZERO, heading),
        velocityAtContactMps: Vec3.create(0.1, 0, -2), // forward + sideways slip
        steerRad: 0,
        rollingLoadScale: 1,
        dtS: DT,
      },
      params,
    );
    expect(forces.find((f) => f.label === "grip")?.forceN.x).toBeLessThan(0);
    expect(forces.find((f) => f.label === "rolling")?.forceN.z).toBeGreaterThan(0);
  });

  it("does nothing on an unloaded wheel, and fades rolling resistance near rest", () => {
    const input = {
      wheel: "noseLeftWheel" as const,
      contact: wheelContact("noseLeftWheel", 0),
      boardTransform: Transform.IDENTITY,
      velocityAtContactMps: Vec3.create(1, 0, 1),
      steerRad: 0,
      rollingLoadScale: 1,
      dtS: DT,
    };
    expect(tyreForces(input, params)).toEqual([]);
    const still = tyreForces(
      { ...input, contact: wheelContact("noseLeftWheel", 100), velocityAtContactMps: Vec3.ZERO },
      params,
    );
    expect(still).toEqual([]);
  });

  it("scales the rolling load down to the board's own weight", () => {
    expect(rollingLoadScale(20, 0)).toBe(0);
    expect(rollingLoadScale(20, 10)).toBe(1);
    expect(rollingLoadScale(20, 520)).toBeCloseTo(20 / 520);
  });
});
