import { WORLD_CONFIG } from "../../../contexts/world";
import type { MontageClip } from "../clip";
import { KeyTimeline } from "../timeline";

/* Park ramp clips: the kicker and the mini halfpipe (see WORLD_CONFIG.park). */

const park = WORLD_CONFIG.park;
const hp = park.halfpipe;

/**
 * 360 flip off the kicker: rolling in at 4.5 m/s from 6 m before it, the pop at 1.74 s is
 * at the lip (earlier, the pop lands back on the kicker's slope); W + A flick and a held ←
 * (a 360 backside sweep, ≥ 0.12 s); Space once the flip and the 360 are done (window
 * ≈ 2.26–2.30 s).
 */
export const treFlipKicker: MontageClip = {
  id: "tre-flip-kicker",
  title: "360 Flip · kicker",
  level: "park",
  stance: "regular",
  spawn: { xM: park.kicker.xM - 6, yM: 0, zM: park.kicker.zM, headingRad: 0, speedMps: 4.5 },
  durationS: 3.6,
  keys: new KeyTimeline("regular")
    .loadAndPop("tail", 1.52, 1.74)
    .level("tail", 1.79)
    .flick("tail", "heel", 1.79, 0.08)
    .sweep360("tail", "heel", 1.58, 1.79)
    .catch(2.31)
    .build(),
  shots: [
    { fromS: 0, shot: { kind: "lowSide", side: "left", distanceM: 2.4, leadM: 0.8 } },
    {
      fromS: 1.6,
      shot: {
        kind: "fixedTripod",
        positionM: [park.kicker.xM + 3.4, 0.35, park.kicker.zM - 2.6],
        fovStartDeg: 50,
        fovEndDeg: 36,
        zoomS: 4,
      },
    },
  ],
  slowMotion: [{ fromS: 1.72, toS: 2.5, scale: 0.3 }],
  expect: { tricks: ["360 Flip"] },
};

/**
 * Quarter pipe: rolling in at 5.5 m/s across the halfpipe's flat bottom, up the east
 * quarter pipe, back down fakie, and a fakie ollie on the flat bottom (pop 1.75 s).
 */
export const quarterPipeFakie: MontageClip = {
  id: "quarter-pipe-fakie",
  title: "Quarter pipe · Fakie Ollie",
  level: "park",
  stance: "regular",
  spawn: { xM: hp.xM - 1.7, yM: 0, zM: hp.zM, headingRad: 0, speedMps: 5.5 },
  durationS: 3.3,
  keys: new KeyTimeline("regular")
    .loadAndPop("tail", 1.53, 1.75)
    .level("tail", 1.8)
    .catch(2.2)
    .build(),
  shots: [
    {
      fromS: 0,
      shot: {
        kind: "fixedTripod",
        positionM: [hp.xM, 0.9, hp.zM + hp.widthM / 2 + 1.4],
        fovStartDeg: 55,
        fovEndDeg: 38,
        zoomS: 3,
      },
    },
    { fromS: 1.6, blendS: 0.35, shot: { kind: "fisheyeFollow" } },
  ],
  slowMotion: [{ fromS: 1.72, toS: 2.3, scale: 0.4 }],
  expect: { tricks: ["Fakie Ollie"], rollsFakieAtS: 1.6 },
};
