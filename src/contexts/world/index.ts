/** Public API of the `world` context. */
export type { ObstacleId, SurfaceType } from "../../shared";
export { SURFACE_TYPES } from "../../shared";
export { createFlatGroundLevel } from "./domain/flat-ground";
export type { Spawn } from "./domain/level";
export { Level } from "./domain/level";
export type {
  BankShape,
  BoxShape,
  HandrailParams,
  HubbaParams,
  KickerShape,
  LedgeShape,
  Obstacle,
  ObstacleShapeKind,
  QuarterPipeShape,
  RailShape,
  StairsShape,
} from "./domain/obstacle";
export { ObstacleShape } from "./domain/obstacle";
export type {
  ConvexPiece,
  FaceTone,
  GeometryFace,
  ObstacleColliderDesc,
  ObstacleColliderPart,
  ObstacleColliderShape,
  ObstacleGeometry,
} from "./domain/obstacle-geometry";
export {
  kickerLipAngleRad,
  kickerRadiusM,
  obstacleCollider,
  obstacleGeometry,
  quarterPipeCopingProfile,
  quarterPipeLipAngleRad,
  quarterPipeLipXM,
  shapeGeometry,
  stairsFootXM,
  stairsHeightM,
  stairsSlopeRad,
} from "./domain/obstacle-geometry";
export { createSkateparkLevel } from "./domain/skatepark";
export type { WorldConfig } from "./world.config";
export { WORLD_CONFIG } from "./world.config";
