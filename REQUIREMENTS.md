# Skate — Requirements

A browser skateboarding game where **each foot is controlled separately**:
one foot with `WASD`, the other with the arrow keys. There are no trick buttons.
Tricks happen because the feet push the board and the physics engine reacts.
The game recognizes a trick by watching what the board did.

The first milestone is the physics sandbox: a flat ground, a board, two feet,
and ollies and flip tricks that come out of the physics. Ramps, grinds, and
scoring come later. The architecture must let us add them without rewriting
the core.

---

## 1. Game requirements

### 1.1 Core principle — physics first, tricks emergent

- The board is a real rigid body. Feet apply **forces and impulses at contact
  points** on the deck. No trick animation is ever played back on the board.
- A trick is a **label attached after the fact**. The recognizer reads the
  board's rotation and airtime. It never makes the board move.
- If the player's input is sloppy, the result is sloppy: a half flip, a
  primo, a missed catch, a bail.

### 1.2 Controls

> **Superseded for tricks by [`MECHANICS.md`](MECHANICS.md)** (load, pop, level,
> kickflip, shove-it, catch). The table below is kept for context.

| Keys | Foot (regular stance) | Foot (goofy stance) |
|---|---|---|
| `W A S D` | Left = **front** foot | Left = **back** foot |
| `↑ ← ↓ →` | Right = **back** foot | Right = **front** foot |

Each key cluster drives a **virtual stick** for its foot. The digital keys are
smoothed into an analog 2D value in `[-1, 1]²` by a spring-damper. Tuning
lives in config.

The stick axes are relative to the board, not the screen:

- **Up/down** (`W/S`, `↑/↓`): moves the foot toward the nose (up) or toward
  the tail (down). Holding down on the foot that sits over the tail presses
  the tail.
- **Left/right** (`A/D`, `←/→`): moves the foot toward the toe edge or the
  heel edge. A fast sideways flick past the edge brushes the board into a flip.

How the basic moves come out of the physics:

| Move | Input gesture | What the physics does |
|---|---|---|
| **Pop** | Back foot: a quick **tap** down (press and release within about 0.18 s) | Downward impulse on the tail. The tail hits the ground, and the board pivots up on the rear axle. Only from wheels-down. |
| **Tail press** | Back foot: **hold** down (longer than a tap) | Presses the tail onto the ground and holds it there (it never pushes through). Releasing after a hold does not pop. |
| **Ollie** | Tap down to pop, then front foot slides up toward the nose | Friction force at the front foot drags the nose up and levels the board. |
| **Kickflip / heelflip** | Pop, then front foot flicks off the toe or heel edge | Off-axis impulse at the deck edge. Torque around the board's long axis. |
| **Shuvit** | Back foot sweeps sideways while popping | Tangential force at the tail. Torque around the vertical axis. |
| **Catch** | Both sticks return to neutral while airborne | Feet reattach when they are near the deck. Contact constraints damp the spin. |
| **Carve** | Both feet lean the same way | The deck tilts, the trucks turn, and the board steers. |
| **Push** | `Space`, for now | Forward impulse, only when grounded and both feet are near neutral. This will be revisited later. |

- The stance (regular or goofy) can be set in settings and is saved to
  `localStorage`.
- The input layer must allow **gamepad** support later (two analog sticks map
  onto this model directly). It is not needed for M1.

### 1.3 Feet model

- A foot is either **on the deck** (in contact, it applies forces) or
  **airborne** (it follows the rider body and applies no force).
- A foot on the deck has a position on the deck (along, across) and a pressure.
  Its friction against the grip tape is what lets the front foot drag the board
  during an ollie.
- A foot that leaves the deck area, or is moving too fast relative to the
  board, **detaches**. It reattaches when it comes back inside the catch radius.
- The rider body is kept **simple in M1**: a kinematic torso that follows the
  board with a spring and gives the feet their rest positions. A full ragdoll
  is out of scope.
- **Bail**: both feet stay detached for longer than N ms after landing, or the
  board lands upside down or badly off-angle. The run resets.

### 1.4 Board physics

- Rigid body parts: the deck (a box, or a convex hull with a kicked nose and
  tail), 2 trucks, and 4 wheels. Wheels may be modeled as raycast suspension or
  as real colliders. Pick whichever is more stable and write the choice down
  in an ADR.
- The tail and nose must be able to strike the ground. Pop depends on it.
- Wheels roll with low friction along the board's direction and grip
  sideways. Trucks turn in proportion to deck lean.
- The simulation runs at a **fixed timestep of 1/120 s** with an accumulator.
  Rendering interpolates between physics states.

### 1.5 Trick recognition

- The recognizer consumes a stream of `BoardSnapshot`s and domain events
  (`BoardPopped`, `BoardLeftGround`, `BoardLanded`, `FootDetached`, …).
- From takeoff to landing it tracks the **accumulated rotation** around each of
  the board's local axes (roll = flip, yaw = shuv, pitch).
- When the board lands, it classifies the air: for example, roll ≈ 360° and
  yaw ≈ 0° gives a Kickflip, with the direction deciding kick vs heel. If the
  landing was clean it emits `TrickLanded`. Otherwise it emits `TrickBailed`.
- Tricks are defined **as data** (rotation ranges plus conditions), so adding
  a trick does not require new logic.

### 1.6 World (extensibility target)

- A level is a list of **obstacles**. Each obstacle has geometry and a
  **surface type**: `ground`, `ramp`, `grindable` (rail or coping edge),
  `ledge`.
- M1 ships only `ground`. The model must already have the surface-type
  concept, so a later `GrindDetector` can react to a truck touching a
  `grindable` collider without changes elsewhere.

### 1.7 Camera, HUD, debug

- Follow camera behind the board and slightly to the side, smoothed.
- HUD:
  - one **foot pad widget per foot** that shows the stick position and whether
    that foot is attached
  - a popup with the trick name (no airtime readout anywhere)
- **Debug overlay** (toggle with `F1`):
  - force and impulse vectors at the contact points
  - contact points
  - board local axes
  - the recognizer's accumulated rotations
  - physics step time
- Physics tuning needs this overlay, so it is a first-class feature and not an
  afterthought.
- Debug **tuning panel** (lil-gui) for the physics and input constants during
  development.

### 1.8 Milestones

| # | Scope |
|---|---|
| **M1** | Project scaffold, flat ground, board with working wheel physics, push and carve, two feet with virtual sticks, pop, ollie, debug overlay, camera |
| **M2** | Flip tricks (kick/heel), shuvits, catch and land logic, bail and reset, trick recognizer and trick popup |
| **M3** | Ramps (quarter pipe, bank, kicker), level format, a basic skatepark |
| **M4** | Grinds and slides (rails, ledges, coping), `GrindDetector` |
| **M5** | Combos and scoring, session goals, audio |

### 1.9 Non-functional requirements

- Holds **60 fps** on a mid-range laptop in Chrome and Firefox. A physics step
  takes less than 2 ms.
- Input-to-physics latency is at most 1 physics step.
- First load is under 3 MB, excluding audio.
- Desktop keyboard first. Mobile is out of scope.

---

## 2. Code requirements

### 2.1 Stack

| Concern | Choice |
|---|---|
| Language | **TypeScript** (strict) |
| Build / dev | **Vite** |
| Package manager | **pnpm** |
| Physics | **Rapier 3D** (`@dimforge/rapier3d-compat`, WASM) |
| Rendering | **Three.js** |
| Tests | **Vitest** |
| Lint / format | **Biome** |
| Architecture lint | **dependency-cruiser**, which enforces the layer rules in §2.3 |
| Dev tuning UI | **lil-gui**, dev builds only |

There is no UI framework. The HUD is plain DOM/CSS on top of the canvas.

### 2.2 Domain-Driven Design — bounded contexts

| Context | Responsibility | Key domain types |
|---|---|---|
| **input** | Turns raw device input into per-foot intent. Knows about stance. | `FootId` (`front`/`back`), `Stance`, `StickValue` (VO), `FootIntent` (VO), `VirtualStick` |
| **rider** | Owns the feet: attached/detached state, deck position, pressure. Turns intents into forces on the board. Detects bails. | `Rider` (aggregate), `Foot` (entity), `DeckPosition` (VO), `FootForce` (VO) |
| **board** | The board's physical definition and state. Contact with the ground and obstacles. | `Board` (aggregate), `BoardSpec` (VO: dimensions, masses, truck params), `BoardSnapshot` (VO), `ContactState` |
| **tricks** | Watches board motion and recognizes tricks. Pure logic. | `TrickRecognizer` (domain service), `TrickDefinition` (VO, data), `AirSession`, `RotationAccumulator` |
| **world** | Levels, obstacles, surface types. | `Level` (aggregate), `Obstacle` (entity), `SurfaceType` (VO), `Spawn` |
| **session** *(M5)* | Score, combos, goals. | `Session`, `Combo`, `Score` |

**shared kernel** (`src/shared/`) holds math value objects (`Vec3`, `Quat`,
`Angle`), the typed `DomainEvent` union, the `EventBus` port, and `Clock`. It
must stay small.

**Domain events** are the only way contexts react to each other:
`BoardPopped`, `BoardLeftGround`, `BoardLanded`, `FootAttached`,
`FootDetached`, `TrickLanded`, `TrickBailed`, `RiderBailed`,
`SurfaceContactStarted` / `SurfaceContactEnded` (these carry `SurfaceType`, so
grinds can use them later).

### 2.3 Layers and dependency rule

Each context has these layers:

```
src/contexts/<context>/
  domain/          pure TS: entities, VOs, domain services, events, ports (interfaces)
  application/     use cases / systems orchestrating domain objects per tick
  infrastructure/  adapters: Rapier, keyboard, localStorage …
```

Other top-level folders:

```
src/shared/        shared kernel
src/presentation/  Three.js renderer, camera, HUD, debug overlay, menu (reads snapshots only)
src/game/          composition root: wires adapters, fixed-step loop, bootstraps,
                   and the game shell (src/game/shell: maps, menu, checkpoint, tutorial)
src/maps/          one folder per playable map (GAME.md "Maps", ADR 0014)
```

These rules are enforced by dependency-cruiser in CI:

1. `domain` imports **only** from its own context's `domain` and from
   `src/shared`. It must **never** import `three`, `@dimforge/*`, the DOM, or
   `window`.
2. `application` imports from `domain` (its own or another context's public
   `index.ts`). It never imports from `infrastructure`.
3. `infrastructure` implements ports that are defined in `domain`.
4. `presentation` reads immutable snapshots and events. It **never mutates**
   domain state and never calls physics.
5. A context imports another context only through that context's `index.ts`
   public API.
6. Only `src/game/` knows every concrete class (the composition root).

**Physics port.** The domain talks to physics through a `PhysicsWorld` /
`RigidBodyHandle` port: apply force/impulse at a point, read the transform and
velocities, query contacts, raycast. `RapierPhysicsWorld` in
`board/infrastructure` is the only file that touches Rapier. Because of this,
rider and tricks logic can be unit-tested with a fake physics world.

### 2.4 Game loop

`src/game/loop.ts` runs this order on every fixed step (1/120 s):

1. `input` samples devices and updates the `FootIntent`s.
2. `rider` turns intents into `FootForce`s and applies them through the
   physics port.
3. The physics world steps.
4. `board` reads back state, builds the `BoardSnapshot`, and emits contact
   events.
5. `rider` updates attach/detach and bail.
6. `tricks` consumes the snapshot and events.
7. The event bus flushes.

Rendering runs on `requestAnimationFrame` and interpolates between the last
two snapshots.

### 2.5 Conventions

- TypeScript `strict: true` and `noUncheckedIndexedAccess: true`. No `any`.
  No non-null `!` in domain code.
- Value objects are immutable (`readonly`, created through factory functions
  or static `create`, which validate their input). Entities have identity.
  Aggregates guard their invariants.
- Units are SI everywhere (m, kg, s, rad). Put the unit in the name when it is
  ambiguous: `popImpulseNs`, `maxLeanRad`.
- **Every tunable constant** lives in `src/contexts/<ctx>/<ctx>.config.ts` as
  one typed, frozen object. There are no magic numbers in logic. The lil-gui
  tuning panel binds to these objects.
- The world is right-handed and **Y-up**. The board's local frame is: +X
  toward the nose, +Y up, +Z toward the toe edge in regular stance (the
  rider faces +Z), so -Z is the toe edge in goofy.
- File names are `kebab-case.ts`. Types are `PascalCase`. There are no
  default exports.
- The event bus is synchronous and typed (a discriminated union on `type`).
  Events are plain data.
- Code that is not a hot path should read clearly first. In the per-tick hot
  path, avoid allocating inside the loop: reuse vectors in infrastructure and
  presentation. The domain may allocate VOs; profile before optimizing it.

### 2.6 Testing

- **Domain and application:** Vitest unit tests. They are required for
  `tricks` (the classification table), `input` (the stick smoothing), and
  `rider` (attach/detach, force mapping) using a fake `PhysicsWorld`.
- **Physics integration:** headless Rapier tests in Node for scripted
  scenarios. For example: "a pop on a board at rest with this spec lifts the
  nose above 0.3 m" and "a scripted kickflip input results in roll ≈ 2π when it
  lands." These scenarios are the regression net for tuning.
- `pnpm check` (tsc), `pnpm lint` (biome plus depcruise), and `pnpm test` must
  all pass before a task counts as done.

### 2.7 Documentation

- `docs/adr/NNNN-title.md` holds architecture decision records. Write one for
  each non-obvious choice (wheel model, force model, and so on).
- Each context has a short `README.md` that covers its ubiquitous language,
  its public API, and the events it emits and consumes.
- `CLAUDE.md` at the repo root tells agents to read this file and
  `STYLE.md` first.
