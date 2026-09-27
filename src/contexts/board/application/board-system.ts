import type { Transform, Vec3 } from "../../../shared";
import type { BoardSnapshot } from "../domain/board-snapshot";
import type { RigidBodyHandle } from "../domain/physics-world";
import type { BoardForce } from "../domain/tyre-model";

/**
 * Per-tick orchestration of the `board` context, called by the fixed-step loop.
 * Implementations publish `BoardLeftGround`, `BoardLanded`, `SurfaceContactStarted`
 * and `SurfaceContactEnded` on the injected `EventBus` from `postPhysics`.
 */
export interface BoardSystem {
  /** The deck body; the rider applies foot forces to it. */
  readonly body: RigidBodyHandle;
  /** Latest snapshot (the one returned by the last `postPhysics`, or the spawn pose). */
  readonly snapshot: BoardSnapshot;
  /**
   * Board-internal forces (wheel grip, rolling resistance) applied by the last
   * `prePhysics`, for the debug overlay. Empty while airborne.
   */
  readonly lastForces: readonly BoardForce[];
  /**
   * Deck lean on the trucks, rad (+ = the +Z side down, ADR 0003). A model value: the
   * rigid body does not tilt; the renderer tilts the deck by it.
   */
  readonly leanRad: number;
  /**
   * Loop step 3 (before `PhysicsWorld.step`): the board's own forces — wheel grip,
   * rolling resistance, truck steering from lean.
   */
  prePhysics(dtS: number): void;
  /** Loop step 4: read back state, build the snapshot, publish contact events. */
  postPhysics(tick: number, timeS: number): BoardSnapshot;
  /**
   * Puts the board at `transform` (board frame pose) with the given velocities (default:
   * at rest) and forgets contact history.
   */
  reset(transform: Transform, linearVelocityMps?: Vec3, angularVelocityRadps?: Vec3): void;
}
