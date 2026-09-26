import type { ObstacleId, Vec3 } from "../../../shared";
import type { Obstacle } from "./obstacle";

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
}

/** Creates a level. Throws if obstacle ids are not unique or the heading is not finite. */
function create(input: Level): Level {
  const seen = new Set<ObstacleId>();
  for (const obstacle of input.obstacles) {
    if (seen.has(obstacle.id))
      throw new Error(`Level "${input.id}": duplicate obstacle id "${obstacle.id}"`);
    seen.add(obstacle.id);
  }
  if (!Number.isFinite(input.spawn.headingRad)) {
    throw new RangeError(`Level "${input.id}": spawn heading must be finite`);
  }
  return Object.freeze({
    id: input.id,
    name: input.name,
    obstacles: Object.freeze([...input.obstacles]),
    spawn: Object.freeze({ ...input.spawn }),
  });
}

/** Namespace for the Level aggregate factory. */
export const Level = Object.freeze({ create });
