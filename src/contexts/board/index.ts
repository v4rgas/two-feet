/**
 * Public API of the `board` context. Other contexts, presentation and the game
 * import ONLY from here (infrastructure is imported by src/game directly).
 */
export type { BoardPartId, WheelId } from "../../shared";
export { WHEEL_IDS } from "../../shared";
export type { BoardSystem } from "./application/board-system";
export type { BoardConfig } from "./board.config";
export { BOARD_CONFIG } from "./board.config";
export type { BoardSnapshot, ContactState } from "./domain/board-snapshot";
export { NO_CONTACT } from "./domain/board-snapshot";
export { BoardSpec } from "./domain/board-spec";
export type { RecordedApplication } from "./domain/fake-rigid-body";
export { FakeRigidBodyHandle } from "./domain/fake-rigid-body";
export type {
  BoardBody,
  BoardContact,
  ColliderShape,
  PhysicsWorld,
  Ray,
  RaycastHit,
  RaycastOptions,
  RigidBodyHandle,
  StaticColliderDesc,
} from "./domain/physics-world";
