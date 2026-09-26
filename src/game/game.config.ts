import { deepFreeze } from "../shared";

/** Tunables of the composition root (loop timing, reset flow, debug history). */
export const GAME_CONFIG = deepFreeze({
  loop: {
    /** Fixed physics step, s (REQUIREMENTS §1.4). */
    fixedStepS: 1 / 120,
    /** Max fixed steps per animation frame before dropping time. */
    maxStepsPerFrame: 8,
  },
  /** Delay between `RiderBailed` and the run reset, s (STYLE.md: fade and reset after 1.5 s). */
  bailResetDelayS: 1.5,
  debug: {
    /** How long impulse arrows stay in the debug overlay, s. */
    impulseLifetimeS: 0.2,
  },
});

export type GameConfig = typeof GAME_CONFIG;
