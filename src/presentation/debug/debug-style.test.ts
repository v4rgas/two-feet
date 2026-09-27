import { describe, expect, it } from "vitest";
import { Vec3 } from "../../shared";
import { PRESENTATION_CONFIG } from "../presentation.config";
import type { DebugVector } from "../render-frame";
import { arrowLengthM, arrowOpacity, arrowRadiusM } from "./debug-style";

const D = PRESENTATION_CONFIG.debug;

function vector(kind: DebugVector["kind"], ageS: number): DebugVector {
  return {
    kind,
    foot: "back",
    label: "pop",
    originWorldM: Vec3.ZERO,
    vectorWorld: Vec3.create(0, -3, 4),
    ageS,
  };
}

describe("debug arrows", () => {
  it("scales forces per N and impulses per N·s; impulses are thicker", () => {
    expect(arrowLengthM(vector("force", 0), D)).toBeCloseTo(5 * D.forceScaleMPerN);
    expect(arrowLengthM(vector("impulse", 0), D)).toBeCloseTo(5 * D.impulseScaleMPerNs);
    expect(arrowRadiusM(vector("impulse", 0), D)).toBeGreaterThan(
      arrowRadiusM(vector("force", 0), D),
    );
  });

  it("fades impulses out over 200 ms; forces stay opaque", () => {
    expect(D.impulseFadeS).toBeCloseTo(0.2);
    expect(arrowOpacity(vector("impulse", 0), D)).toBe(1);
    expect(arrowOpacity(vector("impulse", 0.1), D)).toBeCloseTo(0.5);
    expect(arrowOpacity(vector("impulse", 0.25), D)).toBe(0);
    expect(arrowOpacity(vector("force", 5), D)).toBe(1);
  });
});
