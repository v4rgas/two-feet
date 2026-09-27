import { Quat, Transform, Vec3 } from "../../../shared";
import type { WorldConfig } from "../world.config";
import { WORLD_CONFIG } from "../world.config";
import { createFlatGroundLevel } from "./flat-ground";
import { Level } from "./level";
import type { Obstacle } from "./obstacle";
import { ObstacleShape } from "./obstacle";
import { stairsHeightM } from "./obstacle-geometry";

/** Pose on the ground at (x, z), turned `headingRad` about world +Y. */
function placed(xM: number, zM: number, headingRad = 0): Transform {
  return Transform.create(Vec3.create(xM, 0, zM), Quat.fromAxisAngle(Vec3.UNIT_Y, headingRad));
}

/**
 * The M3 skatepark: a small plaza on the big flat ground (see `WORLD_CONFIG.park` for
 * the layout). Every obstacle is data; `obstacleGeometry` builds the pieces.
 */
export function createSkateparkLevel(config: WorldConfig = WORLD_CONFIG): Level {
  const park = config.park;
  const ground = createFlatGroundLevel(config.flatGround).obstacles;

  const stairsShape = ObstacleShape.stairs({
    stepCount: park.stairs.stepCount,
    riseM: park.stairs.riseM,
    runM: park.stairs.runM,
    widthM: park.stairs.widthM,
    topDepthM: park.stairs.topDepthM,
    backSlopeRad: park.stairs.backSlopeRad,
    hubba: park.stairs.hubba,
    handrail: park.stairs.handrail,
  });
  const platformM = stairsHeightM(stairsShape);

  const hp = park.halfpipe;
  const qp = ObstacleShape.quarterPipe({
    radiusM: hp.radiusM,
    heightM: hp.heightM,
    widthM: hp.widthM,
    deckDepthM: hp.deckDepthM,
    copingRadiusM: hp.copingRadiusM,
  });
  const halfFlat = hp.flatBottomM / 2;

  const obstacles: Obstacle[] = [
    ...ground,
    {
      id: "stairs",
      name: `${park.stairs.stepCount}-stair`,
      surface: "ground",
      transform: placed(park.stairs.xM, park.stairs.zM),
      shape: stairsShape,
    },
    {
      id: "kicker",
      name: "Kicker",
      surface: "ramp",
      transform: placed(park.kicker.xM, park.kicker.zM),
      shape: ObstacleShape.kicker({
        lengthM: park.kicker.lengthM,
        heightM: park.kicker.heightM,
        widthM: park.kicker.widthM,
      }),
    },
    {
      id: "ledge",
      name: "Ledge",
      surface: "ledge",
      transform: placed(park.ledge.xM, park.ledge.zM),
      shape: ObstacleShape.ledge({
        lengthM: park.ledge.lengthM,
        depthM: park.ledge.depthM,
        heightM: park.ledge.heightM,
        edgeChamferM: park.ledge.edgeChamferM,
      }),
    },
    {
      id: "flat-rail",
      name: "Flat rail",
      surface: "grindable",
      transform: placed(park.rail.xM, park.rail.zM),
      shape: ObstacleShape.rail({
        lengthM: park.rail.lengthM,
        heightM: park.rail.heightM,
        barRadiusM: park.rail.barRadiusM,
        profile: "round",
      }),
    },
    {
      id: "bank",
      name: "Bank",
      surface: "ramp",
      transform: placed(park.bank.xM, park.bank.zM),
      shape: ObstacleShape.bank({
        angleRad: park.bank.angleRad,
        lengthM: park.bank.lengthM,
        widthM: park.bank.widthM,
      }),
    },
    {
      id: "qp-east",
      name: "Quarter pipe (east)",
      surface: "ramp",
      transform: placed(hp.xM + halfFlat, hp.zM),
      shape: qp,
    },
    {
      id: "qp-west",
      name: "Quarter pipe (west)",
      surface: "ramp",
      // Turned 180° about +Y: it rises toward world −X, facing qp-east.
      transform: placed(hp.xM - halfFlat, hp.zM, Math.PI),
      shape: qp,
    },
  ];

  return Level.create({
    id: "park",
    name: "Skatepark",
    obstacles,
    spawn: {
      positionM: Vec3.create(park.stairs.xM - park.spawnRunUpM, platformM, park.stairs.zM),
      headingRad: park.spawnHeadingRad,
    },
  });
}
