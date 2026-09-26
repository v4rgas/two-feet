# board

The board's physical definition and state; contact with the ground and obstacles.
Owns the **physics port**.

## Ubiquitous language

- **Board frame** — origin at the deck centre (mid-thickness, flat section); +X nose, +Y up, +Z right side (toe edge in regular, heel edge in goofy). See ADR 0002.
- **Board spec** (VO) — dimensions, masses, truck geometry and steering. Defaults in `board.config.ts` (8.25" deck, 0.36 m wheelbase, 54 mm wheels). Derived geometry: `deckTopPointLocal`, `wheelCenterLocal`, `tailTipLocal`, `noseTipLocal`, `restHeightM`, `totalMassKg`. Renderers must build meshes from these.
- **Board part** — `deck | nose | tail | noseTruck | tailTruck | {nose,tail}{Left,Right}Wheel` (left = -Z, right = +Z).
- **Contact state** (VO) — which parts touch the world. **Grounded** — at least `groundedMinWheels` wheels down.
- **Board snapshot** (VO) — immutable state after a step: transform, velocities, contact state, wheels down, airtime, raw contacts.
- **Physics world / rigid body handle** — the port. Only `RapierPhysicsWorld` (board/infrastructure) touches Rapier.

## Public API (`index.ts`)

- Ports: `PhysicsWorld` (`addStaticCollider`, `createBoard`, `step`, `raycast`, `dispose`), `RigidBodyHandle` (transform, velocities, velocity at point, COM, mass, `applyForceAtPoint`, `applyImpulseAtPoint`, `applyTorque`, `applyTorqueImpulse`, `resetTo`), `BoardBody` (`body`, `contacts()`).
- Types: `BoardSpec` (VO + helpers), `BoardSnapshot`, `ContactState`, `BoardContact`, `StaticColliderDesc`, `ColliderShape`, `Ray`, `RaycastHit`, `RaycastOptions`, `BoardPartId`, `WheelId`.
- Application: `BoardSystem` (`body`, `snapshot`, `prePhysics`, `postPhysics`, `reset`).
- Test double: `FakeRigidBodyHandle` (records applied forces). Config: `BOARD_CONFIG`, `NO_CONTACT`.

## Events

- Emits: `BoardLeftGround`, `BoardLanded`, `SurfaceContactStarted`, `SurfaceContactEnded`.
- Consumes: none.
