import type { FootId } from "../../../shared";
import type { StickValue, StickVelocity } from "./stick-value";

/** What one foot wants this step (value object). Output of the `input` context. */
export interface FootIntent {
  readonly foot: FootId;
  /** Smoothed stick position (board axes, see `StickValue`). */
  readonly stick: StickValue;
  /** Smoothed stick velocity, 1/s — a fast sideways flick has a large |x|. */
  readonly stickVelocityPerS: StickVelocity;
}

/** Both feet's intents plus non-foot actions for one fixed step. */
export interface IntentFrame {
  readonly front: FootIntent;
  readonly back: FootIntent;
  /** Push button held this step (Space, for now). */
  readonly push: boolean;
}
