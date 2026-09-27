import type { ObstacleId, Vec3 } from "../../../shared";
import type { GraffitiPlacement } from "./graffiti";
import { createGraffiti } from "./graffiti";
import type { Obstacle } from "./obstacle";
import { ObstacleShape } from "./obstacle";

/** Where the board starts (value object). */
export interface Spawn {
  /** Ground point under the board's centre, m (world). The board adds its own rest height. */
  readonly positionM: Vec3;
  /** Rotation around world +Y; 0 = nose toward world +X, rad. */
  readonly headingRad: number;
}

/** A level: obstacles + spawn (aggregate root; guards unique obstacle ids). */
export interface Level {
  readonly id: string;
  readonly name: string;
  readonly obstacles: readonly Obstacle[];
  readonly spawn: Spawn;
  /** Decorative graffiti decals (visual only, never colliders). `Level.create` defaults it to []. */
  readonly graffiti?: readonly GraffitiPlacement[];
}

/**
 * Creates a level. Throws if obstacle ids are not unique, a shape's parameters are
 * invalid, or the heading is not finite.
 */
function create(input: Level): Level {
  const seen = new Set<ObstacleId>();
  for (const obstacle of input.obstacles) {
    if (seen.has(obstacle.id))
      throw new Error(`Level "${input.id}": duplicate obstacle id "${obstacle.id}"`);
    seen.add(obstacle.id);
    try {
      ObstacleShape.validate(obstacle.shape);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new RangeError(`Level "${input.id}": obstacle "${obstacle.id}": ${reason}`);
    }
  }
  if (!Number.isFinite(input.spawn.headingRad)) {
    throw new RangeError(`Level "${input.id}": spawn heading must be finite`);
  }
  const graffiti = (input.graffiti ?? []).map((g) => {
    try {
      return createGraffiti(g);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new RangeError(`Level "${input.id}": ${reason}`);
    }
  });
  return Object.freeze({
    id: input.id,
    name: input.name,
    obstacles: Object.freeze([...input.obstacles]),
    spawn: Object.freeze({ ...input.spawn }),
    graffiti: Object.freeze(graffiti),
  });
}

/** Namespace for the Level aggregate factory. */
export const Level = Object.freeze({ create });
