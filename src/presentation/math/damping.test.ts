import { describe, expect, it } from "vitest";
import {
  createSpring,
  easeExponential,
  stepCriticallyDamped,
  stepCriticallyDampedAngle,
} from "./damping";

function run(dtS: number, durationS: number, smoothTimeS: number): number[] {
  const s = createSpring(0);
  const values: number[] = [];
  for (let t = 0; t < durationS; t += dtS) {
    stepCriticallyDamped(s, 1, smoothTimeS, dtS);
    values.push(s.value);
  }
  return values;
}

describe("stepCriticallyDamped", () => {
  it("converges to the target without overshooting", () => {
    const values = run(1 / 60, 2, 0.2);
    for (const v of values) expect(v).toBeLessThanOrEqual(1 + 1e-9);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i] ?? 0).toBeGreaterThanOrEqual((values[i - 1] ?? 0) - 1e-12);
    }
    expect(values.at(-1)).toBeCloseTo(1, 3);
  });

  it("is roughly frame-rate independent", () => {
    const at60 = run(1 / 60, 0.3, 0.2).at(-1) ?? 0;
    const at144 = run(1 / 144, 0.3, 0.2).at(-1) ?? 0;
    expect(Math.abs(at60 - at144)).toBeLessThan(0.03);
  });

  it("stays stable for a huge time step", () => {
    const s = createSpring(0);
    stepCriticallyDamped(s, 5, 0.1, 10);
    expect(s.value).toBeCloseTo(5, 2);
    expect(Number.isFinite(s.velocity)).toBe(true);
  });

  it("does nothing for dt = 0", () => {
    const s = createSpring(2);
    stepCriticallyDamped(s, 5, 0.1, 0);
    expect(s.value).toBe(2);
  });
});

describe("stepCriticallyDampedAngle", () => {
  it("goes the short way across ±π", () => {
    const s = createSpring(Math.PI - 0.1);
    stepCriticallyDampedAngle(s, -Math.PI + 0.1, 0.2, 1 / 60);
    // Moves toward +π (and wraps), never back through 0.
    expect(Math.abs(s.value)).toBeGreaterThan(Math.PI - 0.1);
  });

  it("keeps the value in (-π, π] and converges", () => {
    const s = createSpring(3);
    for (let i = 0; i < 200; i += 1) stepCriticallyDampedAngle(s, -3, 0.1, 1 / 60);
    expect(s.value).toBeGreaterThan(-Math.PI);
    expect(s.value).toBeLessThanOrEqual(Math.PI);
    expect(s.value).toBeCloseTo(-3, 3);
  });
});

describe("easeExponential", () => {
  it("reaches ~63 % after one time constant and snaps with tau 0", () => {
    expect(easeExponential(0, 1, 0.25, 0.25)).toBeCloseTo(1 - Math.exp(-1));
    expect(easeExponential(0, 1, 0, 0.01)).toBe(1);
  });
});
