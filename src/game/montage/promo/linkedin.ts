import { EL_TORO } from "../../../maps/el-toro/el-toro.config";
import { STREET_CONFIG } from "../../../maps/street/street.config";
import type { MontageClip } from "../clip";
import { bs180KickflipFlat } from "../clips/flat";
import { treFlipEuroGap } from "../clips/ramps";
import { stairsTailslideHardflip } from "../clips/stairs";
import { KeyTimeline } from "../timeline";
import { promoDeskKickflipFiftyFifty } from "./fingerboard-match";
import type { PromoSequence } from "./promo";

/*
 * THE LINKEDIN PROMO, game half (`?montage=promo-linkedin&record=frames`): the storyboard
 * and the copy are in promo/linkedin/SCRIPT.md at the repo root. The video opens on a real
 * fingerboard clip that the ffmpeg edit crossfades into the first item here (the desk
 * match cut); then the title, the controls, three lines, El Toro and the end card. Cut for
 * a 4:5 feed video (1080 × 1350). Every clip is real input, verified by
 * `pnpm montage:verify` (tuned with `findCatchTimeS`).
 */

const street = STREET_CONFIG;
const stairs = street.bigStairs;
const QUAD_Y = EL_TORO.stairs.stepCount * EL_TORO.stairs.riseM + EL_TORO.plaza.aboveStairsM;

/**
 * Deck reveal (the title beat). Rolling slowly (1.3 m/s) on the 7-stair's deck, the two
 * shoes on the grip; a long-lens orbit pushes in low from the heel side. Pop at 1.4 s and a
 * heelflip (W + D): the deck's underside (the penguin graphic) turns toward the camera
 * (≈ 1.55–1.75 s) and up, in 0.2× slow motion; Space as it comes round (lands with Space in
 * ≈ 1.81–2.16 s: `findCatchTimeS` → 1.958).
 */
const REVEAL_POP_S = 1.4;
export const promoDeckReveal: MontageClip = {
  id: "promo-deck-reveal",
  title: "Heelflip · deck reveal",
  level: "street",
  stance: "regular",
  spawn: {
    xM: stairs.xM - 5.5,
    yM: stairs.stepCount * stairs.riseM,
    zM: 0,
    headingRad: 0,
    speedMps: 1.3,
  },
  durationS: 2.45,
  keys: new KeyTimeline("regular")
    .loadAndPop("tail", REVEAL_POP_S - 0.36, REVEAL_POP_S)
    .level("tail", REVEAL_POP_S + 0.05, 0.12)
    .flick("tail", "toe", REVEAL_POP_S + 0.05, 0.12)
    .catch(1.96)
    .build(),
  shots: [
    {
      fromS: 0,
      shot: { kind: "deckShowcase", startAngleRad: 0.95, rateRadps: 0.2, pushS: 3.2 },
    },
  ],
  slowMotion: [
    { fromS: 1.25, toS: 1.52, scale: 0.5 },
    { fromS: 1.52, toS: 1.98, scale: 0.2 },
  ],
  expect: { tricks: ["Heelflip"] },
};

/**
 * The controls shot: a kickflip on flat ground, filmed from the toe side, with the input
 * widgets big. Rolling at 3.2 m/s; ↓ + S from 1.9 s (the back foot on the tail, the front
 * foot set), release ↓ at 2.26 s (the pop), W + A at 2.31 s (the front foot flicks), Space at
 * 2.8 s (`findCatchTimeS` → 2.80; lands with Space in ≈ 2.75–2.85 s). 0.25× slow motion
 * from the load to the landing, so every key reads.
 */
const CONTROLS_POP_S = 2.26;
export const promoControlsKickflip: MontageClip = {
  id: "promo-controls-kickflip",
  title: "Kickflip · controls",
  level: "flat",
  stance: "regular",
  spawn: { xM: -8, yM: 0, zM: 0, headingRad: 0, speedMps: 3.2 },
  durationS: 4.19,
  keys: new KeyTimeline("regular")
    .loadAndPop("tail", CONTROLS_POP_S - 0.36, CONTROLS_POP_S)
    .level("tail", CONTROLS_POP_S + 0.05)
    .flick("tail", "heel", CONTROLS_POP_S + 0.05, 0.12)
    .catch(2.8)
    .build(),
  shots: [
    {
      fromS: 0,
      shot: {
        kind: "lowSide",
        side: "right",
        distanceM: 2.1,
        heightM: 0.4,
        leadM: 0.3,
        fovDeg: 42,
      },
    },
  ],
  slowMotion: [{ fromS: 2.1, toS: 3.0, scale: 0.25 }],
  expect: { tricks: ["Kickflip"] },
};

/** A montage clip, trimmed and re-timed for the lines section (same keys: same landing). */
function lineCut(
  id: string,
  source: MontageClip,
  patch: Partial<Pick<MontageClip, "shots">> & Pick<MontageClip, "durationS" | "slowMotion">,
): MontageClip {
  return { ...source, ...patch, id };
}

/** The 7-stair's foot (its last nosing), x, and the +Z hubba's steel edge, z. */
const STAIRS_FOOT_X = stairs.xM + (stairs.stepCount - 1) * stairs.runM;
const HUBBA_EDGE_Z = stairs.zM + stairs.widthM / 2;

/**
 * The G4 line (kickflip → FS tailslide → hardflip out on the 7-stair hubba), lighter slow-mo.
 * Its tripod stands further out than the montage's (5.5 m past the foot, 4 m off the line),
 * so the longer roll-away (room for the lower-third) never runs into the lens.
 */
export const promoLineG4 = lineCut("promo-line-g4", stairsTailslideHardflip, {
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
  ],
  durationS: 3.9,
  slowMotion: [
    { fromS: 1.3, toS: 1.84, scale: 0.55 },
    { fromS: 1.92, toS: 2.7, scale: 0.5 },
  ],
});

/** The 360 flip off the euro gap, lighter slow-mo. */
export const promoLineTreGap = lineCut("promo-line-tre-gap", treFlipEuroGap, {
  durationS: 3.2,
  slowMotion: [{ fromS: 0.86, toS: 1.64, scale: 0.5 }],
});

/** The BS 180 kickflip on flat, rolling away fakie. */
export const promoLineBs180 = lineCut("promo-line-bs180", bs180KickflipFlat, {
  durationS: 3.08,
  slowMotion: [{ fromS: 0.97, toS: 1.7, scale: 0.4 }],
});

/**
 * 360 flip down El Toro (the 20-stair, 3.3 m). Rolling at 4.5 m/s on the quad, 9 m
 * behind the top nosing, two pushes; a full load with → held (the 360 shove's pre-position),
 * the pop at 1.4 s, then W + A and ← together: a kickflip and a backside 360 shove, the tre
 * flip. Space as flip and shove come round (`findCatchTimeS` → 1.967; lands with Space in
 * ≈ 1.82–2.07 s). It rides the rest of the drop with the feet on, lands, rolls away.
 */
const TRE_POP_S = 1.4;
export const promoTreFlipElToro: MontageClip = {
  id: "promo-tre-flip-el-toro",
  title: "360 Flip · El Toro",
  level: "el-toro",
  stance: "regular",
  spawn: { xM: -9, yM: QUAD_Y, zM: 0, headingRad: 0, speedMps: 4.5 },
  durationS: 4.17,
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
  slowMotion: [{ fromS: TRE_POP_S + 0.02, toS: TRE_POP_S + 1.3, scale: 0.33 }],
  expect: { tricks: ["360 Flip"] },
};

/** Step captions of the controls shot (clip time; they hold on video time). */
const STEP = { fadeInS: 0.1, fadeOutS: 0.15 } as const;

/**
 * The game half of the LinkedIn cut. The copy is plain and short on purpose (SCRIPT.md
 * "Copy"): it says what is on screen.
 */
export const promoLinkedIn: PromoSequence = {
  id: "promo-linkedin",
  format: "4x5",
  items: [
    {
      // The match cut: enters at 5.72 s of the real clip (game = real − 4.14 s), under the
      // edit's crossfade; the lock is at ≈ 1.63 s.
      kind: "clip",
      clip: promoDeskKickflipFiftyFifty,
      startAtS: 1.58,
      tricks: { show: true, caption: "" },
      fadeInS: 0,
      fadeOutS: 0.2,
      overlays: [{ kind: "kicker", text: "same trick. in the browser.", fromS: 1.8, holdS: 1.5 }],
      stillsAtS: [1.63, 1.8],
    },
    {
      kind: "clip",
      clip: promoDeckReveal,
      startAtS: 0.15,
      tricks: { show: false, caption: "" },
      fadeInS: 0.2,
      fadeOutS: 0.2,
      overlays: [
        {
          kind: "wordmark",
          text: "TWO FEET",
          sub: "one foot per hand",
          fromS: 0,
          holdS: 3.2,
          fadeInS: 0.25,
          fadeOutS: 0.5,
        },
      ],
      stillsAtS: [0.6, 1.66],
    },
    {
      kind: "clip",
      clip: promoControlsKickflip,
      tricks: { show: true, caption: "" },
      sticks: "large",
      fadeInS: 0.2,
      fadeOutS: 0.2,
      overlays: [
        { kind: "kicker", text: "wasd moves the front foot", fromS: 0, holdS: 1.6 },
        { kind: "kicker", text: "arrows move the back foot", fromS: 0.3, holdS: 1.3, atY: 0.14 },
        { kind: "kicker", text: "back foot pops", fromS: 2.12, holdS: 0.7, ...STEP },
        { kind: "kicker", text: "front foot flicks", fromS: 2.36, holdS: 0.7, ...STEP },
        { kind: "kicker", text: "space catches it", fromS: 2.72, holdS: 0.8, ...STEP },
      ],
      stillsAtS: [2.26, 2.5, 2.8],
    },
    {
      kind: "clip",
      clip: promoLineG4,
      startAtS: 0.45,
      sticks: "small",
      tricks: { show: true, caption: "7-stair hubba" },
      fadeInS: 0.15,
      fadeOutS: 0.1,
      overlays: [{ kind: "kicker", text: "every trick is real input", fromS: 0.45, holdS: 1.4 }],
      stillsAtS: [1.5],
    },
    {
      kind: "clip",
      clip: promoLineTreGap,
      startAtS: 0.45,
      sticks: "small",
      tricks: { show: true, caption: "euro gap" },
      fadeInS: 0.1,
      fadeOutS: 0.1,
      stillsAtS: [1.2],
    },
    {
      kind: "clip",
      clip: promoLineBs180,
      startAtS: 0.6,
      sticks: "small",
      tricks: { show: true, caption: "flat, rolls away fakie" },
      fadeInS: 0.1,
      fadeOutS: 0.2,
      stillsAtS: [1.3],
    },
    {
      kind: "clip",
      clip: promoTreFlipElToro,
      startAtS: 0.38,
      tricks: { show: true, caption: "El Toro - 20 stairs" },
      fadeInS: 0.2,
      fadeOutS: 0.35,
      stillsAtS: [1.75, 2.15],
    },
    {
      kind: "card",
      id: "end-card",
      durationS: 3,
      fadeInS: 0.35,
      fadeOutS: 0,
      card: {
        title: "TWO FEET",
        tagline: "",
        credit: "a game by v4rgas",
        url: "v4rgas.com",
        line: "music: Rio Samba by Liborio Conti",
        penguin: true,
      },
      stillsAtS: [1.5],
    },
  ],
};
