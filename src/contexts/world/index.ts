/** Public API of the `world` context. */
export type { ObstacleId, SurfaceType } from "../../shared";
export { SURFACE_TYPES } from "../../shared";
export { createFlatGroundLevel } from "./domain/flat-ground";
export type { Spawn } from "./domain/level";
export { Level } from "./domain/level";
export type { Obstacle, ObstacleShape } from "./domain/obstacle";
export type { WorldConfig } from "./world.config";
export { WORLD_CONFIG } from "./world.config";
