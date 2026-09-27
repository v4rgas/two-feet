import type { MapDefinition } from "../../../../../contexts/world";
import { groundObstacle, Level } from "../../../../../contexts/world";
import { Vec3 } from "../../../../../shared";

/** A test-only map folder (map-registry.test.ts): a small slab. */
export const map: MapDefinition = {
  id: "dummy",
  name: "Dummy slab",
  description: "A fixture map.",
  spawn: { positionM: Vec3.ZERO, headingRad: 0 },
  createLevel: () =>
    Level.create({
      id: "dummy",
      name: "Dummy slab",
      obstacles: [groundObstacle({ halfSizeM: 5, thicknessM: 1 })],
      spawn: { positionM: Vec3.ZERO, headingRad: 0 },
    }),
};
