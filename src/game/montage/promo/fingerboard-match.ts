import type { MontageClip } from "../clip";
import { KeyTimeline } from "../timeline";
import { createDeskSetLevel, DESK_CAMERA, DESK_SET } from "./desk-set";
import type { PromoSequence } from "./promo";

/*
 * THE FINGERBOARD MATCH CUT. The LinkedIn promo opens on a real fingerboard clip
 * (recordings/linkedin/source/fingerboard.mp4, never committed) whose second trick is a
 * kickflip into a 50-50 on a small flat rail, coming at the phone. This is the same trick in
 * the game, on the desk set, filmed by the camera fitted to the phone (`DESK_CAMERA`), so
 * the edit can crossfade from the real board to the game board at the lock.
 * Timing: the real board locks at 5.77 s of the source; the game board at ≈ 1.63 s of this
 * clip, so game time = source time − 4.14 s (the edit lines them up; SCRIPT.md).
 */

/** Real-to-game time offset of the match: game clip time = source time − this, s. */
export const MATCH_OFFSET_S = 4.14;

const RAIL_FAR_X = -DESK_SET.rail.lengthM;
const POP_S = 1.05;

/**
 * Kickflip → BS 50-50 on the desk rail, straight at the camera. The street flat bar's G1
 * approach (0.15 m to the side, angled 0.03 rad onto it, 4 m/s) from 5.9 m before the rail's
 * far end; a full load, the pop at 1.05 s, W + A, Space as the flip comes round (1.56 s:
 * `findCatchTimeS`, lands with Space in ≈ 1.52–1.60 s), the lock at ≈ 1.58 s, the grind to the
 * rail's near end (≈ 1.96 s), roll off and land. The locked-off phone camera for the match,
 * then a low side angle for the roll-away.
 */
export const promoDeskKickflipFiftyFifty: MontageClip = {
  id: "promo-desk-kickflip-fifty-fifty",
  title: "Kickflip → BS 50-50 · desk rail",
  level: "promo-desk",
  createLevel: createDeskSetLevel,
  stance: "regular",
  spawn: { xM: RAIL_FAR_X - 5.5, yM: 0, zM: 0.15, headingRad: 0.03, speedMps: 3.6 },
  durationS: 3.5,
  keys: new KeyTimeline("regular")
    .loadAndPop("tail", POP_S - 0.36, POP_S)
    .level("tail", POP_S + 0.05)
    .flick("tail", "heel", POP_S + 0.05, 0.12)
    .catch(1.56)
    .build(),
  shots: [
    {
      fromS: 0,
      shot: {
        kind: "fixedTripod",
        positionM: DESK_CAMERA.positionM,
        lookAtM: DESK_CAMERA.lookAtM,
        fovStartDeg: DESK_CAMERA.fovDeg,
        fovEndDeg: DESK_CAMERA.fovDeg,
        zoomS: 0,
      },
    },
    { fromS: 1.98, shot: { kind: "lowSide", side: "right", distanceM: 2.4, leadM: 1.2 } },
  ],
  // Real time through the crossfade (so the match holds), then the grind in slow motion.
  slowMotion: [{ fromS: 1.76, toS: 2.0, scale: 0.4 }],
  expect: { tricks: ["Kickflip → BS 50-50"] },
};

/**
 * The match test (`?montage=promo-desk-match&record=frames`): the desk clip alone from just
 * before the lock, with stills at the match frames, to lay over the real frames (SCRIPT.md).
 */
export const promoDeskMatch: PromoSequence = {
  id: "promo-desk-match",
  format: "4x5",
  items: [
    {
      kind: "clip",
      clip: promoDeskKickflipFiftyFifty,
      startAtS: 1.4,
      tricks: { show: false, caption: "" },
      fadeInS: 0,
      fadeOutS: 0,
      stillsAtS: [1.53, 1.63, 1.69, 1.75],
    },
  ],
};
