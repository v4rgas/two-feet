import { GAME_CONFIG } from "../game.config";
import type { MapRegistry } from "./map-registry";
import { createMapRegistry } from "./map-registry";

/**
 * Every map folder, found at build time: adding a map means adding `src/maps/<id>/map.ts`
 * and nothing else (GAME.md "Maps").
 */
const MAP_MODULES = import.meta.glob("../../maps/*/map.ts", { eager: true });

/** The game's maps. */
export const MAPS: MapRegistry = createMapRegistry(MAP_MODULES, GAME_CONFIG.maps.defaultMapId);
