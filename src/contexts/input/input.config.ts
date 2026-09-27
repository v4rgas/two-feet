import type { Stance } from "../../shared";
import { deepFreeze } from "../../shared";

/** Every tunable constant of the `input` context (REQUIREMENTS §2.5). */
export const INPUT_CONFIG = deepFreeze({
  /** `KeyboardEvent.code` values per control cluster. */
  keys: {
    left: { up: "KeyW", down: "KeyS", left: "KeyA", right: "KeyD" },
    right: { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" },
    /** "Both feet down": push on the ground, catch in the air (the rider decides). */
    feetDown: "Space",
    /** Body spin (both stances): left = counter-clockwise seen from above, right = clockwise. */
    spin: { left: "KeyQ", right: "KeyE" },
  },
  /** Spring-damper that turns digital keys into an analog stick (per axis). */
  stick: {
    /** Natural angular frequency toward a held target, rad/s (higher = snappier). */
    pressOmegaRadps: 28,
    /** Natural angular frequency back to neutral on release, rad/s. */
    releaseOmegaRadps: 22,
    /** Damping ratio (1 = critically damped, <1 overshoots). */
    dampingRatio: 0.9,
    /** Values within this distance from 0 count as neutral. */
    deadzone: 0.05,
  },
  stance: {
    defaultStance: "regular" as Stance,
    /** localStorage key used by the stance repository. */
    storageKey: "skate.stance",
  },
});

/** Type of the input config (deeply readonly). */
export type InputConfig = typeof INPUT_CONFIG;
