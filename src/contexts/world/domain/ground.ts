import { Quat, Transform, Vec3 } from "../../../shared";
import type { Obstacle } from "./obstacle";

/** Size of a ground slab (`groundObstacle`). */
export interface GroundParams {
  /** Half the side of the square slab, m. */
  readonly halfSizeM: number;
  /** Thickness of the slab (keeps the collider robust), m. */
  readonly thicknessM: number;
}

/**
 * The ground every map stands on: one large `ground` box whose top face is the plane
 * y = 0 (id `ground`). Maps add it to their obstacles.
 */
export function groundObstacle(params: GroundParams): Obstacle {
  const halfThickness = params.thicknessM / 2;
  return {
    id: "ground",
    name: "Ground",
    surface: "ground",
    transform: Transform.create(Vec3.create(0, -halfThickness, 0), Quat.IDENTITY),
    shape: {
      kind: "box",
      halfExtentsM: Vec3.create(params.halfSizeM, halfThickness, params.halfSizeM),
    },
  };
}
