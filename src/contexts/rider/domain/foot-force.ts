import type { FootId, Vec3 } from "../../../shared";

/** What a foot force is for — drives debug-overlay labels and the `BoardPopped` event. */
export type FootForceLabel =
  /** Standing weight (and carving lean) pushing the deck down. */
  | "press"
  /** Push-off impulse along the rider's heading. */
  | "push"
  /** Tail press controller holding the manual pitch. */
  | "manual"
  /** The pop: vertical impulse through the centre of mass, or the tail-snap pitch impulse. */
  | "pop"
  /** Level controller (ollie) and its height bonus. */
  | "level"
  /** Flip roll impulse (kickflip). */
  | "flick"
  /** Shove-it yaw impulse. */
  | "shove"
  /** Catch controller: kills spin, levels, snaps yaw. */
  | "catch"
  /** Landing assist: damps bounce and rocking. */
  | "land";

/**
 * A force, impulse, torque or angular impulse the rider applies to the board (value
 * object). Discriminated on `kind` so the unit is explicit in the field name. Forces and
 * torques act during the next physics step; impulses act at once.
 */
export type FootForce =
  | {
      readonly kind: "force";
      readonly foot: FootId;
      readonly label: FootForceLabel;
      /** Force, N (world). */
      readonly forceN: Vec3;
      readonly pointWorldM: Vec3;
    }
  | {
      readonly kind: "impulse";
      readonly foot: FootId;
      readonly label: FootForceLabel;
      /** Impulse, N·s (world). */
      readonly impulseNs: Vec3;
      readonly pointWorldM: Vec3;
    }
  | {
      readonly kind: "torque";
      readonly foot: FootId;
      readonly label: FootForceLabel;
      /** Torque, N·m (world). */
      readonly torqueNm: Vec3;
    }
  | {
      readonly kind: "angularImpulse";
      readonly foot: FootId;
      readonly label: FootForceLabel;
      /** Angular impulse, N·m·s (world). */
      readonly impulseNms: Vec3;
    };
