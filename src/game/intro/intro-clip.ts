import { STREET_CONFIG } from "../../maps/street/street.config";
import type { MontageClip } from "../montage/clip";
import { KeyTimeline } from "../montage/timeline";

/*
 * THE OPENING CINEMATIC's line (GAME.md "Intro"): a hardflip down the Street Course's euro
 * gap, a 0.6 m drop (two feet ≈ 0.61 m). It is a real-input clip, like every montage clip:
 * the key timeline below is replayed through input → rider → Rapier → tricks, and
 * `pnpm montage:verify` checks it lands "Hardflip".
 */

const gap = STREET_CONFIG.gapPlatform;

/** The pop, clip s (≈ 0.65 m before the lip). Pops ≈ 0.78–1.08 s all land. */
const POP_S = 1.0;

/**
 * Hardflip off the euro gap (regular): rolling at 4.5 m/s on the gap platform, 5 m behind
 * the lip and 0.4 m in from its north side, drifting 4° north so the roll-away clears the
 * up-ledge. A full load (↓ + S from 0.64 s), the pop at 1.0 s, then W + A (the kickflip
 * flick off the heel edge) together with → (the frontside shove, MECHANICS.md: a
 * kickflip + FS shove = hardflip). Space at 1.5 s: Space from ≈ 1.30 to 1.57 s lands
 * (`findCatchTimeS`: the rotation looks done at ≈ 1.56 s). Lands at ≈ 1.87 s, rolls away
 * at ≈ 3.5 m/s.
 */
export const INTRO_CLIP: MontageClip = {
  id: "two-feet-hardflip",
  title: "Hardflip · two-foot drop",
  level: "street",
  stance: "regular",
  spawn: {
    xM: gap.xM - 5,
    yM: gap.heightM,
    zM: gap.zM + gap.widthM / 2 - 0.4,
    headingRad: -0.07,
    speedMps: 4.5,
  },
  durationS: 4.6,
  keys: new KeyTimeline("regular")
    .loadAndPop("tail", POP_S - 0.36, POP_S)
    .level("tail", POP_S + 0.05)
    .flick("tail", "heel", POP_S + 0.05, 0.12)
    .sweep("tail", "toe", POP_S + 0.05, 0.12)
    .catch(1.5)
    .build(),
  shots: [
    // The approach: the filmer skating right behind, low and wide.
    { fromS: 0, shot: { kind: "fisheyeFollow" } },
    // At the lip: a cut to a low angle on the open (north) side, tracking the flip down.
    {
      fromS: 0.82,
      shot: { kind: "lowSide", side: "right", distanceM: 2.2, heightM: 0.2, leadM: 0.7 },
    },
    // The roll-away: a still tripod by the landing, the board rolling off down the lane.
    {
      fromS: 2.3,
      blendS: 0.8,
      shot: {
        kind: "fixedTripod",
        positionM: [gap.xM + 3.4, 0.3, gap.zM + 4.2],
        fovStartDeg: 44,
        fovEndDeg: 34,
        zoomS: 3,
      },
    },
  ],
  slowMotion: [{ fromS: 0.95, toS: 2.05, scale: 0.35 }],
  expect: { tricks: ["Hardflip"] },
};
