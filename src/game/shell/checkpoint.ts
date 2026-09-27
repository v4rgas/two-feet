import type { BoardSnapshot } from "../../contexts/board";
import type { RiderState } from "../../contexts/rider";
import type { RespawnPose } from "../loop";

/**
 * A checkpoint (GAME.md "Controls outside tricks", `C`): the board's pose, heading and
 * velocity when it was set. `R` and the bail reset put the board back exactly there.
 */
export interface Checkpoint extends RespawnPose {
  readonly linearVelocityMps: BoardSnapshot["linearVelocityMps"];
  readonly angularVelocityRadps: BoardSnapshot["angularVelocityRadps"];
}

/** Why `C` did nothing (or null when it may set one). */
export type CheckpointRefusal = "airborne" | "notOnFourWheels" | "bailed" | "grinding";

/**
 * The checkpoint rule: only rolling (or standing) on all four wheels, not bailed and not
 * locked on a grind.
 */
export function checkpointRefusal(
  board: BoardSnapshot,
  rider: Pick<RiderState, "bailed" | "grind">,
): CheckpointRefusal | null {
  if (rider.bailed) return "bailed";
  if (!board.grounded) return "airborne";
  if (rider.grind !== null) return "grinding";
  if (board.wheelsDown < 4) return "notOnFourWheels";
  return null;
}

/** The checkpoint `C` sets now, or null when the rule refuses it. */
export function checkpointFrom(
  board: BoardSnapshot,
  rider: Pick<RiderState, "bailed" | "grind">,
): Checkpoint | null {
  if (checkpointRefusal(board, rider) !== null) return null;
  return {
    transform: board.transform,
    linearVelocityMps: board.linearVelocityMps,
    angularVelocityRadps: board.angularVelocityRadps,
  };
}
