import { describe, expect, it } from "vitest";
import { ManualClock } from "./clock";
import { FixedStepAccumulator } from "./fixed-step";

const STEP = 1 / 120;

describe("FixedStepAccumulator", () => {
  it("validates options", () => {
    expect(() => new FixedStepAccumulator({ stepS: 0, maxStepsPerAdvance: 4 })).toThrow(RangeError);
    expect(() => new FixedStepAccumulator({ stepS: STEP, maxStepsPerAdvance: 0 })).toThrow(
      RangeError,
    );
  });

  it("returns whole steps and keeps the remainder as alpha", () => {
    const acc = new FixedStepAccumulator({ stepS: STEP, maxStepsPerAdvance: 8 });
    expect(acc.advance(STEP * 2.5)).toBe(2);
    expect(acc.alpha).toBeCloseTo(0.5);
    expect(acc.advance(STEP * 0.5)).toBe(1);
    expect(acc.alpha).toBeCloseTo(0, 6);
  });

  it("does not lose steps to float error when summing many small frames", () => {
    const acc = new FixedStepAccumulator({ stepS: STEP, maxStepsPerAdvance: 8 });
    let total = 0;
    for (let i = 0; i < 1200; i += 1) total += acc.advance(STEP);
    expect(total).toBe(1200);
  });

  it("runs ~2 steps per 60 Hz frame", () => {
    const acc = new FixedStepAccumulator({ stepS: STEP, maxStepsPerAdvance: 8 });
    let total = 0;
    for (let i = 0; i < 60; i += 1) total += acc.advance(1 / 60);
    expect(total).toBe(120);
  });

  it("caps steps per advance and drops the excess time", () => {
    const acc = new FixedStepAccumulator({ stepS: STEP, maxStepsPerAdvance: 4 });
    expect(acc.advance(1)).toBe(4);
    expect(acc.droppedS).toBeCloseTo(1 - 4 * STEP, 6);
    expect(acc.alpha).toBeLessThan(1);
  });

  it("ignores negative and non-finite elapsed time", () => {
    const acc = new FixedStepAccumulator({ stepS: STEP, maxStepsPerAdvance: 4 });
    expect(acc.advance(-1)).toBe(0);
    expect(acc.advance(Number.NaN)).toBe(0);
    expect(acc.alpha).toBe(0);
  });
});

describe("ManualClock", () => {
  it("advances deterministically and refuses to go backwards", () => {
    const clock = new ManualClock(1);
    clock.advance(0.5);
    expect(clock.nowS()).toBe(1.5);
    expect(() => clock.advance(-1)).toThrow(RangeError);
  });
});
