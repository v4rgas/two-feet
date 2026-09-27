import type { MapDefinition } from "../../contexts/world";
import { createFlatGroundLevel } from "./flat-ground";

const level = createFlatGroundLevel();

/** Flat ground: nothing but concrete. The tutorial runs here (GAME.md "Tutorial"). */
export const map: MapDefinition = {
  id: "flat",
  name: "Flat ground",
  description: "Open concrete with nothing in the way: practise flips and spins.",
  spawn: level.spawn,
  createLevel: () => createFlatGroundLevel(),
  tutorial: true,
};
