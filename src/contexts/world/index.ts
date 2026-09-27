/** Public API of the `world` context. */
export type { ObstacleId, SurfaceType } from "../../shared";
export { SURFACE_TYPES } from "../../shared";
export type { GrindEdge, GrindEdgeHit } from "./domain/grind-edges";
export {
  closestOnEdge,
  grindEdgesNear,
  levelGrindEdges,
  nearestGrindEdge,
  obstacleGrindEdges,
} from "./domain/grind-edges";
export type { GroundParams } from "./domain/ground";
export { groundObstacle } from "./domain/ground";
export type { Spawn } from "./domain/level";
export { Level } from "./domain/level";
export type { MapDefinition } from "./domain/map-definition";
export { isMapDefinition } from "./domain/map-definition";
export type {
  BankLedgeShape,
  BankShape,
  BoxShape,
  FunboxBankRail,
  FunboxShape,
  FunboxSide,
  FunboxSides,
  FunboxTopRail,
  HandrailParams,
  HubbaParams,
  KickerShape,
  KinkedRailShape,
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
  bankLedgeRunM,
  funboxBankRunM,
  handrailSpanXM,
  handrailZM,
  kickerLipAngleRad,
  kickerRadiusM,
  kinkedRailTopLine,
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
export type { WorldConfig } from "./world.config";
export { WORLD_CONFIG } from "./world.config";
