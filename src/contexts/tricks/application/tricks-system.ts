import type { BoardSnapshot } from "../../board";
import type { AirSession } from "../domain/air-session";

/**
 * Per-tick orchestration of the `tricks` context. Wraps the `TrickRecognizer`,
 * subscribes it to the `EventBus` on construction and publishes its outcomes.
 */
export interface TricksSystem {
  /** Loop step 6: feed the fresh snapshot. (Events arrive via the bus at step 7.) */
  update(snapshot: BoardSnapshot): void;
  /** Current air session for HUD / debug, or null while grounded. */
  readonly air: AirSession | null;
  reset(): void;
}
