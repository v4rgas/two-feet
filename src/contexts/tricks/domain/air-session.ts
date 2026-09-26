import type { FootId, Quat, RotationTotals } from "../../../shared";

export type { RotationTotals } from "../../../shared";

/**
 * Accumulates the board's rotation around its LOCAL axes between takeoff and landing.
 * Feed it successive board orientations; it integrates the per-step local delta
 * (q_prev⁻¹ · q_curr → rotation vector) so multi-turn flips are counted, not wrapped.
 */
export interface RotationAccumulator {
  /** Starts a new accumulation at `rotation` (totals back to zero). */
  reset(rotation: Quat): void;
  /** Adds the local rotation from the previous orientation to `rotation`. */
  add(rotation: Quat): void;
  /** Raw totals in the board frame (not stance-normalised). */
  readonly totals: RotationTotals;
}

/** State of one takeoff → landing air session (read model, immutable). */
export interface AirSession {
  readonly startedTick: number;
  readonly startedAtS: number;
  readonly airtimeS: number;
  /** A `BoardPopped` happened shortly before / at takeoff. */
  readonly popped: boolean;
  /** Board-frame totals accumulated so far. */
  readonly rotation: RotationTotals;
  /** Feet that are currently detached. */
  readonly detachedFeet: readonly FootId[];
}
