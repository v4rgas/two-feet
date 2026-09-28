import { EL_TORO } from "../../../maps/el-toro/el-toro.config";
import { STREET_CONFIG } from "../../../maps/street/street.config";
import type { MontageClip } from "../clip";
import { treFlipEuroGap } from "../clips/ramps";
import { stairsTailslideHardflip } from "../clips/stairs";
import { ollieSevenStair } from "../clips/street";
import { KeyTimeline } from "../timeline";
import { DESK_LAND_S, DESK_LOOK, promoDeskKickflipFiftyFifty } from "./fingerboard-match";
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
const bar = street.flatBar;
const QUAD_Y = EL_TORO.stairs.stepCount * EL_TORO.stairs.riseM + EL_TORO.plaza.aboveStairsM;

/** The basics' pops (clip s): the ollie, then the kickflip. */
const OLLIE_S = 8.96;
const FLIP_S = 12.76;

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
  durationS: 15.39,
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
    .catch(13.3)
    .build(),
  shots: [{ fromS: 0, shot: { kind: "follow" } }],
  slowMotion: [
    { fromS: OLLIE_S - 0.4, toS: 9.65, scale: 0.5 },
    { fromS: FLIP_S - 0.4, toS: 13.55, scale: 0.5 },
  ],
  expect: { tricks: ["Ollie", "Kickflip"] },
};

/**
 * Ollie to 50-50 on the street's flat bar (scenario G1's line, from 2 m further back so the
 * approach reads): rolling at 4 m/s from 8.5 m before the bar's middle, 0.15 m to its side
 * and angled 0.03 rad onto it; ↓ + S from 0.84 s, the pop at 1.2 s, W; the lock (nothing
 * held: a backside 50-50) at ≈ 1.72 s, the grind to the end (≈ 3.17 s), the landing ≈ 3.47 s.
 */
export const promoRailFiftyFifty: MontageClip = {
  id: "promo-rail-fifty-fifty",
  title: "BS 50-50 · flat bar",
  level: "street",
  stance: "regular",
  spawn: { xM: bar.xM - 8.5, yM: 0, zM: bar.zM + 0.15, headingRad: 0.03, speedMps: 4 },
  durationS: 5.19,
  keys: new KeyTimeline("regular").loadAndPop("tail", 0.84, 1.2).level("tail", 1.25).build(),
  shots: [
    { fromS: 0, shot: { kind: "fisheyeFollow" } },
    { fromS: 1.05, shot: { kind: "lowSide", side: "left", distanceM: 2.4, leadM: 0.8 } },
    { fromS: 3.0, blendS: 0.8, shot: { kind: "follow" } },
  ],
  slowMotion: [{ fromS: 1.15, toS: 1.85, scale: 0.5 }],
  expect: { tricks: ["BS 50-50"] },
};

/** The 7-stair ollie, with a longer ride-away (landing ≈ 1.77 s). */
export const promoOllieSevenStair: MontageClip = {
  ...ollieSevenStair,
  id: "promo-ollie-seven-stair",
  durationS: 3.96,
  slowMotion: [{ fromS: 0.85, toS: 1.8, scale: 0.5 }],
};

/** The 7-stair's foot (its last nosing), x, and the +Z hubba's steel edge, z. */
const STAIRS_FOOT_X = stairs.xM + (stairs.stepCount - 1) * stairs.runM;
const HUBBA_EDGE_Z = stairs.zM + stairs.widthM / 2;

/**
 * The G4 line (kickflip → FS tailslide → hardflip out on the 7-stair hubba, landing ≈ 2.67
 * s), with lighter slow motion, a tripod further out than the montage's, and a tracking side
 * angle for the ride-away, so the
 * ride-away never runs into the lens.
 */
export const promoLineG4: MontageClip = {
  ...stairsTailslideHardflip,
  id: "promo-line-g4",
  durationS: 4.75,
  shots: [
    ...stairsTailslideHardflip.shots.slice(0, 2),
    {
      fromS: 1.9,
      shot: {
        kind: "fixedTripod",
        positionM: [STAIRS_FOOT_X + 5.5, 0.7, HUBBA_EDGE_Z - 4.4],
        fovStartDeg: 40,
        fovEndDeg: 30,
        zoomS: 3,
      },
    },
    // The ride-away heads for the tripod: ease into a tracking side angle before it gets close.
    {
      fromS: 3.0,
      blendS: 0.7,
      shot: { kind: "lowSide", side: "left", distanceM: 3.0, heightM: 0.35, leadM: 1.0 },
    },
  ],
  slowMotion: [
    { fromS: 1.3, toS: 1.84, scale: 0.6 },
    { fromS: 1.92, toS: 2.7, scale: 0.5 },
  ],
};

/** The 360 flip off the euro gap (landing ≈ 1.77 s), a longer ride-away. */
export const promoLineTreGap: MontageClip = {
  ...treFlipEuroGap,
  id: "promo-line-tre-gap",
  durationS: 3.96,
  slowMotion: [{ fromS: 0.86, toS: 1.64, scale: 0.45 }],
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
  durationS: 4.37,
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
      // The match cut: enters at 5.72 s of the real clip (game = real − 4.11 s), under the
      // edit's crossfade; the lock at ≈ 1.66 s; the landing (4.05 s) is the music's entry.
      kind: "clip",
      clip: promoDeskKickflipFiftyFifty,
      startAtS: 1.61,
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

      tricks: { show: false, caption: "" },
      sticks: "large",
      fadeInS: 0,
      fadeOutS: 0,
      overlays: [
        { kind: "kicker", text: "wasd moves the front foot", fromS: 0.1, holdS: 2.8, ...CUE },
        {
          kind: "kicker",
          text: "arrows move the back foot",
          fromS: 0.4,
          holdS: 2.7,
          atY: 0.14,
          ...CUE,
        },
        { kind: "kicker", text: "space pushes", fromS: 3.2, holdS: 3.4, ...CUE },
        { kind: "kicker", text: "hold ↓ and s, let go of ↓", fromS: 7.0, holdS: 3.7, ...CUE },
        { kind: "kicker", text: "tap a to flip it", fromS: 10.3, holdS: 3.0, ...CUE },
        {
          kind: "kicker",
          text: "space to catch",
          fromS: 11.2,
          holdS: 3.2,
          atY: 0.14,
          ...CUE,
        },
      ],
      stillsAtS: [2.0, 9.1, 12.9],
    },
    {
      kind: "clip",
      clip: promoRailFiftyFifty,
      sticks: "small",
      tricks: NAME_ONLY,
      fadeInS: 0,
      fadeOutS: 0,
      stillsAtS: [2.2],
    },
    {
      kind: "clip",
      clip: promoOllieSevenStair,
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
      kind: "clip",
      clip: promoLineTreGap,
      sticks: "small",
      tricks: NAME_ONLY,
      fadeInS: 0,
      fadeOutS: 0,
      stillsAtS: [1.2],
    },
    {
      kind: "clip",
      clip: promoTreFlipElToro,
      startAtS: 0.4,
      tricks: NAME_ONLY,
      fadeInS: 0,
      fadeOutS: 0.4,
      stillsAtS: [1.75, 2.15],
    },
    {
      kind: "card",
      id: "end-card",
      durationS: 3.0,
      fadeInS: 0.4,
      fadeOutS: 0,
      card: {
        title: "TWO FEET",
        tagline: "",
        credit: "a game by v4rgas",
        url: "v4rgas.com",
        line: "music: Rio Samba by Liborio Conti",
        penguin: true,
      },
      stillsAtS: [2],
    },
  ],
};
