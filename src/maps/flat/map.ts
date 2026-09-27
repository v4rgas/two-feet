import type { MapDefinition } from "../../contexts/world";
import { createFlatMapLevel } from "./flat-ground";

const level = createFlatMapLevel();

/**
 * Flat ground: open concrete in a small ring of low barriers. The tutorial runs here
 * (GAME.md "Tutorial").
 */
export const map: MapDefinition = {
  id: "flat",
  name: "Flat ground",
  description: "Open concrete with nothing in the way: practise flips and spins.",
  spawn: level.spawn,
  createLevel: () => createFlatMapLevel(),
  tutorial: true,
};
