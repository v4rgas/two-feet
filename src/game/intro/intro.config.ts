import { deepFreeze } from "../../shared";

/** Tunables of the opening cinematic (GAME.md "Intro", STYLE.md "Wordmark"). */
export const INTRO_CONFIG = deepFreeze({
  /** The title card over the landing and the roll-away. */
  titleCard: {
    /** The wordmark, big. */
    title: "TWO FEET",
    /** The pun on the controls: one key cluster per foot. */
    tagline: "two feet. one board.",
    /** The credit line beside the pixel penguin. */
    credit: "a game by v4rgas",
    /** The pixel penguin (under `public/`, relative to the base URL). */
    iconPath: "sponsors/v4rgas/penguin.png",
    /** It fades in this long after the landing (video s), over `fadeInS`. */
    delayS: 0.35,
    fadeInS: 0.7,
  },
  /** The landing's lower-third caption (the pun on the distance: 2 ft = 0.61 m). */
  trickCaption: "0.61 m drop",
  /** The quiet hint in the corner for the whole intro. */
  skipHint: "any key to skip",
  /** Fade from black at the start and to black at the end, s of video. */
  fadeInS: 0.35,
  fadeOutS: 0.6,
  /** Longest wall-clock frame fed to the intro (a stalled tab never jumps the clip), s. */
  maxFrameS: 0.1,
  /** How long to wait for the web fonts before playing anyway, ms. */
  fontTimeoutMs: 2500,
});

export type IntroConfig = typeof INTRO_CONFIG;
