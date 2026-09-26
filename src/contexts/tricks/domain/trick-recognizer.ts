import type { DomainEvent, Quat, Stance, TrickBailed, TrickLanded, Vec3 } from "../../../shared";
import type { AirSession } from "./air-session";

/**
 * Board motion the recognizer consumes (satisfied structurally by board's
 * `BoardSnapshot`; the tricks domain may not import the board context).
 */
export interface MotionSample {
  readonly tick: number;
  readonly timeS: number;
  readonly transform: { readonly rotation: Quat };
  readonly angularVelocityRadps: Vec3;
  readonly grounded: boolean;
}

/** Events the recognizer produces. */
export type TrickOutcome = TrickLanded | TrickBailed;

/**
 * Domain service (REQUIREMENTS §1.5). Pure logic: it NEVER moves the board.
 * - `observe` every fixed step with the fresh snapshot (loop step 6).
 * - `onEvent` for every domain event (delivered at bus flush). On `BoardLeftGround` it
 *   opens an `AirSession`; on `BoardLanded` it classifies against the `TrickDefinition`
 *   table and returns a `TrickLanded` or `TrickBailed`. It also tracks `BoardPopped`,
 *   `FootDetached` / `FootAttached`, `RiderBailed`.
 * The application layer publishes whatever `onEvent` returns.
 */
export interface TrickRecognizer {
  observe(sample: MotionSample): void;
  onEvent(event: DomainEvent): readonly TrickOutcome[];
  /** Stance used to normalise rotation signs (kick vs heel, backside vs frontside). */
  setStance(stance: Stance): void;
  /** Current air session, or null while grounded. */
  readonly air: AirSession | null;
  reset(): void;
}
