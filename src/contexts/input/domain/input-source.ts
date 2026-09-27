import type { Stance } from "../../../shared";
import type { StickValue } from "./stick-value";

/**
 * The two physical control clusters. `left` = WASD (or the left gamepad stick),
 * `right` = arrow keys (or the right gamepad stick). Stance maps clusters to feet.
 */
export type ControlCluster = "left" | "right";

/**
 * Raw device state for one sample, already in stick terms (value object).
 * Keyboard: each component is -1, 0 or 1 from the key cluster. Gamepad (later): analog.
 * Directions are screen/board axes: up = +y (toward nose), right = +x (toward +Z).
 */
export interface RawInputSample {
  readonly left: StickValue;
  readonly right: StickValue;
  readonly feetDown: boolean;
  /** Body spin keys: −1 left (Q), +1 right (E), 0 none (the most recent of both wins). */
  readonly spin: -1 | 0 | 1;
}

/**
 * INPUT PORT: the device layer. Implemented in `input/infrastructure` (keyboard now,
 * gamepad later). Sampled once at the start of every fixed step.
 */
export interface InputSource {
  sample(): RawInputSample;
}

/** Persistence port for the stance setting (localStorage in infrastructure). */
export interface StanceRepository {
  load(): Stance | null;
  save(stance: Stance): void;
}
