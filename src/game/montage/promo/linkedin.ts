import { EL_TORO } from "../../../maps/el-toro/el-toro.config";
import { STREET_CONFIG } from "../../../maps/street/street.config";
import type { MontageClip } from "../clip";
import { KeyTimeline } from "../timeline";
import type { PromoSequence } from "./promo";

/*
 * THE LINKEDIN PROMO (`?montage=promo-linkedin&record=frames`): the storyboard is
 * promo/linkedin/SCRIPT.md at the repo root. Three real-input clips and an end card, cut
 * for a 4:5 feed video (1080 × 1350, `&format=16x9` for the landscape cut). Each clip is
 * verified by `pnpm montage:verify` like any montage clip (tuned with `findCatchTimeS`).
 */

const street = STREET_CONFIG;
const bar = street.flatBar;
const stairs = street.bigStairs;
const QUAD_Y = EL_TORO.stairs.stepCount * EL_TORO.stairs.riseM + EL_TORO.plaza.aboveStairsM;

/**
 * 1 · Deck reveal. Rolling slowly (1.3 m/s) on the 7-stair's deck, the two shoes on the
 * grip; a long-lens orbit pushes in low from the heel side. Pop at 1.4 s and a heelflip
 * (W + D): the deck's underside (the penguin graphic) turns toward the camera (≈ 1.55–
 * 1.75 s) and up, in 0.2× slow motion; Space as it comes round (lands with Space in
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
 * 2 · Kickflip 50-50 on the street's flat bar (0.3 m): rolling at 4 m/s from 6 m before its
 * start, 0.15 m to its side, angled 0.03 rad onto it. A full load, the pop at 1.05 s, W + A
 * (the flip-in), Space as the flip comes round (`findCatchTimeS` → 1.558; lands with Space
 * in ≈ 1.41–1.76 s), the lock-on at ≈ 1.58 s with nothing held: a backside 50-50 (the bar
 * is on the heel side). It grinds 1.65 s to the end, rolls off and lands (≈ 3.52 s):
 * "Kickflip → BS 50-50".
 */
const FIFTY_POP_S = 1.05;
export const promoKickflipFiftyFifty: MontageClip = {
  id: "promo-kickflip-fifty-fifty",
  title: "Kickflip → BS 50-50 · flat bar",
  level: "street",
  stance: "regular",
  spawn: { xM: bar.xM - 8.5, yM: 0, zM: bar.zM + 0.15, headingRad: 0.03, speedMps: 4 },
  durationS: 4.6,
  keys: new KeyTimeline("regular")
    .loadAndPop("tail", FIFTY_POP_S - 0.36, FIFTY_POP_S)
    .level("tail", FIFTY_POP_S + 0.05)
    .flick("tail", "heel", FIFTY_POP_S + 0.05, 0.12)
    .catch(1.56)
    .build(),
  shots: [
    { fromS: 0, shot: { kind: "fisheyeFollow" } },
    {
      fromS: FIFTY_POP_S - 0.12,
      shot: { kind: "lowSide", side: "left", distanceM: 2.3, leadM: 0.7, fovDeg: 44 },
    },
    { fromS: 1.95, blendS: 0.8, shot: { kind: "follow" } },
  ],
  slowMotion: [{ fromS: FIFTY_POP_S - 0.05, toS: 1.75, scale: 0.3 }],
  expect: { tricks: ["Kickflip → BS 50-50"] },
};

/**
 * 3 · 360 flip down El Toro (the 20-stair, 3.3 m). Rolling at 4.5 m/s on the quad, 9 m
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
  durationS: 4.3,
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

/** The LinkedIn cut: deck reveal → kickflip 50-50 → 360 flip down El Toro → end card. */
export const promoLinkedIn: PromoSequence = {
  id: "promo-linkedin",
  format: "4x5",
  items: [
    {
      kind: "clip",
      clip: promoDeckReveal,
      tricks: { show: false, caption: "" },
      // The hook: the first frame already has the title and the board (no fade-in).
      fadeInS: 0,
      fadeOutS: 0.2,
      overlays: [
        {
          kind: "wordmark",
          text: "TWO FEET",
          sub: "one board",
          fromS: 0,
          holdS: 3.4,
          fadeInS: 0,
          fadeOutS: 0.5,
        },
      ],
      stillsAtS: [0.6, 1.62, 1.72],
    },
    {
      kind: "clip",
      clip: promoKickflipFiftyFifty,
      tricks: { show: true, caption: "street course · flat bar" },
      fadeInS: 0.2,
      fadeOutS: 0.25,
      overlays: [{ kind: "kicker", text: "Each hand drives one foot.", fromS: 0, holdS: 1.6 }],
      stillsAtS: [1.5, 1.9],
    },
    {
      kind: "clip",
      clip: promoTreFlipElToro,
      tricks: { show: true, caption: "El Toro · 20 stairs" },
      fadeInS: 0.2,
      fadeOutS: 0.35,
      overlays: [{ kind: "kicker", text: "20 stairs. Real physics.", fromS: 0, holdS: 1.8 }],
      stillsAtS: [1.75, 2.15],
    },
    {
      kind: "card",
      id: "end-card",
      durationS: 3.4,
      fadeInS: 0.35,
      fadeOutS: 0,
      card: {
        title: "TWO FEET",
        tagline: "two feet. one board.",
        credit: "a game by v4rgas",
        url: "v4rgas.com",
        line: "physics-based · every trick is real input",
        penguin: true,
      },
      stillsAtS: [2],
    },
  ],
};
