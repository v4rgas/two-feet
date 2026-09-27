import { describe, expect, it } from "vitest";
import { Quat, TAU, Vec3 } from "../../../shared";
import { LocalRotationAccumulator } from "./rotation-accumulator";

function spin(start: Quat, localAxis: Vec3, totalRad: number, steps: number) {
  const acc = new LocalRotationAccumulator();
  acc.reset(start);
  let q = start;
  for (let i = 0; i < steps; i += 1) {
    q = Quat.multiply(q, Quat.fromAxisAngle(localAxis, totalRad / steps));
    acc.add(q);
  }
  return acc.totals;
}

describe("LocalRotationAccumulator", () => {
  it("counts multi-turn flips without wrapping, with the ADR 0002 sign", () => {
    const start = Quat.fromAxisAngle(Vec3.UNIT_Y, 1.1);
    expect(spin(start, Vec3.UNIT_X, 2 * TAU, 96).rollRad).toBeCloseTo(2 * TAU, 6);
    expect(spin(start, Vec3.UNIT_X, -TAU, 48).rollRad).toBeCloseTo(-TAU, 6);
  });

  it("keeps the axes apart (yaw on local Y, pitch on local Z)", () => {
    const t = spin(Quat.IDENTITY, Vec3.UNIT_Y, Math.PI, 40);
    expect(t.yawRad).toBeCloseTo(Math.PI, 6);
    expect(t.rollRad).toBeCloseTo(0, 6);
    expect(spin(Quat.IDENTITY, Vec3.UNIT_Z, -0.5, 10).pitchRad).toBeCloseTo(-0.5, 6);
  });

  it("starts from zero after reset", () => {
    const acc = new LocalRotationAccumulator();
    acc.reset(Quat.IDENTITY);
    acc.add(Quat.fromAxisAngle(Vec3.UNIT_X, 0.3));
    acc.reset(Quat.IDENTITY);
    expect(acc.totals).toEqual({ rollRad: 0, yawRad: 0, pitchRad: 0 });
  });
});
