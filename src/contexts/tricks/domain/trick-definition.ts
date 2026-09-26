/** Closed interval of angles, rad (value object). */
export interface AngleRange {
  readonly minRad: number;
  readonly maxRad: number;
}

/** Creates a range. Throws `RangeError` if min > max or a bound is not finite. */
function range(minRad: number, maxRad: number): AngleRange {
  if (!Number.isFinite(minRad) || !Number.isFinite(maxRad) || minRad > maxRad) {
    throw new RangeError(`AngleRange needs finite min <= max, got [${minRad}, ${maxRad}]`);
  }
  return Object.freeze({ minRad, maxRad });
}

/** Range centred on `centerRad` with ± `toleranceRad`. */
function around(centerRad: number, toleranceRad: number): AngleRange {
  return range(centerRad - toleranceRad, centerRad + toleranceRad);
}

function contains(r: AngleRange, valueRad: number): boolean {
  return valueRad >= r.minRad && valueRad <= r.maxRad;
}

/** Namespace for the AngleRange value object. */
export const AngleRange = Object.freeze({ range, around, contains });

/**
 * A trick, defined purely as data (REQUIREMENTS §1.5): ranges on the rotation the board
 * accumulated in the air plus a few conditions. Adding a trick = adding an entry to
 * `TRICKS_CONFIG.definitions`; no new logic.
 *
 * Rotations are STANCE-NORMALISED (see tricks README): positive roll = kickflip
 * direction, positive yaw = backside shuvit direction, for the rider's current stance.
 */
export interface TrickDefinition {
  /** Stable id, e.g. "kickflip". */
  readonly id: string;
  /** Display name, e.g. "Kickflip". */
  readonly name: string;
  readonly rollRad: AngleRange;
  readonly yawRad: AngleRange;
  /** Optional pitch constraint (omit = any pitch). */
  readonly pitchRad?: AngleRange;
  /** Must the air session have started with a `BoardPopped`? */
  readonly requiresPop: boolean;
  readonly minAirtimeS: number;
  /** When several definitions match, the highest priority wins. */
  readonly priority: number;
}
