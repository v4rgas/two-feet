/**
 * Shared vocabulary: tiny literal types that appear in domain event payloads and are
 * therefore needed by several contexts. Each is owned conceptually by one context,
 * which re-exports it from its public API (see REQUIREMENTS §2.2 and ADR 0001).
 */

/** Which foot, by role (not by key cluster). Owned by `input`. */
export type FootId = "front" | "back";

/** All foot ids, in a stable order. */
export const FOOT_IDS: readonly FootId[] = Object.freeze(["front", "back"]);

/** Regular = WASD drives the front foot; goofy = arrows drive the front foot. Owned by `input`. */
export type Stance = "regular" | "goofy";

/** Physical surface category of a collider. Owned by `world`. M1 ships only `ground`. */
export type SurfaceType = "ground" | "ramp" | "grindable" | "ledge";

/** All surface types, in a stable order. */
export const SURFACE_TYPES: readonly SurfaceType[] = Object.freeze([
  "ground",
  "ramp",
  "grindable",
  "ledge",
]);

/**
 * A physical part of the board that can touch the world. Owned by `board`.
 * Wheel sides are in the board frame: "left" = -Z side, "right" = +Z side
 * (looking from the tail toward the nose, +X, with +Y up). See ADR 0002.
 */
export type BoardPartId =
  | "deck"
  | "nose"
  | "tail"
  | "noseTruck"
  | "tailTruck"
  | "noseLeftWheel"
  | "noseRightWheel"
  | "tailLeftWheel"
  | "tailRightWheel";

/** Wheel parts only. */
export type WheelId = Extract<
  BoardPartId,
  "noseLeftWheel" | "noseRightWheel" | "tailLeftWheel" | "tailRightWheel"
>;

export const WHEEL_IDS: readonly WheelId[] = Object.freeze([
  "noseLeftWheel",
  "noseRightWheel",
  "tailLeftWheel",
  "tailRightWheel",
]);

/** Stable identifier of a world obstacle / static collider. */
export type ObstacleId = string;
