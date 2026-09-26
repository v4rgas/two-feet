import type { StickValue, StickVelocity } from "./stick-value";

/**
 * Smooths a target stick position (digital keys: components in {-1, 0, 1}; gamepad:
 * analog) into an analog value with a spring-damper. One instance per foot.
 * Tuning lives in `INPUT_CONFIG.stick`.
 */
export interface VirtualStick {
  /** Current smoothed value, always within [-1, 1]². */
  readonly value: StickValue;
  /** Current velocity of the smoothed value, 1/s. */
  readonly velocityPerS: StickVelocity;
  /** Advances the spring-damper by one fixed step toward `target`. */
  update(target: StickValue, dtS: number): void;
  /** Snaps to neutral with zero velocity. */
  reset(): void;
}
