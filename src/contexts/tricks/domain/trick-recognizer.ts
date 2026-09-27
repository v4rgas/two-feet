import type {
  DomainEvent,
  GrindEnded,
  GrindStarted,
  Quat,
  Stance,
  TrickBailed,
  TrickLanded,
  Vec3,
} from "../../../shared";
import type { AirSession } from "./air-session";
import type { RiderPose } from "./rider-frame";

/**
 * Board motion the recognizer consumes (satisfied structurally by board's
 * `BoardSnapshot`; the tricks domain may not import the board context).
 */
export interface MotionSample {
  readonly tick: number;
  readonly timeS: number;
  readonly transform: { readonly rotation: Quat };
  /** World velocity, m/s: fakie = rolling backwards relative to the rider heading. */
  readonly linearVelocityMps: Vec3;
  /** Wheels touching: a clean landing needs `landing.minWheels`. */
  readonly wheelsDown: number;
  readonly grounded: boolean;
}

/** Events the recognizer produces. */
export type TrickOutcome = TrickLanded | TrickBailed | GrindStarted | GrindEnded;

/**
 * Domain service (REQUIREMENTS §1.5). Pure logic: it NEVER moves the board.
 * - `observe` every fixed step with the fresh snapshot and rider pose (loop step 6). It
 *   accumulates the air rotation and settles a pending landing (the catch and the wheels
 *   may come a few steps after touchdown), so it may return outcomes too.
 * - `onEvent` for every domain event (delivered at bus flush). `BoardPopped` arms the
 *   pop, `BoardLeftGround` opens an `AirSession`, `BoardLanded` classifies it against the
 *   trick table, `FootAttached` / `FootDetached` track the catch, `RiderBailed` fails
 *   whatever is in progress.
 * The application layer publishes whatever these return.
 */
export interface TrickRecognizer {
  observe(sample: MotionSample, rider: RiderPose): readonly TrickOutcome[];
  onEvent(event: DomainEvent): readonly TrickOutcome[];
  /** The stance set in input (regular / goofy); normalises kick vs heel, BS vs FS. */
  setStance(stance: Stance): void;
  /** Current air session, or null while grounded. */
  readonly air: AirSession | null;
  reset(): void;
}
