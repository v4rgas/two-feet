import { STREET_CONFIG } from "../../../maps/street/street.config";
import type { MontageClip } from "../clip";
import { KeyTimeline } from "../timeline";

/* Street launch and transition clips: the euro gap and the east quarter pipe (see STREET_CONFIG). */

const gap = STREET_CONFIG.gapPlatform;
const qp = STREET_CONFIG.quarterPipe;

/**
 * 360 flip off the euro gap (the kicker's launch on the street: the park had a kicker): rolling at
 * 4.5 m/s on the gap platform (0.6 m), 5 m behind its drop edge, a full load and the pop
 * at 0.9 s before the edge (pops from ≈ 0.56 to ≈ 1.24 s land); W + A flick (0.12 s), and
 * the 360 backside sweep as an edge-to-edge swipe (→ held with the load from 0.74 s, ← at
 * 0.95 s: MECHANICS "Swipe size"); Space at 1.34 s as flip and 360 settle together (the
 * middle of ≈ 1.2–1.48 s). Timed like a person would for the human-jitter
 * test (ADR 0012).
 */
export const treFlipEuroGap: MontageClip = {
  id: "tre-flip-euro-gap",
  title: "360 Flip · euro gap",
  level: "street",
  stance: "regular",
  spawn: { xM: gap.xM - 5, yM: gap.heightM, zM: gap.zM, headingRad: 0, speedMps: 4.5 },
  durationS: 3.2,
  keys: new KeyTimeline("regular")
    .loadAndPop("tail", 0.54, 0.9)
    .level("tail", 0.95)
    .flick("tail", "heel", 0.95, 0.12)
    .sweep360("tail", "heel", 0.74, 0.95)
    .catch(1.34)
    .build(),
  shots: [
    { fromS: 0, shot: { kind: "lowSide", side: "left", distanceM: 2.4, leadM: 0.8 } },
    {
      fromS: 0.74,
      shot: {
        kind: "fixedTripod",
        positionM: [gap.xM + 3.4, 0.35, gap.zM + 2.6],
        fovStartDeg: 50,
        fovEndDeg: 36,
        zoomS: 4,
      },
    },
  ],
  slowMotion: [{ fromS: 0.86, toS: 1.64, scale: 0.3 }],
  expect: { tricks: ["360 Flip"] },
};

/**
 * Quarter pipe: rolling in at 4.6 m/s toward the east quarter pipe (1.2 m: at 5 m/s the
 * board would reach its coping), up it, back down fakie, and a fakie ollie low on the
 * transition on the way down (pop 2.25 s, in the 2.05–2.55 s that land).
 */
export const quarterPipeFakie: MontageClip = {
  id: "quarter-pipe-fakie",
  title: "Quarter pipe · Fakie Ollie",
  level: "street",
  stance: "regular",
  spawn: { xM: qp.toeXM - 3.7, yM: 0, zM: 0, headingRad: 0, speedMps: 4.6 },
  durationS: 3.6,
  keys: new KeyTimeline("regular")
    .loadAndPop("tail", 2.03, 2.25)
    .level("tail", 2.3)
    .catch(2.7)
    .build(),
  shots: [
    {
      fromS: 0,
      shot: {
        kind: "fixedTripod",
        positionM: [qp.toeXM - 2, 0.9, 4],
        fovStartDeg: 55,
        fovEndDeg: 38,
        zoomS: 3,
      },
    },
    { fromS: 2.1, blendS: 0.35, shot: { kind: "fisheyeFollow" } },
  ],
  slowMotion: [{ fromS: 2.22, toS: 2.8, scale: 0.4 }],
  expect: { tricks: ["Fakie Ollie"], rollsFakieAtS: 1.75 },
};
