import { groundObstacle, Level } from "../../contexts/world";
import { Vec3 } from "../../shared";
import type { FlatConfig } from "./flat.config";
import { FLAT_CONFIG } from "./flat.config";

/** The M1 level: one large ground slab whose top face is the plane y = 0. */
export function createFlatGroundLevel(config: FlatConfig = FLAT_CONFIG): Level {
  return Level.create({
    id: "flat",
    name: "Flat ground",
    obstacles: [groundObstacle(config.ground)],
    spawn: {
      positionM: Vec3.create(config.spawn.xM, 0, config.spawn.zM),
      headingRad: config.spawn.headingRad,
    },
  });
}
