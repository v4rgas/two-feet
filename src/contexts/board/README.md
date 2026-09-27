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
- **Landing settle** (domain service, `landing-settle.ts`) — for `landing.settleWindowS` after a hard touchdown, a wheel hanging just above the contact plane is not allowed to move away from it: one impulse along the contact normal, no thrust. Makes big drops land the same whatever the world's collider count (ADR 0003, "Hard landings").
- **Lean** — what the bushings feel: the roll moment of the wheel loads divided by `bushingStiffnessNmPerRad`, clamped to `maxLeanRad`, with a lag. Positive when the +Z wheels carry more load.
- **Steer** — `steerPerLean · lean`, clamped to `maxSteerRad`. Positive steer turns toward +Z: rolling forward, the heading turns clockwise seen from above.
- **Physics world / rigid body handle** — the port. Only `RapierPhysicsWorld` (board/infrastructure) touches Rapier.

## Public API (`index.ts`)

- Ports (`RapierPhysicsWorld` also has `stats()` for bodies/colliders and a static `liveWorlds` count: leak checks of a map switch): `PhysicsWorld` (`addStaticCollider`, `createBoard`, `step`, `raycast`, `dispose`), `RigidBodyHandle` (transform, velocities, velocity at point, COM, mass, `applyForceAtPoint`, `applyImpulseAtPoint`, `applyTorque`, `applyTorqueImpulse`, `resetTo`), `BoardBody` (`body`, `contacts()`).
- Types: `BoardSpec` (VO + helpers), `BoardSnapshot`, `ContactState`, `BoardContact`, `BoardForce`, `BoardForceLabel`, `StaticColliderDesc`, `ColliderShape` (`box`, `convexHull`, or `compound`: convex-hull parts that each carry their own surface type, see ADR 0008), `ColliderPart`, `Ray`, `RaycastHit`, `RaycastOptions`, `BoardPartId`, `WheelId`.
- Helpers: `contactStateFrom(contacts)`, `countWheelsDown(state)`.
- Application: the `BoardSystem` interface (`body`, `snapshot`, `lastForces`, `prePhysics`, `postPhysics`, `reset(transform, linearVelocity?, angularVelocity?)`: a checkpoint restores the board's velocity too, GAME.md) and its implementation `PhysicsBoardSystem(boardBody, spec, config, bus)`, which also exposes `leanRad` and `steerRad`.
- Test double: `FakeRigidBodyHandle` (records applied forces). Config: `BOARD_CONFIG`, `NO_CONTACT`.
- Infrastructure (imported only by `src/game`): `RapierPhysicsWorld.create(config)`. It is async because it loads WASM.

## Events

- Emits:
  - `BoardLeftGround` (grounded → airborne)
  - `BoardLanded` (airborne → grounded, with airtime, `upDot`, `surfaceUpDot` and wheels down). `surfaceUpDot` is the board's up vector dotted with the mean normal of the wheel contacts, so it measures the tilt against a ramp, not against world up.
  - `SurfaceContactStarted` and `SurfaceContactEnded` (once per part, obstacle and surface: a truck moving from a quarter pipe's transition onto its coping starts a new `grindable` contact)

  The first `postPhysics` after construction or `reset` only records the baseline and
  emits nothing.
- Consumes: none.

## Tuning

Every constant is in `board.config.ts`. The headless Rapier scenarios in
`infrastructure/rapier-physics-world.test.ts` are the regression net: rest, roll, grip,
carve, pop (4 N·s on the tail tip), flip (0.13 N·m·s roll) and the 0.5 m landing.
`infrastructure/hard-landing.test.ts` pins hard landings (5–9 m/s, level and ±0.1 rad)
against 0/1/5/20 unrelated colliders. The
M3 ramp scenarios (quarter pipe, bank, kicker, stairs, rails) are in
`src/game/scenarios/ramps.scenario.test.ts`. Run `pnpm test` after every change.
