import { describe, expect, it } from "vitest";
import { INPUT_CONFIG } from "../input.config";
import { SpringVirtualStick } from "./spring-virtual-stick";
import { StickValue } from "./stick-value";

const DT = 1 / 120;

function run(stick: SpringVirtualStick, target: StickValue, steps: number): void {
  for (let i = 0; i < steps; i += 1) stick.update(target, DT);
}

describe("SpringVirtualStick", () => {
  it("starts neutral with zero velocity", () => {
    const stick = new SpringVirtualStick(INPUT_CONFIG.stick);
    expect(stick.value).toEqual({ x: 0, y: 0 });
    expect(stick.velocityPerS).toEqual({ x: 0, y: 0 });
  });

  it("smoothly converges to a held target without leaving [-1, 1]", () => {
    const stick = new SpringVirtualStick(INPUT_CONFIG.stick);
    const target = StickValue.create(1, -1);
    stick.update(target, DT);
    // One step moves only a little: it is smoothed, not snapped.
    expect(stick.value.x).toBeGreaterThan(0);
    expect(stick.value.x).toBeLessThan(0.2);
    let previous = stick.value.x;
    for (let i = 0; i < 60; i += 1) {
      stick.update(target, DT);
      expect(Math.abs(stick.value.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(stick.value.y)).toBeLessThanOrEqual(1);
      expect(stick.value.x).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = stick.value.x;
    }
    expect(stick.value.x).toBeCloseTo(1, 2);
    expect(stick.value.y).toBeCloseTo(-1, 2);
  });

  it("reaches most of a full press within ~0.15 s", () => {
    const stick = new SpringVirtualStick(INPUT_CONFIG.stick);
    run(stick, StickValue.create(0, 1), Math.round(0.15 / DT));
    expect(stick.value.y).toBeGreaterThan(0.9);
  });

  it("reports the velocity of the smoothed value (matches the finite difference)", () => {
    const stick = new SpringVirtualStick(INPUT_CONFIG.stick);
    const target = StickValue.create(1, 0);
    run(stick, target, 3);
    for (let i = 0; i < 10; i += 1) {
      const rawBefore = stick.velocityPerS.x;
      const before = stick.value.x;
      stick.update(target, DT);
      const finiteDifference = (stick.value.x - before) / DT;
      const dz = INPUT_CONFIG.stick.deadzone;
      // value is deadzone-rescaled by 1/(1-dz); semi-implicit Euler uses the new velocity.
      expect(finiteDifference * (1 - dz)).toBeCloseTo(stick.velocityPerS.x, 6);
      expect(rawBefore).toBeGreaterThan(0);
    }
  });

  it("a digital press produces a flick-sized velocity peak (> 8 /s)", () => {
    const stick = new SpringVirtualStick(INPUT_CONFIG.stick);
    let peak = 0;
    for (let i = 0; i < 30; i += 1) {
      stick.update(StickValue.create(1, 0), DT);
      peak = Math.max(peak, stick.velocityPerS.x);
    }
    expect(peak).toBeGreaterThan(8);
  });

  it("returns to exact neutral (deadzone) after release, with negligible overshoot", () => {
    const stick = new SpringVirtualStick(INPUT_CONFIG.stick);
    run(stick, StickValue.create(-1, 1), 60);
    let minY = 1;
    for (let i = 0; i < 120; i += 1) {
      stick.update(StickValue.NEUTRAL, DT);
      minY = Math.min(minY, stick.value.y);
    }
    expect(stick.value).toEqual({ x: 0, y: 0 });
    expect(StickValue.isNeutral(stick.value, INPUT_CONFIG.stick.deadzone)).toBe(true);
    expect(minY).toBeGreaterThanOrEqual(-0.01);
  });

  it("applies a rescaled deadzone: tiny values read as 0, full deflection stays 1", () => {
    const stick = new SpringVirtualStick({ ...INPUT_CONFIG.stick, deadzone: 0.2 });
    stick.update(StickValue.create(1, 0), DT);
    expect(stick.value.x).toBe(0);
    run(stick, StickValue.create(1, 0), 200);
    expect(stick.value.x).toBeCloseTo(1, 3);
  });

  it("reset snaps to neutral with zero velocity", () => {
    const stick = new SpringVirtualStick(INPUT_CONFIG.stick);
    run(stick, StickValue.create(1, 1), 5);
    stick.reset();
    expect(stick.value).toEqual({ x: 0, y: 0 });
    expect(stick.velocityPerS).toEqual({ x: 0, y: 0 });
  });

  it("ignores non-positive time steps", () => {
    const stick = new SpringVirtualStick(INPUT_CONFIG.stick);
    stick.update(StickValue.create(1, 1), 0);
    stick.update(StickValue.create(1, 1), -1);
    expect(stick.value).toEqual({ x: 0, y: 0 });
  });
});
