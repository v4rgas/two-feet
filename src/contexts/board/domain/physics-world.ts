import type { BoardPartId, ObstacleId, SurfaceType, Transform, Vec3 } from "../../../shared";
import type { BoardSpec } from "./board-spec";

/**
 * PHYSICS PORT (REQUIREMENTS §2.3). The only way any code talks to the physics engine.
 * `RapierPhysicsWorld` in `board/infrastructure` is the only implementation that touches
 * Rapier; tests use fakes (see `FakeRigidBodyHandle`).
 *
 * Conventions for every method:
 * - World frame, SI units, right-handed Y-up (ADR 0002).
 * - Returned values are immutable VOs (implementations may cache per step).
 */

/**
 * Handle to one dynamic rigid body (for the board: the deck body that carries
 * trucks/wheels). Feet act on the board only through this.
 */
export interface RigidBodyHandle {
  /** Pose of the body's local frame (for the board: the board frame). */
  getTransform(): Transform;
  /** Linear velocity of the local-frame origin, m/s (world). */
  getLinearVelocity(): Vec3;
  /** Angular velocity, rad/s (world). */
  getAngularVelocity(): Vec3;
  /** Velocity of the body material at `pointWorldM`, m/s: v + ω × (p − com). */
  getVelocityAtPoint(pointWorldM: Vec3): Vec3;
  /** Centre of mass, m (world). */
  getCenterOfMassWorld(): Vec3;
  getMassKg(): number;
  /**
   * Moment of inertia about an axis through the centre of mass, kg·m² (`axisWorld` need
   * not be normalised). Lets controllers turn a target spin rate into an angular impulse.
   */
  getAngularInertiaKgM2(axisWorld: Vec3): number;

  /**
   * Adds a force (N) at a world point. Forces accumulate and act during the NEXT
   * `PhysicsWorld.step` only; they are cleared after it (call again every step).
   */
  applyForceAtPoint(forceN: Vec3, pointWorldM: Vec3): void;
  /** Applies an impulse (N·s) at a world point; changes velocity immediately. */
  applyImpulseAtPoint(impulseNs: Vec3, pointWorldM: Vec3): void;
  /** Adds a torque (N·m, world) for the next step only, like `applyForceAtPoint`. */
  applyTorque(torqueNm: Vec3): void;
  /** Applies an angular impulse (N·m·s, world) immediately. */
  applyTorqueImpulse(impulseNms: Vec3): void;

  /** Teleports the body, sets its velocities (default zero) and clears pending forces. */
  resetTo(transform: Transform, linearVelocityMps?: Vec3, angularVelocityRadps?: Vec3): void;
}

/** Geometry of a static collider, in its own local frame. */
export type ColliderShape =
  | { readonly kind: "box"; readonly halfExtentsM: Vec3 }
  | { readonly kind: "convexHull"; readonly pointsM: readonly Vec3[] };

/**
 * Static world geometry to add to the physics world. A `world` `Obstacle` is
 * structurally a `StaticColliderDesc`, so the composition root passes obstacles as-is.
 */
export interface StaticColliderDesc {
  readonly id: ObstacleId;
  readonly surface: SurfaceType;
  readonly transform: Transform;
  readonly shape: ColliderShape;
}

/** One contact between a board part and the world, sampled after a step. */
export interface BoardContact {
  readonly part: BoardPartId;
  readonly surface: SurfaceType;
  readonly obstacleId: ObstacleId;
  /** Contact point, m (world). */
  readonly pointWorldM: Vec3;
  /** Unit normal pointing from the surface toward the board (world). */
  readonly normalWorld: Vec3;
  /** Normal impulse transferred during the last step, N·s (0 if unknown, e.g. raycast wheels). */
  readonly normalImpulseNs: number;
}

/** The board as assembled in the physics world. */
export interface BoardBody {
  /** The deck body. Its local frame is the board frame of `BoardSpec`. */
  readonly body: RigidBodyHandle;
  /**
   * Contacts of every board part during the most recent `step`. Wheels are always
   * reported as parts, whether infrastructure models them as colliders or raycasts.
   */
  contacts(): readonly BoardContact[];
}

/** A ray in world space. */
export interface Ray {
  readonly originWorldM: Vec3;
  /** Unit direction (world). */
  readonly directionWorld: Vec3;
}

export interface RaycastOptions {
  readonly maxDistanceM: number;
  /** Ignore this body (e.g. the board itself when probing for ground under it). */
  readonly excludeBody?: RigidBodyHandle;
}

/** Closest hit of a raycast against static world geometry and bodies. */
export interface RaycastHit {
  readonly pointWorldM: Vec3;
  readonly normalWorld: Vec3;
  readonly distanceM: number;
  readonly surface: SurfaceType;
  /** Obstacle id, or null when the hit is a dynamic body (e.g. the board). */
  readonly obstacleId: ObstacleId | null;
}

/** The physics world port. Creating one is async (WASM init) and lives in infrastructure. */
export interface PhysicsWorld {
  /** Adds static level geometry. Ids must be unique. */
  addStaticCollider(desc: StaticColliderDesc): void;
  /** Builds the board (deck + trucks + wheels) at `transform` (board frame pose). */
  createBoard(spec: BoardSpec, transform: Transform): BoardBody;
  /** Advances the simulation by `dtS` (always the fixed step, 1/120 s). */
  step(dtS: number): void;
  raycast(ray: Ray, options: RaycastOptions): RaycastHit | null;
  /** Frees engine resources. The world is unusable afterwards. */
  dispose(): void;
}
