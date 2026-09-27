/** Shared kernel public surface. Keep it small (REQUIREMENTS §2.2). */
export type { DeepReadonly, Tunable } from "./config";
export { deepFreeze } from "./config";
export type {
  BailReason,
  BoardLanded,
  BoardLeftGround,
  BoardPopped,
  DomainEvent,
  DomainEventType,
  EventOfType,
  FootAttached,
  FootDetached,
  FootDetachReason,
  RiderBailed,
  RotationTotals,
  SurfaceContactEnded,
  SurfaceContactStarted,
  TrickBailed,
  TrickLanded,
} from "./events/domain-event";
export type { EventBus, EventHandler, Unsubscribe } from "./events/event-bus";
export { InMemoryEventBus } from "./events/event-bus";
export { degToRad, radToDeg, shortestDelta, TAU, turns, wrapPi } from "./math/angle";
export { Quat } from "./math/quat";
export { Transform } from "./math/transform";
export { Vec2 } from "./math/vec2";
export { Vec3 } from "./math/vec3";
export type { Clock } from "./time/clock";
export { ManualClock } from "./time/clock";
export type { FixedStepOptions } from "./time/fixed-step";
export { FixedStepAccumulator } from "./time/fixed-step";
export type {
  BoardPartId,
  FootId,
  Kick,
  ObstacleId,
  Stance,
  SurfaceType,
  WheelId,
} from "./vocabulary";
export { FOOT_IDS, SURFACE_TYPES, WHEEL_IDS } from "./vocabulary";
