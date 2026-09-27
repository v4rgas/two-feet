# maps

Playable maps, one folder each (GAME.md "Maps", [ADR 0014](../../docs/adr/0014-maps-and-game-shell.md)).

## Adding a map

1. Make a folder `src/maps/<id>/` (kebab-case id).
2. Put the map's parameters (positions, sizes) in a config file there, e.g.
   `<id>.config.ts`, a `deepFreeze`d object. Never in `world.config.ts`.
3. Write `map.ts` with a named export typed as the world context's `MapDefinition`:

   ```ts
   import type { MapDefinition } from "../../contexts/world";

   export const map: MapDefinition = {
     id: "<id>",
     name: "Shown in the menu",
     description: "One line under the name.",
     spawn: level.spawn,
     createLevel: () => createMyLevel(),
   };
   ```

   `createLevel` builds a `Level` from the world context's obstacle kinds
   (`groundObstacle`, `ObstacleShape.*`, placed by `Transform`s), with `id` equal to the
   map's id and its spawn equal to `spawn`.
4. That's all: `src/game/maps/maps.ts` finds every `src/maps/*/map.ts` with
   `import.meta.glob`, so the map appears in the Esc menu and `?map=<id>` opens it.

Rules (dependency-cruiser `maps-are-data`): a map folder imports only its own files, the
world context's `index.ts` and `src/shared`. Only `src/game` imports maps.

## Shipped

- `street/`: the Street Course, the default map. `street.config.ts` holds the layout.
- `flat/`: flat ground. The tutorial runs here (`tutorial: true`).
