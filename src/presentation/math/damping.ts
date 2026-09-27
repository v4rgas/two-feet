import { wrapPi } from "../../shared";

/**
 * Frame-rate independent smoothing used by the follow camera. Pure functions on numbers
 * and caller-owned state, no allocation.
 */

/** State of one critically damped scalar spring. */
export interface SpringState {
  value: number;
  velocity: number;
}

export function createSpring(value = 0): SpringState {
  return { value, velocity: 0 };
}

/**
 * Advances a critically damped spring toward `target` (never overshoots for a constant
 * target). `smoothTimeS` ≈ time to cover most of the distance. Stable for any `dtS`
 * (closed-form approximation from Game Programming Gems 4, "Critically Damped Ease-In/Out").
 */
export function stepCriticallyDamped(
  state: SpringState,
  target: number,
  smoothTimeS: number,
  dtS: number,
): void {
  if (dtS <= 0) return;
  const omega = 2 / Math.max(smoothTimeS, 1e-4);
  const x = omega * dtS;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = state.value - target;
  const temp = (state.velocity + omega * change) * dtS;
  state.velocity = (state.velocity - omega * temp) * decay;
  let next = target + (change + temp) * decay;
  // Guard against overshoot caused by the polynomial approximation.
  if (change > 0 === next - target < 0 && change !== 0) {
    next = target;
    state.velocity = 0;
  }
  state.value = next;
}

/**
 * Like `stepCriticallyDamped`, for an angle in rad: moves along the shortest arc so a
 * heading crossing ±π does not spin the long way round. The value is kept in (-π, π].
 */
export function stepCriticallyDampedAngle(
  state: SpringState,
  targetRad: number,
  smoothTimeS: number,
  dtS: number,
): void {
  const delta = wrapPi(targetRad - state.value);
  stepCriticallyDamped(state, state.value + delta, smoothTimeS, dtS);
  state.value = wrapPi(state.value);
}

/** Exponential ease of `current` toward `target` with time constant `tauS`. */
export function easeExponential(
  current: number,
  target: number,
  tauS: number,
  dtS: number,
): number {
  if (tauS <= 0) return target;
  return current + (target - current) * (1 - Math.exp(-dtS / tauS));
}
