import type { MontageClip } from "../clip";
import { KeyTimeline } from "../timeline";

/*
 * The 5-stair (park spawn: the top platform, 6.8 m behind the nosing, facing the drop).
 * Three pushes reach ≈ 3.7 m/s; the pop at 2.75 s is ≈ 0.3 m before the nosing. The drop
 * makes the air ≈ 0.8 s; the flip is caught once it has turned (catch window ≈ 3.16–3.23 s,
 * found with `findCatchTimeS`; later, the flip goes on into a double).
 */

const POP_S = 2.75;

function pushAndPop(k: KeyTimeline): KeyTimeline {
  return k
    .push(0.3)
    .push(1.0)
    .push(1.7)
    .loadAndPop("tail", POP_S - 0.22, POP_S);
}

/** Kickflip down the 5-stair: W + A just after the pop, Space once the flip has turned. */
export const kickflipStairs: MontageClip = {
  id: "kickflip-stairs",
  title: "Kickflip · 5-stair",
  level: "park",
  stance: "regular",
  durationS: 4.8,
  keys: pushAndPop(new KeyTimeline("regular"))
    .level("tail", POP_S + 0.05)
    .flick("tail", "heel", POP_S + 0.05, 0.08)
    .catch(3.19)
    .build(),
  shots: [
    { fromS: 0, shot: { kind: "fisheyeFollow" } },
    {
      fromS: 2.45,
      shot: {
        kind: "fixedTripod",
        positionM: [3.4, 0.55, 2.4],
        fovStartDeg: 46,
        fovEndDeg: 32,
        zoomS: 5,
      },
    },
  ],
  slowMotion: [{ fromS: 2.72, toS: 3.62, scale: 0.35 }],
  expect: { tricks: ["Kickflip"] },
};

/** Varial heelflip down the 5-stair: W + D flick and a frontside sweep (→) together. */
export const varialHeelflipStairs: MontageClip = {
  id: "varial-heelflip-stairs",
  title: "Varial Heelflip · 5-stair",
  level: "park",
  stance: "regular",
  durationS: 5,
  keys: pushAndPop(new KeyTimeline("regular"))
    .level("tail", POP_S + 0.05)
    .flick("tail", "toe", POP_S + 0.05, 0.08)
    .sweep("tail", "toe", POP_S + 0.05, 0.08)
    .catch(3.19)
    .build(),
  shots: [
    { fromS: 0, shot: { kind: "follow" } },
    { fromS: 2.3, blendS: 0.5, shot: { kind: "lowSide", side: "right", distanceM: 2.8 } },
    { fromS: 3.75, blendS: 0.6, shot: { kind: "slowOrbit", startAngleRad: Math.PI / 2 } },
  ],
  slowMotion: [{ fromS: 2.72, toS: 3.62, scale: 0.3 }],
  expect: { tricks: ["Varial Heelflip"] },
};

/**
 * The M4 stairs line (scenario G4, `grinds.scenario.test.ts`, the same key timeline):
 * rolling at 3.5 m/s on the stairs' platform 0.33 m inside the hubba's steel edge, pop at
 * 0.88 s (x ≈ −1.97), W + A kickflip, ↓ held (tailslide), a Q quarter turn so the tail
 * swings over the hubba, Space; the tailslide locks at ≈ 1.41 s on the hubba's flat top and
 * runs down the slope; S + release ↓ pops out at 1.70 s, A + → hardflip, the body turns
 * back on its own; Space (window ≈ 2.27–2.34 s); lands ≈ 2.45 s past the stairs.
 */
export const stairsTailslideHardflip: MontageClip = {
  id: "stairs-tailslide-hardflip",
  title: "Kickflip → FS Tailslide → Hardflip out · hubba",
  level: "park",
  stance: "regular",
  spawn: { xM: -5, yM: 0.8, zM: 1.42, headingRad: 0, speedMps: 3.5 },
  durationS: 4,
  keys: new KeyTimeline("regular")
    .loadAndPop("tail", 0.56, 0.88)
    .level("tail", 0.93, 0.1)
    .flick("tail", "heel", 0.93, 0.08)
    .foot("back", "down", 0.98, 0.72)
    .spin("left", 1.13, 0.14)
    .catch(1.28)
    .foot("front", "down", 1.55, 0.19)
    .flick("tail", "heel", 1.76, 0.08)
    .sweep("tail", "toe", 1.76, 0.08)
    .catch(2.3)
    .build(),
  shots: [
    { fromS: 0, shot: { kind: "fisheyeFollow" } },
    {
      fromS: 0.8,
      blendS: 0.35,
      shot: { kind: "lowSide", side: "left", distanceM: 2.6, leadM: 0.6 },
    },
    {
      fromS: 1.66,
      shot: {
        kind: "fixedTripod",
        positionM: [4.6, 0.55, -0.6],
        fovStartDeg: 48,
        fovEndDeg: 34,
        zoomS: 3,
      },
    },
  ],
  slowMotion: [
    { fromS: 1.3, toS: 1.6, scale: 0.35 },
    { fromS: 1.68, toS: 2.5, scale: 0.3 },
  ],
  expect: { tricks: ["Kickflip → FS Tailslide → Hardflip out"] },
};
