import { Quat, Transform, Vec3 } from "../../../shared";
import type { WorldConfig } from "../world.config";
import { Level } from "./level";

/** The M1 level: one large `ground` box whose top face is the plane y = 0. */
export function createFlatGroundLevel(config: WorldConfig["flatGround"]): Level {
  const half = config.halfSizeM;
  const halfThickness = config.thicknessM / 2;
  return Level.create({
    id: "flat-ground",
    name: "Flat ground",
    obstacles: [
      {
        id: "ground",
        name: "Ground",
        surface: "ground",
        transform: Transform.create(Vec3.create(0, -halfThickness, 0), Quat.IDENTITY),
        shape: { kind: "box", halfExtentsM: Vec3.create(half, halfThickness, half) },
      },
    ],
    spawn: { positionM: Vec3.ZERO, headingRad: config.spawnHeadingRad },
  });
}
