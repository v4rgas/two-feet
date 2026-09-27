import type { MapDefinition } from "../../contexts/world";
import { isMapDefinition } from "../../contexts/world";

/**
 * The maps the game knows (GAME.md "Maps"), found from the `src/maps/<id>/map.ts`
 * modules: every export of a module that looks like a `MapDefinition` registers. Built by
 * `createMapRegistry` from an `import.meta.glob` result, so a test can register a fixture
 * folder the same way (`maps.ts` holds the game's own glob).
 */
export interface MapRegistry {
  /** Every map, in menu order: the default map first, then by name. */
  readonly all: readonly MapDefinition[];
  /** The map with this id, or undefined. */
  get(id: string): MapDefinition | undefined;
  /** The map the game opens on (GAME.md: the Street Course). */
  readonly defaultMap: MapDefinition;
  /** The map the tutorial runs on (the one with `tutorial: true`, else the default). */
  readonly tutorialMap: MapDefinition;
}

/**
 * Builds the registry from glob modules (path → module namespace). Throws on duplicate
 * ids, on a folder whose `map.ts` exports no map, or when `defaultId` is missing.
 */
export function createMapRegistry(
  modules: Readonly<Record<string, unknown>>,
  defaultId: string,
): MapRegistry {
  const byId = new Map<string, MapDefinition>();
  for (const [path, module] of Object.entries(modules)) {
    const found = Object.values(module as Record<string, unknown>).filter(isMapDefinition);
    if (found.length === 0) throw new Error(`Map module ${path} exports no MapDefinition`);
    for (const map of found) {
      if (byId.has(map.id)) throw new Error(`Duplicate map id "${map.id}" (${path})`);
      byId.set(map.id, map);
    }
  }
  const defaultMap = byId.get(defaultId);
  if (defaultMap === undefined) throw new Error(`The default map "${defaultId}" is missing`);
  const all = [...byId.values()].sort((a, b) =>
    a.id === defaultId ? -1 : b.id === defaultId ? 1 : a.name.localeCompare(b.name),
  );
  const tutorialMap = all.find((m) => m.tutorial === true) ?? defaultMap;
  return {
    all,
    get: (id) => byId.get(id),
    defaultMap,
    tutorialMap,
  };
}
