import type { MapDefinition } from "../../contexts/world";
import { createElToroLevel } from "./el-toro";

const level = createElToroLevel();

/** El Toro: the 20-stair with a handrail (`?map=el-toro`), a big-drop challenge. */
export const map: MapDefinition = {
  id: "el-toro",
  name: "El Toro",
  description: "20 stairs. Good luck.",
  spawn: level.spawn,
  createLevel: () => createElToroLevel(),
};
