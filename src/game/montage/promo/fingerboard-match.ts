import type { MontageLookCue } from "../../../presentation/cinematic/montage-look";
import type { MontageClip } from "../clip";
import { KeyTimeline } from "../timeline";
import { createDeskSetLevel, DESK_CAMERA, DESK_RAIL_FAR_X } from "./desk-set";
import type { PromoSequence } from "./promo";

/*
 * THE FINGERBOARD MATCH CUT. The LinkedIn promo opens on a real fingerboard clip
 * (recordings/linkedin/source/fingerboard.mp4, never committed) whose second trick is a
 * kickflip into a 50-50 on a small flat rail, coming at the phone. This is the same trick in
 * the game, on the desk set, filmed by the camera fitted to the phone (`DESK_CAMERA`), so
 * the edit can crossfade from the real board to the game board at the lock. The game rail
 * runs on past the real one: the board keeps grinding while the camera eases back and
 * round to a side angle (revealing the game), kickflips out at the end and rides away.
 * Timing: the real board locks at 5.77 s of the source; the game board at ≈ 1.66 s of this
 * clip, so game time = source time − 4.11 s (the edit lines them up; SCRIPT.md).
 */

/** Real-to-game time offset of the match: game clip time = source time − this, s. */
export const MATCH_OFFSET_S = 4.11;

/** The trick-out's pop and landing, clip s (the landing is the music's entry). */
export const DESK_POP_OUT_S = 3.4;
export const DESK_LAND_S = 4.05;

const POP_S = 1.05;

/**
 * Kickflip → BS 50-50 → Kickflip out on the desk rail, straight at the camera. The street
 * flat bar's G1 approach (0.15 m to the side, angled 0.03 rad onto it) at 3.6 m/s from 5.5 m
 * before the rail's far end; a full load, the pop at 1.05 s, W + A, Space as the flip comes
 * round (1.56 s: `findCatchTimeS`, lands with Space in ≈ 1.52–1.60 s), the lock at ≈ 1.66 s.
 * It grinds down the long rail; ↓ + S from 3.15 s and ↓ let go at 3.40 s pop out of the grind
 * (the rail ends at ≈ 3.8 s), W + A flips it, Space at 3.93 s (`findCatchTimeS`; lands with
 * Space in ≈ 3.89–3.97 s), the landing at ≈ 4.05 s, then it rides away.
 * Camera: locked at the phone's pose through the cut, then travelling with the board (the
 * same framing, the world sliding by), then a 1.8 s eased move back and round
 * to a low angle beside the rail (a blend into `lowSide`), which follows the ride-away.
 */
export const promoDeskKickflipFiftyFifty: MontageClip = {
  id: "promo-desk-kickflip-fifty-fifty",
  title: "Kickflip → BS 50-50 → Kickflip out · desk rail",
  level: "promo-desk",
  createLevel: createDeskSetLevel,
  stance: "regular",
  spawn: { xM: DESK_RAIL_FAR_X - 5.5, yM: 0, zM: 0.15, headingRad: 0.03, speedMps: 3.6 },
  durationS: 5.99,
  keys: new KeyTimeline("regular")
    .loadAndPop("tail", POP_S - 0.36, POP_S)
    .level("tail", POP_S + 0.05)
    .flick("tail", "heel", POP_S + 0.05, 0.12)
    .catch(1.56)
    .foot("front", "down", DESK_POP_OUT_S - 0.25, 0.3)
    .foot("back", "down", DESK_POP_OUT_S - 0.25, 0.25)
    .level("tail", DESK_POP_OUT_S + 0.05, 0.1)
    .flick("tail", "heel", DESK_POP_OUT_S + 0.05, 0.12)
    .catch(3.93)
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
    {
      // Just after the crossfade: the same pose, now travelling with the board (it holds
      // its place in the frame instead of running past the lens).
      fromS: 1.74,
      shot: {
        kind: "travelWith",
        positionM: DESK_CAMERA.positionM,
        lookAtM: DESK_CAMERA.lookAtM,
        fovDeg: DESK_CAMERA.fovDeg,
        easeInS: 0.3,
      },
    },
    {
      fromS: 2.3,
      blendS: 1.8,
      shot: {
        kind: "lowSide",
        side: "left",
        distanceM: 2.6,
        heightM: 0.35,
        leadM: 0.8,
        fovDeg: 42,
      },
    },
  ],
  // Real time through the crossfade (so the match holds); the grind a little slow while the
  // camera moves; the trick-out slower; the ride-away real time.
  slowMotion: [
    { fromS: 1.85, toS: 3.38, scale: 0.6 },
    { fromS: 3.38, toS: 4.12, scale: 0.5 },
  ],
  expect: { tricks: ["Kickflip → BS 50-50 → Kickflip out"] },
};

/**
 * The desk look: a dark, warm "desk mat" ground and warm, dim light, like the room of the
 * real clip, held through the cut and eased back to the game's look while the camera pulls
 * back (so the reveal lands in the game's own plaza).
 */
export const DESK_LOOK: MontageLookCue = {
  look: {
    groundColor: "#4a423b",
    sunColor: "#ffc48a",
    sunIntensityScale: 0.75,
    hemiSkyColor: "#e9cfa8",
    hemiGroundColor: "#4a423b",
    hemiIntensityScale: 0.7,
  },
  holdS: 1.9,
  releaseS: 3.3,
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
      startAtS: 1.45,
      look: DESK_LOOK,
      tricks: { show: false, caption: "" },
      fadeInS: 0,
      fadeOutS: 0,
      stillsAtS: [1.56, 1.66, 1.72],
    },
  ],
};
