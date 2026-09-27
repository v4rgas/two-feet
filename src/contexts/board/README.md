# board

The board's physical definition and state, and its contact with the ground and obstacles.
Owns the **physics port**. Wheel model: real wheel colliders plus a tyre model
([ADR 0003](../../../docs/adr/0003-wheel-model.md)).

## Ubiquitous language

- **Board frame** — origin at the deck centre (mid-thickness, flat section). +X points to the nose, +Y up, +Z to the right side (toe edge in regular, heel edge in goofy). See ADR 0002.
- **Board spec** (VO) — dimensions, masses, truck geometry and steering. Defaults in `board.config.ts` (8.25" deck, 0.36 m wheelbase, 54 mm wheels). Derived geometry: `deckTopPointLocal`, `wheelCenterLocal`, `tailTipLocal`, `noseTipLocal`, `restHeightM`, `totalMassKg`. Renderers must build meshes from these.
- **Board part** — `deck | nose | tail | noseTruck | tailTruck | {nose,tail}{Left,Right}Wheel` (left = -Z, right = +Z). Each part is one or more colliders on the single board body.
- **Contact state** (VO) — which parts touch the world. **Grounded** — at least `groundedMinWheels` wheels down. A board standing on its tail after a pop is *not* grounded.
- **Board snapshot** (VO) — immutable state after a step: transform, velocities, contact state, wheels down, airtime, raw contacts.
- **Tyre model** (domain service, `tyre-model.ts`) — turns wheel contacts into **board forces**: sideways **grip** (a damper capped by μ·N) and **rolling** resistance (Crr·N, normalised to the board's weight).
- **Lean** — what the bushings feel: the roll moment of the wheel loads divided by `bushingStiffnessNmPerRad`, clamped to `maxLeanRad`, with a lag. Positive when the +Z wheels carry more load.
- **Steer** — `steerPerLean · lean`, clamped to `maxSteerRad`. Positive steer turns toward +Z: rolling forward, the heading turns clockwise seen from above.
- **Physics world / rigid body handle** — the port. Only `RapierPhysicsWorld` (board/infrastructure) touches Rapier.

## Public API (`index.ts`)

- Ports: `PhysicsWorld` (`addStaticCollider`, `createBoard`, `step`, `raycast`, `dispose`), `RigidBodyHandle` (transform, velocities, velocity at point, COM, mass, `applyForceAtPoint`, `applyImpulseAtPoint`, `applyTorque`, `applyTorqueImpulse`, `resetTo`), `BoardBody` (`body`, `contacts()`).
- Types: `BoardSpec` (VO + helpers), `BoardSnapshot`, `ContactState`, `BoardContact`, `BoardForce`, `BoardForceLabel`, `StaticColliderDesc`, `ColliderShape`, `Ray`, `RaycastHit`, `RaycastOptions`, `BoardPartId`, `WheelId`.
- Helpers: `contactStateFrom(contacts)`, `countWheelsDown(state)`.
- Application: the `BoardSystem` interface (`body`, `snapshot`, `lastForces`, `prePhysics`, `postPhysics`, `reset`) and its implementation `PhysicsBoardSystem(boardBody, spec, config, bus)`, which also exposes `leanRad` and `steerRad`.
- Test double: `FakeRigidBodyHandle` (records applied forces). Config: `BOARD_CONFIG`, `NO_CONTACT`.
- Infrastructure (imported only by `src/game`): `RapierPhysicsWorld.create(config)`. It is async because it loads WASM.

## Events

- Emits:
  - `BoardLeftGround` (grounded → airborne)
  - `BoardLanded` (airborne → grounded, with airtime, `upDot` and wheels down)
  - `SurfaceContactStarted` and `SurfaceContactEnded` (once per part and obstacle pair)

  The first `postPhysics` after construction or `reset` only records the baseline and
  emits nothing.
- Consumes: none.

## Tuning

Every constant is in `board.config.ts`. The headless Rapier scenarios in
`infrastructure/rapier-physics-world.test.ts` are the regression net: rest, roll, grip,
carve, pop (4 N·s on the tail tip), flip (0.13 N·m·s roll) and the 0.5 m landing. Run
`pnpm test` after every change.
