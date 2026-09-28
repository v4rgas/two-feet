import { EL_TORO } from "../../../maps/el-toro/el-toro.config";
import { STREET_CONFIG } from "../../../maps/street/street.config";
import type { MontageClip } from "../clip";
import { stairsTailslideHardflip } from "../clips/stairs";
import { KeyTimeline } from "../timeline";
import { DESK_LAND_S, DESK_LOOK, promoDeskKickflipFiftyFifty } from "./fingerboard-match";
import {
  promoBailElToro,
  promoLineFlipInOut,
  promoLineFunbox,
  promoLineKinkedRail,
  promoLineManual,
  promoLineQuarterPipe,
} from "./lines";
import type { PromoSequence } from "./promo";

/*
 * THE LINKEDIN PROMO, game half (`?montage=promo-linkedin&record=frames`): the storyboard,
 * the research rules it follows and the copy are in promo/linkedin/SCRIPT.md at the repo
 * root. The video opens on a real fingerboard clip that the ffmpeg edit crossfades into the
 * first item here (the desk match cut, which grinds on, kickflips out and lands on the
 * music's entry, under the one title). Then an escalation, one trick at a time, each with
 * its approach and its ride-away: the basics in the player's own camera (push, ollie,
 * kickflip, with the controls), a 50-50 and the 7-stair, the technical line and the euro
 * gap, and El Toro last. Hard cuts, on the music's bars. Cut for a 4:5 feed video. Every
 * clip is real input, verified by `pnpm montage:verify` (tuned with `findCatchTimeS`).
 */

const street = STREET_CONFIG;
const stairs = street.bigStairs;
const QUAD_Y = EL_TORO.stairs.stepCount * EL_TORO.stairs.riseM + EL_TORO.plaza.aboveStairsM;

/** The basics' pops (clip s): the ollie, then the kickflip. */
const OLLIE_S = 8.96;
const FLIP_S = 11.76;

/**
 * The basics, in the player's own camera (the game's follow rig) with the input widgets
 * big where the game's foot pads sit. A standing start on the flat map, 16 m behind its
 * plaza's west gap, facing in. Nothing moves for 5 s (the first caption); three pushes
 * (Space at 5.0, 5.7, 6.4 s: ≈ 3.3 m/s); an ollie (↓ + S from 8.60 s, ↓ let go at 8.96 s,
 * W at 9.01 s, Space at 9.01 s: `findCatchTimeS` → 8.98), landing 9.57 s; a kickflip (↓ + S
 * from 12.40 s, pop 12.76 s, W + A at 12.81 s, Space at 13.30 s: `findCatchTimeS` → 13.30,
 * lands with Space in ≈ 13.25–13.35 s), landing 13.44 s, inside the plaza. 0.5× slow motion
 * from each load to its landing only.
 */
export const promoBasics: MontageClip = {
  id: "promo-basics",
  title: "Push, Ollie, Kickflip · basics",
  level: "flat",
  stance: "regular",
  spawn: { xM: -24, yM: 0, zM: 0, headingRad: 0, speedMps: 0 },
  durationS: 14.7,
  keys: new KeyTimeline("regular")
    .push(5.0)
    .push(5.7)
    .push(6.4)
    .loadAndPop("tail", OLLIE_S - 0.36, OLLIE_S)
    .level("tail", OLLIE_S + 0.05, 0.15)
    .catch(9.01)
    .loadAndPop("tail", FLIP_S - 0.36, FLIP_S)
    .level("tail", FLIP_S + 0.05)
    .flick("tail", "heel", FLIP_S + 0.05, 0.12)
    .catch(12.3)
    .build(),
  // The game's own camera, framed a little wider and higher for the 4:5 frame.
  shots: [
    { fromS: 0, shot: { kind: "follow", widen: { pullBack: 1.4, raiseM: 0.18, fovAddDeg: 4 } } },
  ],
  slowMotion: [
    { fromS: OLLIE_S - 0.4, toS: 9.65, scale: 0.5 },
    { fromS: FLIP_S - 0.4, toS: 12.55, scale: 0.5 },
  ],
  expect: { tricks: ["Ollie", "Kickflip"] },
};

/** The 7-stair's foot (its last nosing), x, and the +Z hubba's steel edge, z. */
const STAIRS_FOOT_X = stairs.xM + (stairs.stepCount - 1) * stairs.runM;
const HUBBA_EDGE_Z = stairs.zM + stairs.widthM / 2;

/** The tripod beside the hubba's foot and the tracking side angle for its ride-away. */
const HUBBA_TRIPOD = {
  kind: "fixedTripod",
  positionM: [STAIRS_FOOT_X + 5.5, 0.7, HUBBA_EDGE_Z - 4.4],
  fovStartDeg: 40,
  fovEndDeg: 30,
  zoomS: 3,
} as const;
const HUBBA_RIDE_AWAY = {
  kind: "lowSide",
  side: "left",
  distanceM: 3.0,
  heightM: 0.35,
  leadM: 1.0,
} as const;

/**
 * The G4 line (kickflip → FS tailslide → hardflip out on the 7-stair hubba, landing ≈ 2.67
 * s), with lighter slow motion, a tripod further out than the montage's, and a tracking side
 * angle for the ride-away, so the
 * ride-away never runs into the lens.
 */
export const promoLineG4: MontageClip = {
  ...stairsTailslideHardflip,
  id: "promo-line-g4",
  durationS: 4.753,
  shots: [
    ...stairsTailslideHardflip.shots.slice(0, 2),
    { fromS: 1.9, shot: HUBBA_TRIPOD },
    // The ride-away heads for the tripod: ease into a tracking side angle before it gets close.
    { fromS: 3.0, blendS: 0.7, shot: HUBBA_RIDE_AWAY },
  ],
  slowMotion: [
    { fromS: 1.3, toS: 1.84, scale: 0.6 },
    { fromS: 1.92, toS: 2.7, scale: 0.5 },
  ],
};

/**
 * 360 flip down El Toro (the 20-stair, 3.3 m). Rolling at 4.5 m/s on the quad, 9 m
 * behind the top nosing, two pushes; a full load with → held (the 360 shove's pre-position),
 * the pop at 1.4 s, then W + A and ← together: a kickflip and a backside 360 shove, the tre
 * flip. Space as flip and shove come round (`findCatchTimeS` → 1.967; lands with Space in
 * ≈ 1.82–2.07 s). It rides the rest of the drop with the feet on, lands (≈ 2.70 s), rolls
 * away past the tripod.
 */
const TRE_POP_S = 1.4;
export const promoTreFlipElToro: MontageClip = {
  id: "promo-tre-flip-el-toro",
  title: "360 Flip · El Toro",
  level: "el-toro",
  stance: "regular",
  spawn: { xM: -9, yM: QUAD_Y, zM: 0, headingRad: 0, speedMps: 4.5 },
  durationS: 4.95,
  keys: new KeyTimeline("regular")
    .push(0.25)
    .push(0.9)
    .loadAndPop("tail", TRE_POP_S - 0.36, TRE_POP_S)
    .level("tail", TRE_POP_S + 0.05, 0.12)
    .flick("tail", "heel", TRE_POP_S + 0.05, 0.12)
    .sweep360("tail", "heel", TRE_POP_S - 0.2, TRE_POP_S + 0.05)
    .catch(1.94)
    .build(),
  shots: [
    { fromS: 0, shot: { kind: "fisheyeFollow" } },
    {
      fromS: TRE_POP_S - 0.15,
      shot: {
        kind: "fixedTripod",
        // In the courtyard off the +Z side, 11 m out: the top of the set to the landing,
        // the rider big enough to read the flip in a portrait frame; it rolls past.
        positionM: [11, 1.2, 5.5],
        fovStartDeg: 38,
        fovEndDeg: 27,
        zoomS: 4,
      },
    },
  ],
  slowMotion: [{ fromS: TRE_POP_S + 0.02, toS: TRE_POP_S + 1.3, scale: 0.4 }],
  expect: { tricks: ["360 Flip"] },
};

/** Trick names only (no sub-captions): the recognizer's own name, as the game shows it. */
const NAME_ONLY = { show: true, caption: "" } as const;
/** Caption timing in the basics: on before the move, off after it (hard, no drift). */
const CUE = { fadeInS: 0.2, fadeOutS: 0.3 } as const;

/**
 * The game half of the LinkedIn cut (SCRIPT.md has the timings and the research rules).
 * Text: TWO FEET once, the controls in the basics, the trick names later, the end card.
 */
export const promoLinkedIn: PromoSequence = {
  id: "promo-linkedin",
  format: "4x5",
  items: [
    {
      // The match cut: enters at 5.40 s of the real clip (game = real − 4.11 s), under the
      // edit's 0.65 s dissolve (5.40–6.05, over the lock at ≈ 1.66 s = 5.77 s); the landing
      // (4.05 s) is where the music reaches full level on a downbeat.
      kind: "clip",
      clip: promoDeskKickflipFiftyFifty,
      startAtS: 1.29,
      look: DESK_LOOK,
      tricks: { show: false, caption: "" },
      fadeInS: 0,
      fadeOutS: 0,
      overlays: [
        {
          kind: "wordmark",
          text: "TWO FEET",
          fromS: DESK_LAND_S + 0.05,
          holdS: 1.4,
          fadeInS: 0.3,
          fadeOutS: 0.25,
          atY: 0.22,
        },
      ],
      stillsAtS: [1.66, 2.6, 4.3],
    },
    {
      kind: "clip",
      clip: promoBasics,
      // The standing start carries the first two captions; then "space pushes" 1.7 s ahead.
      startAtS: 0.3,
      tricks: { show: false, caption: "" },
      sticks: "large",
      fadeInS: 0,
      fadeOutS: 0,
      overlays: [
        { kind: "kicker", text: "wasd moves the front foot", fromS: 0.3, holdS: 2.8, ...CUE },
        {
          kind: "kicker",
          text: "arrows move the back foot",
          fromS: 0.6,
          holdS: 2.7,
          atY: 0.14,
          ...CUE,
        },
        { kind: "kicker", text: "space pushes", fromS: 3.3, holdS: 3.2, ...CUE },
        { kind: "kicker", text: "hold ↓ and s, let go of ↓", fromS: 7.0, holdS: 3.7, ...CUE },
        { kind: "kicker", text: "tap a to flip it", fromS: 9.8, holdS: 3.0, ...CUE },
        {
          kind: "kicker",
          text: "space to catch",
          fromS: 10.3,
          holdS: 3.2,
          atY: 0.14,
          ...CUE,
        },
      ],
      stillsAtS: [2.0, 9.1, 12.9],
    },
    {
      kind: "clip",
      clip: promoLineManual,
      sticks: "small",
      // Manuals carry no recognizer name: the line is named once it lands.
      tricks: { show: false, caption: "" },
      fadeInS: 0,
      fadeOutS: 0,
      overlays: [
        {
          kind: "lowerThird",
          text: "Manual → Nose Manual → Kickflip",
          fromS: 4.98,
          holdS: 1.6,
          fadeInS: 0.18,
          fadeOutS: 0.4,
        },
      ],
      stillsAtS: [1.8, 3.6],
    },
    {
      kind: "clip",
      clip: promoLineKinkedRail,
      sticks: "small",
      tricks: NAME_ONLY,
      fadeInS: 0,
      fadeOutS: 0,
      stillsAtS: [2.9],
    },
    {
      kind: "clip",
      clip: promoLineFunbox,
      sticks: "small",
      tricks: NAME_ONLY,
      fadeInS: 0,
      fadeOutS: 0,
      stillsAtS: [3.0],
    },
    {
      kind: "clip",
      clip: promoLineQuarterPipe,
      sticks: "small",
      tricks: NAME_ONLY,
      fadeInS: 0,
      fadeOutS: 0,
      stillsAtS: [3.2],
    },
    {
      kind: "clip",
      clip: promoLineFlipInOut,
      sticks: "small",
      tricks: NAME_ONLY,
      fadeInS: 0,
      fadeOutS: 0,
      stillsAtS: [1.4],
    },
    {
      kind: "clip",
      clip: promoLineG4,
      sticks: "small",
      tricks: NAME_ONLY,
      fadeInS: 0,
      fadeOutS: 0,
      stillsAtS: [1.5],
    },
    {
      // The gag: "try 1" (no text): the double kickflip that never gets caught, the ragdoll,
      // a hard cut while the board is still sliding.
      kind: "clip",
      clip: promoBailElToro,
      startAtS: 0.9,
      tricks: { show: false, caption: "" },
      fadeInS: 0,
      fadeOutS: 0,
      stillsAtS: [3.0],
    },
    {
      kind: "clip",
      clip: promoTreFlipElToro,
      startAtS: 0,
      tricks: NAME_ONLY,
      fadeInS: 0,
      fadeOutS: 0.4,
      stillsAtS: [1.75, 2.15],
    },
    {
      kind: "card",
      id: "end-card",
      durationS: 3.5,
      fadeInS: 0.4,
      fadeOutS: 0,
      card: {
        title: "TWO FEET",
        tagline: "",
        credit: "a game by v4rgas",
        url: "twofeet.v4rgas.com",
        line: "",
        penguin: true,
      },
      stillsAtS: [2],
    },
  ],
};

/**
 * The LinkedIn cut's end card alone (`?montage=promo-linkedin-end-card&record=frames`): to
 * re-render just the card and splice it onto an existing recording of the game half.
 */
export const promoLinkedInEndCard: PromoSequence = {
  id: "promo-linkedin-end-card",
  format: "4x5",
  items: promoLinkedIn.items.filter((i) => i.kind === "card"),
};
