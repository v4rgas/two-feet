# ADR 0001 — DDD layering, physics port, structural ports

- Status: accepted
- Date: 2026-09-26

## Context

REQUIREMENTS §2.2–2.4 split the game into bounded contexts (`input`, `rider`, `board`,
`tricks`, `world`) with `domain / application / infrastructure` layers, a small shared
kernel, a read-only presentation layer and a composition root. Several agents build the
contexts in parallel, so the contracts and the dependency rules must be explicit and
machine-checked.

## Decision

### Layout

```
src/shared/                  math VOs, DomainEvent union, EventBus, Clock, FixedStep, vocabulary
src/contexts/<ctx>/domain/   pure TS: VOs, entities, domain services, ports
src/contexts/<ctx>/application/  per-tick "systems" called by the loop
src/contexts/<ctx>/infrastructure/  adapters (Rapier, keyboard, localStorage)
src/contexts/<ctx>/<ctx>.config.ts  every tunable, deep-frozen
src/contexts/<ctx>/index.ts  public API: domain + application + config, NEVER infrastructure
src/presentation/            Three.js, HUD, debug overlay — consumes RenderFrame
src/game/                    composition root, fixed-step loop, stubs
```

### Enforcement

`.dependency-cruiser.cjs` (run by `pnpm lint`, type-only imports included):

| Rule | Encodes |
|---|---|
| `domain-is-pure` | domain → only own domain, own `<ctx>.config.ts`, `src/shared` |
| `config-is-pure` | config → only own domain, `src/shared` |
| `shared-kernel-is-a-leaf` | shared → only shared |
| `application-not-to-infrastructure`, `application-not-to-engines` | §2.3.2 |
| `cross-context-only-via-index` | §2.3.5 |
| `outside-contexts-only-via-index` | presentation/shared/main see contexts only via `index.ts` |
| `index-does-not-export-infrastructure`, `only-game-imports-infrastructure` | §2.3.6 |
| `game-uses-index-for-domain-and-application` | game imports infra directly, the rest via index |
| `presentation-not-to-game`, `contexts-not-to-outer-layers` | layering |
| `rapier-only-in-board-infrastructure`, `three-only-in-presentation`, `lil-gui-only-in-presentation-or-game` | engines stay in their adapters |
| `no-circular`, `not-to-unresolvable` | hygiene |

DOM globals cannot be seen by an import graph, so two more guards exist:
`tsconfig.domain.json` type-checks `src/shared` and every `domain/` **without the DOM
lib** (part of `pnpm check`), and Biome's `noRestrictedGlobals` flags `window`,
`document`, `localStorage`, `performance`, … in those folders.

### Physics port

`board/domain/physics-world.ts` defines `PhysicsWorld`, `RigidBodyHandle` and
`BoardBody`. Forces added with `applyForceAtPoint` / `applyTorque` act during the next
`step` only; impulses act immediately. Contacts are reported per `BoardPartId` with the
`SurfaceType` of what was touched, whatever the wheel model. `RapierPhysicsWorld` in
`board/infrastructure` is the only Rapier user. `FakeRigidBodyHandle` records applied
forces for unit tests.

### Structural ports

Rule 1 forbids a domain from importing another context, yet `rider` needs intents and
board motion, and `tricks` needs board motion. Each consuming domain therefore declares
the **minimal shape it needs** (`RiderControls`, `BoardKinematics`, `DeckGeometry`,
`MotionSample`), and the producer's VO satisfies it structurally. The application layer
(allowed to import other contexts' `index.ts`) passes the real VO in.
`src/game/contract-checks.ts` asserts every pairing at compile time, so drift fails
`pnpm check`.

### Shared vocabulary

Domain events are plain data in the shared kernel, and their payloads mention `FootId`,
`Stance`, `SurfaceType` and `BoardPartId`. These literal unions therefore live in
`src/shared/vocabulary.ts` and are re-exported by their owning context (`input`, `world`,
`board`). Nothing else from a context is in the kernel.

### Events and the loop

The `EventBus` is synchronous and queued: `publish` enqueues; `flush` (loop step 7)
delivers FIFO, including events published by handlers during the flush. So `tricks`
sees this step's `BoardLanded` at flush time and its `TrickLanded` is delivered in the
same flush. The loop order is REQUIREMENTS §2.4; the board's own wheel/truck forces are
applied in `BoardSystem.prePhysics`, right before `PhysicsWorld.step` (step 3).

### Config

Each `<ctx>.config.ts` exports one `deepFreeze`d object. Systems receive their config by
injection; the lil-gui panel binds to a `structuredClone` (typed `Tunable<T>`) that the
game injects in dev builds, since frozen objects cannot be edited.

## Consequences

- Contexts can be built and tested in isolation against the ports and fakes.
- Geometry needed by several contexts (deck surface) is defined once in `BoardSpec`;
  rider's `DeckGeometry` is only the numbers, so rider code must use the same formulas
  (test against `BoardSpec.deckTopPointLocal`).
- `src/game/bootstrap.ts` is the single integration point; each agent swaps its stub there.
