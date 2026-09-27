import { deepFreeze } from "../shared";

/** Tunables of the composition root (loop timing, reset flow, debug history). */
export const GAME_CONFIG = deepFreeze({
  loop: {
    /** Fixed physics step, s (REQUIREMENTS §1.4). */
    fixedStepS: 1 / 120,
    /** Max fixed steps per animation frame before dropping time. */
    maxStepsPerFrame: 8,
  },
  /**
   * The run resets `bailResetDelayS` after `RiderBailed` (STYLE.md: fade and reset after
   * 1.5 s) or once the ragdoll board comes to rest, whichever is later, and at the latest
   * `bailResetMaxS` after it (MECHANICS.md "Bail: the board goes ragdoll"), s.
   */
  bailResetDelayS: 1.5,
  bailResetMaxS: 3,
  /** "At rest" for the reset: board speed below this, m/s, and spin below this, rad/s. */
  bailRestSpeedMps: 0.15,
  bailRestSpinRadps: 0.5,
  maps: {
    /** The map the game opens on after the tutorial (GAME.md "First launch"). */
    defaultMapId: "street",
  },
  /** The game shell (GAME.md): storage keys and feedback timings. */
  shell: {
    /** localStorage: "true" once the tutorial is done or skipped. */
    tutorialDoneKey: "skate.tutorialDone",
    /** localStorage: the id of the last map played. */
    lastMapKey: "skate.lastMap",
    /** localStorage: "true" once the opening cinematic has played or been skipped. */
    introSeenKey: "twofeet.introSeen",
    /** What the checkpoint toast says. */
    checkpointToast: "checkpoint",
  },
  /** The first-launch tutorial (GAME.md "Tutorial"). */
  tutorial: {
    /** Step 1 (push) is done at this board speed, m/s. */
    pushDoneSpeedMps: 3,
    /** How long the "welcome to the Street Course" card stays before the course loads, s. */
    outroS: 2,
  },
  /** localStorage keys of settings that no longer exist, removed on boot. */
  obsoleteStorageKeys: ["skate.assistLevel"],
  debug: {
    /** How long impulse arrows stay in the debug overlay, s. */
    impulseLifetimeS: 0.2,
  },
});

export type GameConfig = typeof GAME_CONFIG;
