import { describe, expect, it } from "vitest";
import { StickValue } from "./stick-value";

describe("StickValue", () => {
  it("rejects values outside [-1, 1]", () => {
    expect(() => StickValue.create(1.01, 0)).toThrow(RangeError);
    expect(() => StickValue.create(0, Number.NaN)).toThrow(RangeError);
  });

  it("clamps", () => {
    expect(StickValue.clamped(2, -3)).toEqual({ x: 1, y: -1 });
    expect(StickValue.clamped(Number.NaN, 0.5)).toEqual({ x: 0, y: 0.5 });
  });

  it("detects neutral within a deadzone", () => {
    expect(StickValue.isNeutral(StickValue.create(0.04, -0.04), 0.05)).toBe(true);
    expect(StickValue.isNeutral(StickValue.create(0.2, 0), 0.05)).toBe(false);
  });
});
