import type { Transform, Vec3, WheelId } from "../../../shared";
import type { BoardContact } from "./physics-world";

/** Which parts of the board touch the world (value object). */
export interface ContactState {
  readonly wheels: Readonly<Record<WheelId, boolean>>;
  readonly tail: boolean;
  readonly nose: boolean;
  /** Any other deck contact (flat section, e.g. landing primo / upside down). */
  readonly deck: boolean;
  /** Either truck (grinds later). */
  readonly trucks: boolean;
}

/**
 * Immutable picture of the board after a physics step (value object). Produced by the
 * `board` context in loop step 4; consumed by rider, tricks and presentation.
 */
export interface BoardSnapshot {
  /** Fixed-step index this snapshot belongs to. */
  readonly tick: number;
  /** Simulation time, s. */
  readonly timeS: number;
  /** Board frame pose (see `BoardSpec`). */
  readonly transform: Transform;
  /** Velocity of the board-frame origin, m/s (world). */
  readonly linearVelocityMps: Vec3;
  /** Angular velocity, rad/s (world). */
  readonly angularVelocityRadps: Vec3;
  readonly contacts: ContactState;
  /** Number of wheels touching. */
  readonly wheelsDown: number;
  /** True when `wheelsDown >= BOARD_CONFIG.contact.groundedMinWheels`. */
  readonly grounded: boolean;
  /** Time since the board last left the ground, s (0 while grounded). */
  readonly airtimeS: number;
  /** Raw contact list (debug overlay, grind detection later). */
  readonly contactPoints: readonly BoardContact[];
}

const NO_WHEELS: Readonly<Record<WheelId, boolean>> = Object.freeze({
  noseLeftWheel: false,
  noseRightWheel: false,
  tailLeftWheel: false,
  tailRightWheel: false,
});

/** Contact state with nothing touching. */
export const NO_CONTACT: ContactState = Object.freeze({
  wheels: NO_WHEELS,
  tail: false,
  nose: false,
  deck: false,
  trucks: false,
});
