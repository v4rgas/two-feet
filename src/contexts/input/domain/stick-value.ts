import type { Vec2 } from "../../../shared";

/**
 * Analog stick position in [-1, 1]² (value object), expressed in BOARD axes:
 * - `x`: +1 = toward the board's +Z side (screen right with the follow camera), -1 = -Z.
 * - `y`: +1 = toward the nose (+X), -1 = toward the tail.
 * Toe/heel meaning of `x` depends on stance and is resolved by `rider`.
 */
export interface StickValue {
  readonly x: number;
  readonly y: number;
}

function inRange(v: number): boolean {
  return Number.isFinite(v) && v >= -1 && v <= 1;
}

/** Creates a stick value. Throws `RangeError` if a component is outside [-1, 1]. */
function create(x: number, y: number): StickValue {
  if (!inRange(x) || !inRange(y)) {
    throw new RangeError(`StickValue components must be in [-1, 1], got (${x}, ${y})`);
  }
  return Object.freeze({ x, y });
}

/** Creates a stick value, clamping each component into [-1, 1] (NaN → 0). */
function clamped(x: number, y: number): StickValue {
  const c = (v: number): number => (Number.isNaN(v) ? 0 : Math.max(-1, Math.min(1, v)));
  return create(c(x), c(y));
}

const NEUTRAL: StickValue = create(0, 0);

/** True if both components are within `deadzone` of 0. */
function isNeutral(v: StickValue, deadzone: number): boolean {
  return Math.abs(v.x) <= deadzone && Math.abs(v.y) <= deadzone;
}

/** Namespace for the StickValue value object. */
export const StickValue = Object.freeze({ create, clamped, NEUTRAL, isNeutral });

/** Rate of change of a stick, per second (not clamped). Used for flick detection. */
export type StickVelocity = Vec2;
