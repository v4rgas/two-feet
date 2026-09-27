import { STREET_CONFIG } from "../../../maps/street/street.config";
import type { MontageClip } from "../clip";
import { KeyTimeline } from "../timeline";

const street = STREET_CONFIG;
const stairs = street.bigStairs;
/** The 7-stair's landing height and the x of its foot (the last nosing), m. */
const LANDING_M = stairs.stepCount * stairs.riseM;
const FOOT_X = stairs.xM + (stairs.stepCount - 1) * stairs.runM;

/*
 * The Street Course's 7-stair (1.05 m) from the map's spawn: its landing, 6.5 m behind the
 * top nosing, facing the drop. Three pushes reach ≈ 3.7 m/s. The drop makes the air
 * ≈ 0.85 s; the flip is caught at the end of its turn (the catch is feet, not magic: ADR
 * 0011). Windows (a scan of the pop and Space times, `findCatchTimeS`): kickflip pop ≈
 * 2.4–2.84 s, Space ≈ 2.82–3.22 s; varial heelflip pop ≈ 2.47–2.75 s, Space 0.4 s after
 * the pop ± 0.15 s.
 */

const POP_S = 2.63;

function pushAndPop(k: KeyTimeline, popS = POP_S, loadS = 0.22): KeyTimeline {
  return k
    .push(0.3)
    .push(1.0)
    .push(1.7)
    .loadAndPop("tail", popS - loadS, popS);
}

/**
 * The kickflip is timed like a person would (ADR 0012, the human-jitter test plays it):
 * a full load (0.36 s), the pop at 2.62 s (≈ 0.45 m before the nosing: the middle of the
 * pops that land past the stairs), 0.12 s taps, and Space 0.46 s after the pop, in the
 * middle of the catch window (buffered early presses).
 */
const KICKFLIP_POP_S = 2.62;

/** Kickflip down the 7-stair: W + A just after the pop, Space as the flip settles. */
export const kickflipStairs: MontageClip = {
  id: "kickflip-stairs",
  title: "Kickflip · 7-stair",
  level: "street",
  stance: "regular",
  durationS: 4.8,
  keys: pushAndPop(new KeyTimeline("regular"), KICKFLIP_POP_S, 0.36)
    .level("tail", KICKFLIP_POP_S + 0.05)
    .flick("tail", "heel", KICKFLIP_POP_S + 0.05, 0.12)
    .catch(KICKFLIP_POP_S + 0.46)
    .build(),
  shots: [
    { fromS: 0, shot: { kind: "fisheyeFollow" } },
    {
      fromS: 2.45,
      shot: {
        kind: "fixedTripod",
        positionM: [FOOT_X + 2.1, 0.55, street.spawn.zM + 2.4],
        fovStartDeg: 46,
        fovEndDeg: 32,
        zoomS: 5,
      },
    },
  ],
  slowMotion: [{ fromS: 2.6, toS: 3.5, scale: 0.35 }],
  expect: { tricks: ["Kickflip"] },
};

/** Varial heelflip down the 7-stair: W + D flick and a frontside sweep (→) together. */
export const varialHeelflipStairs: MontageClip = {
  id: "varial-heelflip-stairs",
  title: "Varial Heelflip · 7-stair",
  level: "street",
  stance: "regular",
  durationS: 5,
  keys: pushAndPop(new KeyTimeline("regular"))
    .level("tail", POP_S + 0.05)
    .flick("tail", "toe", POP_S + 0.05, 0.08)
    .sweep("tail", "toe", POP_S + 0.05, 0.08)
    .catch(POP_S + 0.4)
    .build(),
  shots: [
    { fromS: 0, shot: { kind: "follow" } },
    { fromS: 2.2, blendS: 0.5, shot: { kind: "lowSide", side: "right", distanceM: 2.8 } },
    { fromS: 3.65, blendS: 0.6, shot: { kind: "slowOrbit", startAngleRad: Math.PI / 2 } },
  ],
  slowMotion: [{ fromS: 2.6, toS: 3.5, scale: 0.3 }],
  expect: { tricks: ["Varial Heelflip"] },
};

/**
 * The M4 stairs line (scenario G4, `grinds.scenario.test.ts`, the same key timeline) on the
 * 7-stair's +Z hubba (0.28 m), timed like a person would (ADR 0012: the middle of each
 * window, 0.12 s taps, a full load): rolling at 3.5 m/s on the landing, 5 m behind the top
 * nosing and 0.37 m inside the hubba's steel edge; ↓ + S from 0.3 s, the pop at 0.75 s
 * (x ≈ −8.9; pops ≈ 0.16 s either side land the line); W + A kickflip; ↓ again at 1.0 s,
 * held (the tailslide); Q at 1.0 s, a frontside quarter turn so the tail swings over the
 * hubba; Space at 1.25 s; the tailslide locks at ≈ 1.37 s on the hubba's flat top and
 * slides onto its slope; S from 1.53 s, release ↓ at 1.78 s: the pop out (x ≈ −5.7, a
 * third of the way down); W + A + → hardflip, the body turns back on its own; Space at
 * 2.31 s (≈ 2.13–2.37 s land); it lands past the stairs.
 */
export const stairsTailslideHardflip: MontageClip = {
  id: "stairs-tailslide-hardflip",
  title: "Kickflip → FS Tailslide → Hardflip out · 7-stair hubba",
  level: "street",
  stance: "regular",
  spawn: {
    xM: stairs.xM - 5,
    yM: LANDING_M,
    zM: stairs.zM + stairs.widthM / 2 - 0.37,
    headingRad: 0,
    speedMps: 3.5,
  },
  durationS: 4.2,
  keys: new KeyTimeline("regular")
    .loadAndPop("tail", 0.3, 0.75)
    .level("tail", 0.8, 0.1)
    .flick("tail", "heel", 0.8, 0.12)
    .foot("back", "down", 1.0, 0.78)
    .spin("left", 1.0, 0.14)
    .catch(1.25)
    .foot("front", "down", 1.53, 0.29)
    .level("tail", 1.82, 0.1)
    .flick("tail", "heel", 1.82, 0.12)
    .sweep("tail", "toe", 1.82, 0.12)
    .catch(2.31)
    .build(),
  shots: [
    { fromS: 0, shot: { kind: "fisheyeFollow" } },
    {
      fromS: 0.75,
      blendS: 0.35,
      shot: { kind: "lowSide", side: "left", distanceM: 2.6, leadM: 0.6 },
    },
    {
      fromS: 1.9,
      shot: {
        kind: "fixedTripod",
        positionM: [FOOT_X + 3.3, 0.55, stairs.zM + stairs.widthM / 2 - 2.35],
        fovStartDeg: 48,
        fovEndDeg: 34,
        zoomS: 3,
      },
    },
  ],
  slowMotion: [
    { fromS: 1.3, toS: 1.84, scale: 0.35 },
    { fromS: 1.92, toS: 2.7, scale: 0.3 },
  ],
  expect: { tricks: ["Kickflip → FS Tailslide → Hardflip out"] },
};
