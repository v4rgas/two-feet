import type { FootId, Stance } from "../../../shared";
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
  /** "Both feet down" (Space) held this step: push on the ground, catch in the air (rider). */
  readonly feetDown: boolean;
  /** Which foot is in front; decides which board edge is the toe edge (ADR 0002). */
  readonly stance: Stance;
}
