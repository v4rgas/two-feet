import { EL_TORO } from "../../../maps/el-toro/el-toro.config";
import { STREET_CONFIG } from "../../../maps/street/street.config";
import type { MontageClip } from "../clip";
import { quarterPipeFakie } from "../clips/ramps";
import { KeyTimeline } from "../timeline";

/*
 * THE LINES of the LinkedIn promo (SCRIPT.md "The lines"): chains of moves in one shot that
 * show what the physics does (balance in a manual, a grind following a rail's shape, a
 * transition and momentum, flips in and out of a grind). Real input, each verified by
 * `pnpm montage:verify`; the catches were found with `findCatchTimeS` and the pops scanned
 * for their windows (noted per clip).
 */

const S = STREET_CONFIG;
const [LOW_PAD] = S.manualPads;
if (LOW_PAD === undefined) throw new Error("The street needs its manual pads");
const LOW_PAD_START_X = LOW_PAD.xM - LOW_PAD.lengthM / 2;

/** Kickflip-out pop of the manual line, clip s. */
const MANUAL_FLIP_S = 4.25;

/**
 * 1 · Manual → nose manual → kickflip out, on the north lane's two manual pads. Rolling
 * at 3.5 m/s from 3.5 m before the low pad: an ollie up onto it (pop 0.62 s, W, Space); ↓
 * alone from 1.25 to 2.30 s is the manual (the tail pressed, nose up ≈ 0.08 rad) across the
 * pad; it rolls off, an ollie up onto the high pad (pop 2.67 s, the 2.25 m gap); W alone
 * from 3.25 s is the nose manual across it; ↓ + S, ↓ let go at 4.25 s, W + A: a kickflip off
 * the pad's end, Space at 4.76 s (`findCatchTimeS`; the pop lands for 4.15–4.35 s), the
 * landing ≈ 4.98 s. The recognizer names only the pops ("Ollie", "Ollie", "Kickflip");
 * manuals carry no name, so the promo names the line itself.
 */
export const promoLineManual: MontageClip = {
  id: "promo-line-manual",
  title: "Manual → Nose Manual → Kickflip · manual pads",
  level: "street",
  stance: "regular",
  spawn: { xM: LOW_PAD_START_X - 3.5, yM: 0, zM: LOW_PAD.zM, headingRad: 0, speedMps: 3.5 },
  durationS: 7.05,
  keys: new KeyTimeline("regular")
    .loadAndPop("tail", 0.32, 0.62)
    .level("tail", 0.67, 0.12)
    .catch(0.92)
    .foot("back", "down", 1.25, 1.05)
    .loadAndPop("tail", 2.37, 2.67)
    .level("tail", 2.72, 0.12)
    .catch(2.97)
    .foot("front", "up", 3.25, MANUAL_FLIP_S - 0.33 - 3.25)
    .loadAndPop("tail", MANUAL_FLIP_S - 0.3, MANUAL_FLIP_S)
    .level("tail", MANUAL_FLIP_S + 0.05)
    .flick("tail", "heel", MANUAL_FLIP_S + 0.05, 0.12)
    .catch(4.76)
    .build(),
  shots: [
    {
      fromS: 0,
      shot: {
        kind: "lowSide",
        side: "left",
        distanceM: 3.4,
        heightM: 0.45,
        leadM: 0.6,
        fovDeg: 40,
      },
    },
  ],
  slowMotion: [{ fromS: MANUAL_FLIP_S - 0.05, toS: 5.0, scale: 0.5 }],
  expect: { tricks: ["Ollie", "Ollie", "Kickflip"] },
};

/**
 * 2 · BS 50-50 down the kinked rail (the 3-stair's handrail: flat, down, flat): from the
 * ground behind the 3-stair's landing at 5 m/s, up its back slope; ↓ + S from 1.13 s, the pop
 * at 1.45 s (pops 1.4–1.5 s lock), W; the lock ≈ 1.89 s on the top flat, the board follows
 * the rail through both kinks, rolls off the end (≈ 3.57 s) and lands (≈ 3.85 s).
 */
export const promoLineKinkedRail: MontageClip = {
  id: "promo-line-kinked-rail",
  title: "BS 50-50 · kinked rail",
  level: "street",
  stance: "regular",
  spawn: { xM: -18.5, yM: 0, zM: S.smallStairs.zM + 0.15, headingRad: 0.03, speedMps: 5 },
  durationS: 5.36,
  keys: new KeyTimeline("regular").loadAndPop("tail", 1.13, 1.45).level("tail", 1.5, 0.15).build(),
  shots: [
    {
      fromS: 0,
      shot: { kind: "lowSide", side: "left", distanceM: 3.2, heightM: 0.5, leadM: 0.4, fovDeg: 42 },
    },
  ],
  slowMotion: [{ fromS: 2.5, toS: 3.3, scale: 0.6 }],
  expect: { tricks: ["BS 50-50"] },
};

/**
 * 3 · Up the funbox's bank → FS 50-50 on its down rail (flat on the top, then down the far
 * bank) → roll off. From 8 m before the funbox at 5 m/s, 0.15 m beside the rail's line,
 * angled 0.03 rad onto it; ↓ + S from 1.88 s, the pop at 2.2 s on the top (pops 2.1–2.3 s
 * lock), W; the lock ≈ 2.68 s, over the kink, off the end (≈ 3.41 s), the landing ≈ 3.52 s.
 */
export const promoLineFunbox: MontageClip = {
  id: "promo-line-funbox",
  title: "FS 50-50 · funbox down rail",
  level: "street",
  stance: "regular",
  spawn: {
    xM: S.funbox.xM - 8,
    yM: 0,
    zM: S.funbox.zM + S.funbox.bankRail.zM + 0.15,
    headingRad: 0.03,
    speedMps: 5,
  },
  durationS: 5.29,
  keys: new KeyTimeline("regular").loadAndPop("tail", 1.88, 2.2).level("tail", 2.25, 0.15).build(),
  shots: [
    {
      fromS: 0,
      shot: {
        kind: "lowSide",
        side: "right",
        distanceM: 3.2,
        heightM: 0.6,
        leadM: 0.5,
        fovDeg: 42,
      },
    },
  ],
  slowMotion: [{ fromS: 2.6, toS: 3.5, scale: 0.6 }],
  expect: { tricks: ["FS 50-50"] },
};

/**
 * 4 · Quarter pipe → fakie → Fakie 360. Rolling at 4.6 m/s at the east quarter pipe: up the
 * transition, back down fakie (the momentum turns round); on the flat, E held from 2.5 s
 * for 0.94 s (the wind-up and the spin), ↓ + S from 2.64 s, the pop at 3.0 s, W; the body
 * turns a full 360 and Space goes in at 3.27 s (`findCatchTimeS`); it lands still fakie
 * (≈ 3.71 s). Only this spin lands among the ones scanned (0.8–0.94 s holds): a shorter
 * one under-rotates.
 */
export const promoLineQuarterPipe: MontageClip = {
  ...quarterPipeFakie,
  id: "promo-line-quarter-pipe",
  title: "Fakie 360 · quarter pipe",
  durationS: 6.07,
  keys: new KeyTimeline("regular")
    .spin("right", 2.5, 0.94)
    .loadAndPop("tail", 2.64, 3.0)
    .level("tail", 3.05)
    .catch(3.27)
    .build(),
  shots: [
    {
      fromS: 0,
      shot: {
        kind: "fixedTripod",
        positionM: [S.quarterPipe.toeXM - 2.5, 0.9, 4.5],
        fovStartDeg: 52,
        fovEndDeg: 40,
        zoomS: 4,
      },
    },
  ],
  slowMotion: [{ fromS: 2.95, toS: 3.75, scale: 0.5 }],
  expect: { tricks: ["Fakie 360"] },
};

/**
 * 5 · Heelflip → BS 50-50 → BS Pop Shove-it out, on the flat bar. Rolling at 4 m/s from
 * 8.5 m before the bar's middle, 0.15 m beside it, angled 0.03 rad onto it; a full load, the
 * pop at 1.05 s, W + D (the heelflip in), Space at 1.56 s (`findCatchTimeS`), the lock ≈ 1.58
 * s; ↓ + S from 2.45 s, ↓ let go at 2.7 s (the pop out), ← (the back foot sweeps: a
 * backside shove-it), Space at 3.21 s; the landing ≈ 3.37 s (pop-outs at 2.6–2.8 s land).
 */
export const promoLineFlipInOut: MontageClip = {
  id: "promo-line-flip-in-out",
  title: "Heelflip → BS 50-50 → BS Pop Shove-it out · flat bar",
  level: "street",
  stance: "regular",
  spawn: { xM: S.flatBar.xM - 8.5, yM: 0, zM: S.flatBar.zM + 0.15, headingRad: 0.03, speedMps: 4 },
  durationS: 5.19,
  keys: new KeyTimeline("regular")
    .loadAndPop("tail", 0.69, 1.05)
    .level("tail", 1.1)
    .flick("tail", "toe", 1.1, 0.12)
    .catch(1.56)
    .loadAndPop("tail", 2.45, 2.7)
    .sweep("tail", "heel", 2.75, 0.1)
    .catch(3.21)
    .build(),
  shots: [
    { fromS: 0, shot: { kind: "fisheyeFollow" } },
    {
      fromS: 0.93,
      shot: { kind: "lowSide", side: "left", distanceM: 2.4, leadM: 0.7, fovDeg: 44 },
    },
  ],
  slowMotion: [{ fromS: 1.0, toS: 1.7, scale: 0.5 }],
  expect: { tricks: ["Heelflip → BS 50-50 → BS Pop Shove-it out"] },
};

const QUAD_Y = EL_TORO.stairs.stepCount * EL_TORO.stairs.riseM + EL_TORO.plaza.aboveStairsM;

/**
 * The gag: "try 1" at El Toro. The finale's approach (4.5 m/s, 9 m back, two pushes), a
 * double kickflip (the front foot waits on the toe edge from 1.25 s, swipes to the heel edge
 * at 1.6 s) popped at 1.55 s, and no catch: the board keeps turning, lands upside down at
 * the bottom (≈ 2.99 s) and the rider bails (the ragdoll: every controller lets go, the
 * board slides away on its grip). Deterministic like every clip (the same replay).
 */
export const promoBailElToro: MontageClip = {
  id: "promo-bail-el-toro",
  title: "bail · El Toro",
  level: "el-toro",
  stance: "regular",
  spawn: { xM: -9, yM: QUAD_Y, zM: 0, headingRad: 0, speedMps: 4.5 },
  durationS: 3.84,
  keys: new KeyTimeline("regular")
    .push(0.25)
    .push(0.9)
    .loadAndPop("tail", 1.19, 1.55)
    .level("tail", 1.6, 0.12)
    .doubleFlick("tail", "heel", 1.25, 1.6)
    .build(),
  shots: [
    { fromS: 0, shot: { kind: "fisheyeFollow" } },
    {
      fromS: 1.4,
      shot: {
        kind: "fixedTripod",
        positionM: [11, 1.2, 5.5],
        fovStartDeg: 40,
        fovEndDeg: 34,
        zoomS: 3,
      },
    },
  ],
  slowMotion: [{ fromS: 1.57, toS: 3.05, scale: 0.6 }],
  expect: { tricks: [], bails: true },
};
