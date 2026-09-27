import type { MapDefinition } from "../../contexts/world";
import { createStreetCourseLevel } from "./street-course";

const level = createStreetCourseLevel();

/** The Street Course: the default map (GAME.md "Maps"). */
export const map: MapDefinition = {
  id: "street",
  name: "Street Course",
  description:
    "A tight contest plaza: a 7-stair with hubbas into a funbox, rails, ledges, pads and a quarter pipe.",
  spawn: level.spawn,
  createLevel: () => createStreetCourseLevel(),
};
