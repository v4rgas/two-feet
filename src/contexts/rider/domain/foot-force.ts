import type { FootId, Vec3 } from "../../../shared";

/** What a foot force is for — drives debug-overlay labels and the `BoardPopped` event. */
export type FootForceLabel =
  /** Standing weight / pressure pushing the deck down. */
  | "press"
  /** Grip-tape friction dragging the deck (ollie slide). */
  | "friction"
  /** Tail (or nose) pop impulse. */
  | "pop"
  /** Edge flick impulse (kickflip / heelflip). */
  | "flick"
  /** Tangential sweep at the tail (shuvit). */
  | "sweep"
  /** Push-off impulse along the board direction. */
  | "push"
  /** Spin damping when feet catch the board. */
  | "catch";

/**
 * A force or impulse a foot applies to the board at a world point (value object).
 * Discriminated on `kind` so the unit is explicit in the field name.
 */
export type FootForce =
  | {
      readonly kind: "force";
      readonly foot: FootId;
      readonly label: FootForceLabel;
      /** Force, N (world). Acts during the next physics step. */
      readonly forceN: Vec3;
      readonly pointWorldM: Vec3;
    }
  | {
      readonly kind: "impulse";
      readonly foot: FootId;
      readonly label: FootForceLabel;
      /** Impulse, N·s (world). Instant velocity change. */
      readonly impulseNs: Vec3;
      readonly pointWorldM: Vec3;
    };
