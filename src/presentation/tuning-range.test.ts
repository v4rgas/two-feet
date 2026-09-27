import { describe, expect, it } from "vitest";
import { sliderRange } from "./tuning-range";

describe("sliderRange", () => {
  it("uses integer steps for integer defaults", () => {
    expect(sliderRange(2048)).toEqual({ min: 0, max: 8192, step: 1 });
  });

  it("spans 0..4× with a step two decades below the value", () => {
    const r = sliderRange(0.027);
    expect(r.min).toBe(0);
    expect(r.max).toBeCloseTo(0.108);
    expect(r.step).toBeCloseTo(0.0001);
  });

  it("handles negatives and zero", () => {
    const g = sliderRange(-9.81);
    expect(g.min).toBeCloseTo(-39.24);
    expect(g.max).toBe(0);
    expect(sliderRange(0)).toEqual({ min: -1, max: 1, step: 0.001 });
  });
});
