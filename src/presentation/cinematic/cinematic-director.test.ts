import { describe, expect, it } from "vitest";
import { Quat, Transform, Vec3 } from "../../shared";
import { PRESENTATION_CONFIG } from "../presentation.config";
import type { RenderFrame } from "../render-frame";
import { CINEMATIC_CONFIG } from "./cinematic.config";
import type { ShotSegment } from "./cinematic-director";
import { activeSegmentIndex, CinematicDirector } from "./cinematic-director";

/** A board rolling along +X at 4 m/s, at x = `x` (only what the director reads). */
function frameAt(x: number): RenderFrame {
  const board = {
    transform: Transform.create(Vec3.create(x, 0.1, 0), Quat.IDENTITY),
    linearVelocityMps: Vec3.create(4, 0, 0),
    grounded: true,
    airtimeS: 0,
  };
  const rider = { headingRad: 0 };
  return {
    alpha: 0,
    previousBoard: board,
    currentBoard: board,
    previousRider: rider,
    rider,
    stance: "regular",
    recentEvents: [],
  } as unknown as RenderFrame;
}

const SHOTS: readonly ShotSegment[] = [
  { fromS: 0, shot: { kind: "follow" } },
  { fromS: 1, shot: { kind: "fixedTripod", positionM: [5, 2, 5] } },
  { fromS: 2, blendS: 0.5, shot: { kind: "lowSide", side: "right" } },
];

describe("CinematicDirector", () => {
  it("picks the last segment that has started", () => {
    expect(activeSegmentIndex(SHOTS, 0)).toBe(0);
    expect(activeSegmentIndex(SHOTS, 0.99)).toBe(0);
    expect(activeSegmentIndex(SHOTS, 1)).toBe(1);
    expect(activeSegmentIndex(SHOTS, 5)).toBe(2);
  });

  it("follows with the game's rig, cuts to the tripod, blends into the low side shot", () => {
    const d = new CinematicDirector(PRESENTATION_CONFIG.camera, CINEMATIC_CONFIG);
    d.start(SHOTS);
    const dt = 1 / 60;
    const follow = d.update(frameAt(0), 0, 0, 16 / 9);
    // Follow: behind the board (−X), close (STYLE.md: ≈ 1.1 m behind).
    expect(follow.eye[0]).toBeLessThan(0);
    expect(follow.eye[0]).toBeGreaterThan(-2);

    // A cut: the tripod pose is exact on the first frame of the shot.
    const tripod = d.update(frameAt(4), 1, dt, 16 / 9);
    expect(tripod.eye).toEqual([5, 2, 5]);

    // A blend: halfway between the tripod and the low side shot, then all low side.
    const start = d.update(frameAt(8), 2, dt, 16 / 9);
    expect(start.eye[0]).toBeCloseTo(5, 0);
    let pose = start;
    for (let i = 0; i < 40; i += 1) pose = d.update(frameAt(8), 2 + i * dt, dt, 16 / 9);
    expect(d.activeShot?.kind).toBe("lowSide");
    expect(pose.eye[2]).toBeCloseTo(CINEMATIC_CONFIG.shots.lowSide.distanceM, 1);
    expect(pose.eye[1]).toBeCloseTo(0.1 + CINEMATIC_CONFIG.shots.lowSide.heightM, 1);
  });

  it("rejects a clip without shots", () => {
    const d = new CinematicDirector(PRESENTATION_CONFIG.camera, CINEMATIC_CONFIG);
    expect(() => d.start([])).toThrow();
  });
});
