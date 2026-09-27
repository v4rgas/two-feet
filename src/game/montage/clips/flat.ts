import type { MontageClip } from "../clip";
import { KeyTimeline } from "../timeline";

/* Flat-ground clips: the flat level, rolling in at 4 m/s along +X. */

const ROLLING_IN = { xM: 0, yM: 0, zM: 0, headingRad: 0, speedMps: 4 } as const;

/**
 * Nollie heelflip on flat: load W + ↑, pop by releasing W at 1.02 s, ↓ + → (the back foot
 * levels and flicks off the toe edge), Space once the flip has turned (lands with Space anywhere in ≈ 1.32–1.56 s).
 */
export const nollieHeelflipFlat: MontageClip = {
  id: "nollie-heelflip-flat",
  title: "Nollie Heelflip",
  level: "flat",
  stance: "regular",
  spawn: ROLLING_IN,
  durationS: 2.7,
  keys: new KeyTimeline("regular")
    .loadAndPop("nose", 0.8, 1.02)
    .level("nose", 1.07)
    .flick("nose", "toe", 1.07, 0.08)
    .catch(1.44)
    .build(),
  shots: [
    { fromS: 0, shot: { kind: "fisheyeFollow" } },
    { fromS: 0.85, blendS: 0.45, shot: { kind: "lowSide", side: "right", distanceM: 2.2 } },
  ],
  slowMotion: [{ fromS: 1.0, toS: 1.66, scale: 0.35 }],
  expect: { tricks: ["Nollie Heelflip"] },
};

/**
 * BS 180 kickflip (regular: E is clockwise = backside): E held from before the load
 * (the wind-up) until 1.2 s, so the easing-out body spin stops near π; W + A after the pop;
 * Space once both the flip and the 180 are done (lands with Space in ≈ 1.37–1.61 s). Lands
 * fakie.
 */
export const bs180KickflipFlat: MontageClip = {
  id: "bs-180-kickflip-flat",
  title: "BS 180 Kickflip",
  level: "flat",
  stance: "regular",
  spawn: ROLLING_IN,
  durationS: 2.9,
  keys: new KeyTimeline("regular")
    .spin("right", 0.7, 0.5)
    .loadAndPop("tail", 0.75, 1.0)
    .level("tail", 1.05)
    .flick("tail", "heel", 1.05, 0.08)
    .catch(1.49)
    .build(),
  shots: [
    { fromS: 0, shot: { kind: "lowSide", side: "left", distanceM: 2.6, leadM: 1.2 } },
    {
      fromS: 0.9,
      blendS: 0.5,
      shot: { kind: "slowOrbit", startAngleRad: Math.PI / 2, rateRadps: 0.5 },
    },
  ],
  slowMotion: [{ fromS: 0.97, toS: 1.7, scale: 0.3 }],
  expect: { tricks: ["BS 180 Kickflip"], rollsFakieAtS: 2.5 },
};
