import { describe, expect, it } from "vitest";
import { CINEMATIC_CONFIG } from "./cinematic.config";
import type { ShotSubject } from "./shots";
import {
  blendPoses,
  deckShowcasePose,
  fisheyeFollowPose,
  fixedTripodPose,
  lowSidePose,
  slowOrbitPose,
  travelWithPose,
  verticalFovDeg,
} from "./shots";

const C = CINEMATIC_CONFIG;
/** Board at (10, 0.1, 2) travelling along +X, heel side on the left (regular). */
const SUBJECT: ShotSubject = { position: [10, 0.1, 2], headingRad: 0, heelSideSign: -1 };

const dist = (a: readonly number[], b: readonly number[]) =>
  Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[1] ?? 0) - (b[1] ?? 0), (a[2] ?? 0) - (b[2] ?? 0));

describe("cinematic shots (pure rigs)", () => {
  it("lowSide: beside the line on the asked side, low, leading, looking at the board", () => {
    const right = lowSidePose({ kind: "lowSide", side: "right" }, SUBJECT, C);
    const left = lowSidePose({ kind: "lowSide", side: "left" }, SUBJECT, C);
    // Travel +X: right is +Z.
    expect(right.eye[2]).toBeCloseTo(2 + C.shots.lowSide.distanceM);
    expect(left.eye[2]).toBeCloseTo(2 - C.shots.lowSide.distanceM);
    expect(right.eye[0]).toBeCloseTo(10 + C.shots.lowSide.leadM);
    expect(right.eye[1]).toBeCloseTo(0.1 + C.shots.lowSide.heightM);
    expect(right.target).toEqual([10, 0.1 + C.shots.lowSide.lookHeightM, 2]);
    // Turning the travel turns the rig with it.
    const turned = lowSidePose(
      { kind: "lowSide", side: "right" },
      { ...SUBJECT, headingRad: Math.PI / 2 },
      C,
    );
    expect(turned.eye[0]).toBeCloseTo(10 + C.shots.lowSide.distanceM); // +Z travel: right = +X
  });

  it("fixedTripod: the eye never moves, the target follows, the FOV eases from start to end", () => {
    const spec = {
      kind: "fixedTripod",
      positionM: [0, 1, 5],
      fovStartDeg: 50,
      fovEndDeg: 30,
      zoomS: 4,
    } as const;
    const a = fixedTripodPose(spec, SUBJECT, 0, C);
    const b = fixedTripodPose(spec, { ...SUBJECT, position: [14, 0.5, 2] }, 2, C);
    const c = fixedTripodPose(spec, SUBJECT, 10, C);
    expect(a.eye).toEqual([0, 1, 5]);
    expect(b.eye).toEqual([0, 1, 5]);
    expect(b.target[0]).toBe(14);
    expect(a.fovDeg).toBe(50);
    expect(b.fovDeg).toBeCloseTo(40); // smoothstep midpoint
    expect(c.fovDeg).toBe(30);
  });

  it("fisheyeFollow: close behind on the heel side, low, ~95° horizontal FOV", () => {
    const p = fisheyeFollowPose({ kind: "fisheyeFollow" }, SUBJECT, 16 / 9, C);
    expect(p.eye[0]).toBeCloseTo(10 - C.shots.fisheyeFollow.distanceM);
    expect(p.eye[2]).toBeCloseTo(2 - C.shots.fisheyeFollow.sideM); // heel side = left = −Z
    expect(p.eye[1] - 0.1).toBeLessThan(0.5);
    expect(dist(p.eye, SUBJECT.position)).toBeLessThan(1.2);
    const hFov = (2 * Math.atan(Math.tan((p.fovDeg * Math.PI) / 360) * (16 / 9)) * 180) / Math.PI;
    expect(hFov).toBeCloseTo(95, 5);
  });

  it("slowOrbit: constant radius and height, angle advancing at the rate", () => {
    const spec = { kind: "slowOrbit", startAngleRad: 0, rateRadps: 0.5 } as const;
    const r = C.shots.slowOrbit.radiusM;
    const p0 = slowOrbitPose(spec, SUBJECT, 0, C);
    const p1 = slowOrbitPose(spec, SUBJECT, Math.PI, C); // 0.5 rad/s × π s = a quarter turn
    expect(p0.eye[0]).toBeCloseTo(10 + r); // start in front (travel +X)
    expect(p1.eye[0]).toBeCloseTo(10);
    expect(p1.eye[2]).toBeCloseTo(2 - r); // counter-clockwise from above: toward −Z
    for (const p of [p0, p1]) {
      expect(Math.hypot(p.eye[0] - 10, p.eye[2] - 2)).toBeCloseTo(r);
      expect(p.eye[1]).toBeCloseTo(0.1 + C.shots.slowOrbit.heightM);
    }
  });

  it("fisheyeFollow in a portrait frame keeps the fisheye's width as its height", () => {
    const p = fisheyeFollowPose({ kind: "fisheyeFollow" }, SUBJECT, 4 / 5, C);
    expect(p.fovDeg).toBeCloseTo(C.shots.fisheyeFollow.horizontalFovDeg);
  });

  it("deckShowcase: pushes in (radius, height, framed width) and frames the same width in any aspect", () => {
    const d = C.shots.deckShowcase;
    const spec = { kind: "deckShowcase", startAngleRad: -Math.PI / 2, rateRadps: 0 } as const;
    const start = deckShowcasePose(spec, SUBJECT, 0, 16 / 9, C);
    const end = deckShowcasePose(spec, SUBJECT, d.pushS + 1, 16 / 9, C);
    // −π/2 from the travel (+X) is its right side, +Z.
    expect(start.eye[2]).toBeCloseTo(2 + d.radiusStartM);
    expect(end.eye[2]).toBeCloseTo(2 + d.radiusEndM);
    expect(start.eye[1]).toBeCloseTo(0.1 + d.heightStartM);
    expect(end.eye[1]).toBeCloseTo(0.1 + d.heightEndM);
    expect(start.target).toEqual([10, 0.1 + d.lookHeightM, 2]);
    // The framed width at the board, from the horizontal FOV, in landscape and portrait.
    const width = (fovDeg: number, aspect: number, eye: readonly number[]) => {
      const h = 2 * Math.atan(Math.tan((fovDeg * Math.PI) / 360) * aspect);
      return 2 * Math.tan(h / 2) * dist(eye, [10, 0.1 + d.lookHeightM, 2]);
    };
    expect(width(start.fovDeg, 16 / 9, start.eye)).toBeCloseTo(d.frameStartM, 3);
    const portrait = deckShowcasePose(spec, SUBJECT, d.pushS + 1, 4 / 5, C);
    expect(width(portrait.fovDeg, 4 / 5, portrait.eye)).toBeCloseTo(d.frameEndM, 3);
    expect(portrait.fovDeg).toBeGreaterThan(end.fovDeg);
  });

  it("travelWith: starts at its pose, then keeps the offset to the board (eased in)", () => {
    const spec = {
      kind: "travelWith",
      positionM: [1, 0.1, -0.2],
      lookAtM: [-2, 0.3, 0.1],
      fovDeg: 68,
      easeInS: 0.3,
    } as const;
    const moved = { ...SUBJECT, position: [12, 0.1, 2] as const };
    expect(travelWithPose(spec, SUBJECT, SUBJECT, 0).eye).toEqual([1, 0.1, -0.2]);
    const later = travelWithPose(spec, moved, SUBJECT, 1);
    // After the ease the camera moves at the board's speed, trailing it by v × ease / 2.
    expect(later.eye[0]).toBeCloseTo(1 + 2 * (1 - 0.3 / 2));
    expect(later.target[0]).toBeCloseTo(-2 + 2 * (1 - 0.3 / 2));
    const early = travelWithPose(spec, moved, SUBJECT, 0.15);
    expect(early.eye[0]).toBeGreaterThan(1);
    expect(early.eye[0]).toBeLessThan(3);
  });

  it("verticalFovDeg converts horizontal FOV for an aspect; blendPoses lerps", () => {
    expect(verticalFovDeg(90, 1)).toBeCloseTo(90);
    expect(verticalFovDeg(95, 16 / 9)).toBeLessThan(95);
    const a = { eye: [0, 0, 0], target: [1, 1, 1], fovDeg: 40 } as const;
    const b = { eye: [2, 4, 6], target: [3, 3, 3], fovDeg: 60 } as const;
    expect(blendPoses(a, b, 0.5)).toEqual({ eye: [1, 2, 3], target: [2, 2, 2], fovDeg: 50 });
    expect(blendPoses(a, b, 0)).toEqual(a);
  });
});
