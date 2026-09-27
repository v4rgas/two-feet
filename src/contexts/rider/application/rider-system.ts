import type { BoardSnapshot } from "../../board";
import type { IntentFrame } from "../../input";
import type { FootForce } from "../domain/foot-force";
import type { RiderState } from "../domain/rider-state";
import type { AssistLevel } from "../rider.config";

/**
 * Per-tick orchestration of the `rider` context. Holds the `Rider` aggregate, the
 * `FootForceModel` and the board's `RigidBodyHandle` (injected by the game).
 */
export interface RiderSystem {
  /**
   * Loop step 2: turn intents into `FootForce`s and apply them through the physics port.
   * `board` is the latest snapshot (from the previous step). Publishes `BoardPopped`.
   */
  applyIntents(intents: IntentFrame, board: BoardSnapshot, dtS: number): void;
  /**
   * Loop step 5: update attach/detach from the fresh snapshot and detect bails.
   * Publishes `FootAttached`, `FootDetached`, `RiderBailed`.
   */
  postPhysics(board: BoardSnapshot, dtS: number): void;
  readonly state: RiderState;
  /** Forces applied in the last `applyIntents` (debug overlay). */
  readonly lastForces: readonly FootForce[];
  /**
   * The active assist level (MECHANICS.md "Assists"): read every step, so a change applies
   * at once. The game never announces that an assist fired.
   */
  assistLevel: AssistLevel;
  /** Feet back to rest positions, attached, not bailed. */
  reset(board: BoardSnapshot): void;
}
