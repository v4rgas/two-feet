import type { ObstacleId, SurfaceType, Transform, Vec3 } from "../../../shared";

/** Obstacle geometry in the obstacle's local frame. */
export type ObstacleShape =
  | { readonly kind: "box"; readonly halfExtentsM: Vec3 }
  | { readonly kind: "convexHull"; readonly pointsM: readonly Vec3[] };

/**
 * A piece of the level (entity, identity = `id`). Structurally a board
 * `StaticColliderDesc`, so the game hands obstacles to the physics world as-is.
 */
export interface Obstacle {
  readonly id: ObstacleId;
  readonly name: string;
  readonly surface: SurfaceType;
  /** Pose of the obstacle's local frame, world. */
  readonly transform: Transform;
  readonly shape: ObstacleShape;
}
