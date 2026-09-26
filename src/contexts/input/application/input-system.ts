import type { Stance } from "../../../shared";
import type { IntentFrame } from "../domain/foot-intent";

/**
 * Per-tick orchestration of the `input` context (loop step 1): samples the
 * `InputSource`, maps clusters to feet by stance, advances the `VirtualStick`s.
 */
export interface InputSystem {
  /** Samples devices and returns this step's intents. */
  step(dtS: number): IntentFrame;
  /** Intents returned by the last `step` (neutral before the first). */
  readonly lastIntents: IntentFrame;
  readonly stance: Stance;
  /** Changes stance (and persists it through the `StanceRepository`). */
  setStance(stance: Stance): void;
  /** Resets sticks to neutral. */
  reset(): void;
}
