import type { Level, Spawn } from "./level";

/**
 * A playable map (GAME.md "Maps"): data in its own folder, `src/maps/<id>/map.ts`, found
 * by the game at build time. A map is built from the world context's obstacle kinds; its
 * parameters (positions, sizes) live in its folder, never in `world.config.ts`.
 */
export interface MapDefinition {
  /** Unique, kebab-case; `?map=<id>` picks it and `skate.lastMap` stores it. */
  readonly id: string;
  /** Shown in the menu's map list. */
  readonly name: string;
  /** One line, shown under the name in the map list. */
  readonly description: string;
  /** Where the board starts (the level's spawn). */
  readonly spawn: Spawn;
  /** Builds the level (a fresh aggregate each call); its spawn is `spawn`. */
  createLevel(): Level;
  /** The map the tutorial runs on (one map sets it). */
  readonly tutorial?: boolean;
}

/** Does `value` look like a `MapDefinition`? (For discovering maps from modules.) */
export function isMapDefinition(value: unknown): value is MapDefinition {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.name === "string" &&
    typeof v.description === "string" &&
    typeof v.createLevel === "function" &&
    typeof v.spawn === "object" &&
    v.spawn !== null
  );
}
