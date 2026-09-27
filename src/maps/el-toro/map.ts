import type { Level, Spawn } from "../../contexts/world";
import { createElToroLevel } from "./el-toro";

/**
 * LOCAL stand-in for GAME.md's `MapDefinition` ("Maps": id, name, description,
 * createLevel, spawn, optional tutorial flag).
 * TODO(game shell): switch to the shared `MapDefinition` type once the map registry
 * (`import.meta.glob("../maps/*\/map.ts")`) lands, and delete this interface.
 */
interface MapDefinition {
  readonly id: string;
  readonly name: string;
  /** One line, shown in the menu's map list. */
  readonly description: string;
  readonly createLevel: () => Level;
  readonly spawn: Spawn;
  readonly tutorial?: boolean;
}

/** El Toro: the 20-stair with a handrail (`?level=el-toro`). */
export const map: MapDefinition = {
  id: "el-toro",
  name: "El Toro",
  description: "20 stairs. Good luck.",
  createLevel: createElToroLevel,
  spawn: createElToroLevel().spawn,
};
