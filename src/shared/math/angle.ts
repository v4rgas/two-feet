/** Angle helpers. All angles are radians unless the name says otherwise. */

/** Full turn in radians (2π). */
export const TAU = Math.PI * 2;

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Wraps an angle into the half-open interval (-π, π]. */
export function wrapPi(rad: number): number {
  const wrapped = rad - TAU * Math.floor((rad + Math.PI) / TAU);
  // floor maps +π to -π; keep +π so the interval is (-π, π].
  return wrapped === -Math.PI ? Math.PI : wrapped;
}

/** Signed shortest angular difference `to - from`, in (-π, π]. */
export function shortestDelta(fromRad: number, toRad: number): number {
  return wrapPi(toRad - fromRad);
}

/** Number of (possibly fractional) full turns in `rad`, e.g. 2π → 1. */
export function turns(rad: number): number {
  return rad / TAU;
}
