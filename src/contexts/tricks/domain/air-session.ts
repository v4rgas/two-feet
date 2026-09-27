import type { FootId, Kick, Quat, RotationTotals } from "../../../shared";

export type { RotationTotals } from "../../../shared";

/**
 * Accumulates the board's rotation around its LOCAL axes between takeoff and landing.
 * Feed it successive board orientations; it integrates the per-step local delta
 * (q_prev⁻¹ · q_curr → rotation vector) so multi-turn flips are counted, not wrapped.
 * Implemented by `LocalRotationAccumulator`.
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
  /** The kick that popped, or null (rolled off an edge). */
  readonly kick: Kick | null;
  /**
   * RIDER-NORMALISED totals so far (ADR 0007): `rollRad` = flip (+ = kickflip), `yawRad` =
   * board heading change (+ = backside shove), `pitchRad` = local pitch (ADR 0002 sign).
   */
  readonly rotation: RotationTotals;
  /** Rider heading change (body spin) so far, rad (+ = backside). */
  readonly bodyRad: number;
  /** Feet that are currently detached. */
  readonly detachedFeet: readonly FootId[];
}
