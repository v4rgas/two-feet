import { describe, expect, it } from "vitest";
import { TRICKS_CONFIG } from "../tricks.config";
import { AngleRange } from "./trick-definition";

describe("AngleRange", () => {
  it("validates bounds", () => {
    expect(() => AngleRange.range(1, 0)).toThrow(RangeError);
    expect(AngleRange.contains(AngleRange.around(0, 0.5), 0.5)).toBe(true);
    expect(AngleRange.contains(AngleRange.around(0, 0.5), 0.51)).toBe(false);
  });
});

describe("trick table", () => {
  it("has unique ids", () => {
    const ids = TRICKS_CONFIG.definitions.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
