import type { MontageClip } from "../clip";
import { KeyTimeline } from "../timeline";

/*
 * The 5-stair (park spawn: the top platform, 6.8 m behind the nosing, facing the drop).
 * Three pushes reach ≈ 3.7 m/s; the pop at 2.75 s is ≈ 0.3 m before the nosing. The drop
 * makes the air ≈ 0.8 s; the flip is caught at the end of its turn (the catch is feet, not
 * magic: ADR 0011). Windows (`findCatchTimeS` + a scan of the Space time): kickflip ≈
 * 3.25–3.37 s, varial heelflip ≈ 3.25–3.28 s.
 */

const POP_S = 2.75;

function pushAndPop(k: KeyTimeline, popS = POP_S, loadS = 0.22): KeyTimeline {
  return k
    .push(0.3)
    .push(1.0)
    .push(1.7)
    .loadAndPop("tail", popS - loadS, popS);
}

/**
 * The kickflip is timed like a person would (ADR 0012, the human-jitter test plays it):
 * a full load (0.36 s), the pop at 2.62 s (≈ 0.75 m before the nosing: the pop lands
 * past the stairs from ≈ 2.5 to ≈ 2.75 s), 0.12 s taps, and Space 0.52 s after the pop,
 * in the middle of the normal-level catch window (buffered early presses, ≈ 3.0–3.2 s).
 */
const KICKFLIP_POP_S = 2.62;

/** Kickflip down the 5-stair: W + A just after the pop, Space as the flip settles. */
export const kickflipStairs: MontageClip = {
  id: "kickflip-stairs",
  title: "Kickflip · 5-stair",
  level: "park",
  stance: "regular",
  durationS: 4.8,
  keys: pushAndPop(new KeyTimeline("regular"), KICKFLIP_POP_S, 0.36)
    .level("tail", KICKFLIP_POP_S + 0.05)
    .flick("tail", "heel", KICKFLIP_POP_S + 0.05, 0.12)
    .catch(KICKFLIP_POP_S + 0.52)
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
  slowMotion: [{ fromS: 2.6, toS: 3.5, scale: 0.35 }],
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
    .catch(3.26)
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
 * The M4 stairs line (scenario G4, `grinds.scenario.test.ts`, the same key timeline), timed
 * like a person would (ADR 0012: the middle of each window, 0.12 s taps, a full load):
 * rolling at 3.5 m/s on the stairs' platform 0.37 m inside the hubba's steel edge; ↓ + S
 * from 0.35 s, the pop at 0.8 s (x ≈ −2.3; it locks for pops ≈ 0.68–0.92 s since the
 * hubba's flat top reaches 0.9 m back); W + A kickflip; ↓ again at 1.05 s, held (the
 * tailslide); Q at 1.05 s, a frontside quarter turn so the tail swings over the hubba;
 * Space at 1.3 s; the tailslide locks at ≈ 1.33 s; S from 1.25 s (already loading as it
 * lands in the slide), release ↓ at 1.5 s: the pop out; W + A + → hardflip, the body
 * turns back on its own; Space at 2.09 s (pro window ≈ 2.06–2.12 s, normal ≈ 1.98–2.14 s); it lands past the stairs.
 */
export const stairsTailslideHardflip: MontageClip = {
  id: "stairs-tailslide-hardflip",
  title: "Kickflip → FS Tailslide → Hardflip out · hubba",
  level: "park",
  stance: "regular",
  spawn: { xM: -5, yM: 0.8, zM: 1.38, headingRad: 0, speedMps: 3.5 },
  durationS: 4,
  keys: new KeyTimeline("regular")
    .loadAndPop("tail", 0.35, 0.8)
    .level("tail", 0.85, 0.1)
    .flick("tail", "heel", 0.85, 0.12)
    .foot("back", "down", 1.05, 0.45)
    .spin("left", 1.05, 0.14)
    .catch(1.3)
    .foot("front", "down", 1.25, 0.29)
    .level("tail", 1.54, 0.1)
    .flick("tail", "heel", 1.54, 0.12)
    .sweep("tail", "toe", 1.54, 0.12)
    .catch(2.09)
    .build(),
  shots: [
    { fromS: 0, shot: { kind: "fisheyeFollow" } },
    {
      fromS: 0.75,
      blendS: 0.35,
      shot: { kind: "lowSide", side: "left", distanceM: 2.6, leadM: 0.6 },
    },
    {
      fromS: 1.62,
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
    { fromS: 1.25, toS: 1.56, scale: 0.35 },
    { fromS: 1.64, toS: 2.45, scale: 0.3 },
  ],
  expect: { tricks: ["Kickflip → FS Tailslide → Hardflip out"] },
};
