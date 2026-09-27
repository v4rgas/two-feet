# ADR 0014: Maps as folders, and the game shell

- Status: accepted (implements GAME.md)
- Date: 2026-09-27

## Context

GAME.md turns the physics sandbox into a game: a first-launch tutorial, a map list, an
Esc menu, restart and checkpoints. Until now the levels were factories inside the world
context's domain (`createFlatGroundLevel`, `createSkateparkLevel`,
`createStreetCourseLevel`), their layouts in `WORLD_CONFIG`, and `bootstrap.ts` picked
one from `?level=`. The park was a smaller, older plaza that the Street Course
supersedes.

## Decision: maps

- **A map is a folder**, `src/maps/<id>/`, with a `map.ts` that exports a named
  `MapDefinition` (`id`, `name`, `description`, `spawn`, `createLevel()`, optional
  `tutorial`), plus its own parameters (`street.config.ts`, `flat.config.ts`).
- **The `MapDefinition` type lives in the world context's public API**
  (`world/domain/map-definition.ts`, with `isMapDefinition`). A map is world data built
  from world kinds, so the type belongs next to `Level`; putting it in `src/game` would
  make every map folder depend on the composition root. The world domain keeps only the
  obstacle kinds, their geometry, `Level`, and `groundObstacle` (the ground slab every
  map stands on). `WORLD_CONFIG` keeps only the tessellation (`geometry`).
- **Discovery at build time**: `src/game/maps/maps.ts` runs
  `import.meta.glob("../../maps/*/map.ts", { eager: true })` and hands the modules to
  `createMapRegistry` (pure), which registers every export that `isMapDefinition`
  accepts, rejects duplicate ids, orders the list (the default map first, then by name)
  and names the tutorial map. A test registers a fixture folder the same way.
- **dependency-cruiser**: `maps-are-data` (a map imports only its own folder, the world
  context's `index.ts` and `src/shared`) and `only-game-finds-maps`.
- **The park is removed.** Its scenarios, the G1–G7 grinds, the montage clips and the
  human-jitter lines now run on the Street Course (see "Ported from the park").

### Ported from the park

| Park | Street Course |
| --- | --- |
| G1/G2/G5/G5b/G6 on the 0.35 m round flat rail | the 0.3 m square flat bar |
| G3 slides on the 0.4 m ledge | the 0.4 m long ledge |
| G4 on the 5-stair's 0.35 m hubba | the 7-stair's +Z hubba (0.28 m): a longer slide, the pop out at 1.78 s |
| G7 on the halfpipe's coping | the east quarter pipe's coping |
| bank ride at 4 m/s | the bank-to-ledge's 25° bank at 3.3 m/s (4 m/s reaches the ledge block) |
| quarter pipe climb, carves | the east quarter pipe (1.2 m) |
| kicker ollie, 360 flip clip | the euro gap's 0.6 m drop (the street has no kicker) |
| 5-stair ollie, kickflip, varial heelflip | the 7-stair from the map's spawn |
| mini halfpipe fakie ollie clip | the east quarter pipe at 4.6 m/s (5 m/s reaches its coping) |

The kind tests (ramps, stairs, quarter pipe geometry and colliders) keep the park's
dimensions as local fixtures: they test kinds, not maps.

## Decision: the game shell

See the "Game shell" section below.
