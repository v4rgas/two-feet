import { deepFreeze } from "../../shared";

/**
 * Tunables of the cinematic (montage) cameras and the video HUD. Kept apart from
 * `presentation.config.ts` so the montage tooling stays self-contained.
 */
export const CINEMATIC_CONFIG = deepFreeze({
  /** The subject every shot frames: the board, lightly smoothed. */
  subject: {
    /** Smooth time of the tracked board position, s (filters contact jitter). */
    positionSmoothTimeS: 0.08,
    /** Smooth time of the travel heading, s (slow: a shove or spin never swings shots). */
    headingSmoothTimeS: 0.6,
    /** Below this horizontal speed the heading is held, m/s. */
    headingMinSpeedMps: 0.8,
  },
  /** Defaults per shot type (each shot spec may override them). */
  shots: {
    lowSide: { distanceM: 2.4, heightM: 0.22, leadM: 0.5, lookHeightM: 0.2, fovDeg: 42 },
    fixedTripod: { lookHeightM: 0.15, fovStartDeg: 40, fovEndDeg: 30, zoomS: 4 },
    fisheyeFollow: {
      distanceM: 0.95,
      heightM: 0.32,
      sideM: 0.28,
      lookAheadM: 0.6,
      lookHeightM: 0.12,
      /** HORIZONTAL field of view, deg (the classic skate-video fisheye). */
      horizontalFovDeg: 95,
      /** Aspect floor of the fisheye's FOV: a portrait frame uses its width as its height. */
      minAspect: 1,
    },
    slowOrbit: { radiusM: 2.6, heightM: 0.7, rateRadps: 0.35, lookHeightM: 0.15, fovDeg: 45 },
    /** The promo's deck close-up: a long lens from ≈ 2 m, low, pushing in. */
    deckShowcase: {
      rateRadps: 0.22,
      radiusStartM: 2.4,
      radiusEndM: 1.6,
      heightStartM: 0.16,
      heightEndM: 0.4,
      frameStartM: 1.5,
      frameEndM: 1.05,
      pushS: 4,
      lookHeightM: 0.1,
    },
  },
  /** Video HUD (lower-thirds, STYLE.md trick popup restyled for a video). */
  lowerThird: {
    fadeInS: 0.18,
    holdS: 1.6,
    fadeOutS: 0.5,
    /** Title card of a clip (its line), shown at the clip start. */
    titleHoldS: 2.2,
  },
});

export type CinematicConfig = typeof CINEMATIC_CONFIG;
