# world

Levels, obstacles, surface types.

## Ubiquitous language

- **Level** (aggregate) — a list of obstacles + a spawn. Guards unique obstacle ids.
- **Obstacle** (entity) — id, name, surface type, transform, shape (`box` or `convexHull`). Structurally a board `StaticColliderDesc`, so the game passes obstacles straight to `PhysicsWorld.addStaticCollider`.
- **Surface type** (VO) — `ground | ramp | grindable | ledge`. M1 ships only `ground`. Carried by contacts and `SurfaceContact*` events so a future `GrindDetector` needs no changes elsewhere.
- **Spawn** (VO) — ground point + heading; the board adds its own rest height.

## Public API (`index.ts`)

- Types: `Level` (+ `Level.create`), `Obstacle`, `ObstacleShape`, `Spawn`, `SurfaceType`, `ObstacleId`.
- Functions: `createFlatGroundLevel(WORLD_CONFIG.flatGround)` — one ground box whose top face is y = 0.
- Config: `WORLD_CONFIG`.

## Events

Emits none. Consumes none (M3+: level loading).
