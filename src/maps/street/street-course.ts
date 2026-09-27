import type { Obstacle } from "../../contexts/world";
import {
  groundObstacle,
  Level,
  ObstacleShape,
  stairsHeightM,
  stairsSlopeRad,
} from "../../contexts/world";
import { Quat, Transform, Vec3 } from "../../shared";
import type { StreetConfig } from "./street.config";
import { STREET_CONFIG } from "./street.config";

/** Pose on the ground at (x, z), turned `headingRad` about world +Y. */
function placed(xM: number, zM: number, headingRad = 0): Transform {
  return Transform.create(Vec3.create(xM, 0, zM), Quat.fromAxisAngle(Vec3.UNIT_Y, headingRad));
}

/**
 * The contest-style street course (`?map=street`): a big plaza built for lines, laid out
 * along world X between two quarter pipes (see `STREET_CONFIG`):
 * - west: the 7-stair (hubba each side, handrail down the middle), spawn on its landing;
 * - middle: the funbox (banks on three sides, a ledge on the fourth, a flat rail over the
 *   top and a down rail on the +X bank);
 * - north: a 3-stair with a kinked handrail down its middle, two manual pads, a hip in
 *   the corner;
 * - south: a long ledge, a flat bar, a bank-to-ledge; a euro-gap platform and an up-ledge.
 * Every obstacle is data; `obstacleGeometry` builds the pieces.
 */
export function createStreetCourseLevel(s: StreetConfig = STREET_CONFIG): Level {
  const qpShape = ObstacleShape.quarterPipe({
    radiusM: s.quarterPipes.radiusM,
    heightM: s.quarterPipes.heightM,
    widthM: s.quarterPipes.widthM,
    deckDepthM: s.quarterPipes.deckDepthM,
    copingRadiusM: s.quarterPipes.copingRadiusM,
  });

  const big = s.bigStairs;
  const bigStairs = ObstacleShape.stairs({
    stepCount: big.stepCount,
    riseM: big.riseM,
    runM: big.runM,
    widthM: big.widthM,
    topDepthM: big.topDepthM,
    backSlopeRad: big.backSlopeRad,
    roundedBackSlope: true,
    hubba: big.hubba,
    handrail: big.handrail,
  });

  const fb = s.funbox;
  const small = s.smallStairs;
  const smallStairs = ObstacleShape.stairs({
    stepCount: small.stepCount,
    riseM: small.riseM,
    runM: small.runM,
    widthM: small.widthM,
    topDepthM: small.topDepthM,
    backSlopeRad: small.backSlopeRad,
    roundedBackSlope: true,
  });
  // The kinked rail runs down the middle of the 3-stair: its top flat along the landing,
  // its run down parallel to the nosings, its bottom flat on past the foot; the bar top
  // stays `heightM` above them. (Its posts stand in the stairs, like a real one.)
  const kr = s.kinkedRail;
  const drop = stairsHeightM(smallStairs);
  const downRun = drop / Math.tan(stairsSlopeRad(smallStairs));

  const gap = s.gapPlatform;
  const bl = s.bankLedge;

  const obstacles: Obstacle[] = [
    groundObstacle(s.ground),
    {
      id: "qp-west",
      name: "Quarter pipe (west)",
      surface: "ramp",
      // Turned 180° about +Y: it rises toward world −X.
      transform: placed(-s.quarterPipes.toeXM, 0, Math.PI),
      shape: qpShape,
    },
    {
      id: "qp-east",
      name: "Quarter pipe (east)",
      surface: "ramp",
      transform: placed(s.quarterPipes.toeXM, 0),
      shape: qpShape,
    },
    {
      id: "big-stairs",
      name: `${big.stepCount}-stair`,
      surface: "ground",
      transform: placed(big.xM, big.zM),
      shape: bigStairs,
    },
    {
      id: "funbox",
      name: "Funbox",
      surface: "ramp",
      transform: placed(fb.xM, fb.zM),
      shape: ObstacleShape.funbox({
        topLengthM: fb.topLengthM,
        topWidthM: fb.topWidthM,
        heightM: fb.heightM,
        bankAngleRad: fb.bankAngleRad,
        sides: { plusX: "bank", minusX: "bank", plusZ: "ledge", minusZ: "bank" },
        edgeChamferM: fb.edgeChamferM,
        topRail: fb.topRail,
        bankRail: { side: "plusX", ...fb.bankRail },
      }),
    },
    {
      id: "small-stairs",
      name: `${small.stepCount}-stair`,
      surface: "ground",
      transform: placed(small.xM, small.zM),
      shape: smallStairs,
    },
    {
      id: "kinked-rail",
      name: "Kinked rail",
      surface: "grindable",
      transform: placed(small.xM - kr.flatTopM, small.zM),
      shape: ObstacleShape.kinkedRail({
        flatTopM: kr.flatTopM,
        downRunM: downRun,
        dropM: drop,
        flatBottomM: kr.flatBottomM,
        heightM: kr.heightM,
        barRadiusM: kr.barRadiusM,
      }),
    },
    ...s.manualPads.map(
      (pad): Obstacle => ({
        id: pad.id,
        name: `Manual pad (${Math.round(pad.heightM * 100)} cm)`,
        surface: "ledge",
        transform: placed(pad.xM, pad.zM),
        shape: ObstacleShape.ledge({
          lengthM: pad.lengthM,
          depthM: pad.depthM,
          heightM: pad.heightM,
          edgeChamferM: s.manualPadChamferM,
        }),
      }),
    ),
    {
      id: "hip",
      name: "Hip",
      surface: "ramp",
      transform: placed(s.hip.xM, s.hip.zM),
      shape: ObstacleShape.funbox({
        topLengthM: s.hip.topLengthM,
        topWidthM: s.hip.topWidthM,
        heightM: s.hip.heightM,
        bankAngleRad: s.hip.bankAngleRad,
        sides: { plusX: "wall", minusX: "bank", plusZ: "wall", minusZ: "bank" },
        edgeChamferM: fb.edgeChamferM,
      }),
    },
    {
      id: "long-ledge",
      name: "Long ledge",
      surface: "ledge",
      transform: placed(s.longLedge.xM, s.longLedge.zM),
      shape: ObstacleShape.ledge({
        lengthM: s.longLedge.lengthM,
        depthM: s.longLedge.depthM,
        heightM: s.longLedge.heightM,
        edgeChamferM: s.longLedge.edgeChamferM,
      }),
    },
    {
      id: "flat-bar",
      name: "Flat bar",
      surface: "grindable",
      transform: placed(s.flatBar.xM, s.flatBar.zM),
      shape: ObstacleShape.rail({
        lengthM: s.flatBar.lengthM,
        heightM: s.flatBar.heightM,
        barRadiusM: s.flatBar.barRadiusM,
        profile: "square",
      }),
    },
    {
      id: "bank-ledge",
      name: "Bank to ledge",
      surface: "ramp",
      transform: placed(bl.xM, bl.zM),
      shape: ObstacleShape.bankLedge({
        angleRad: bl.angleRad,
        bankHeightM: bl.bankHeightM,
        widthM: bl.widthM,
        ledgeHeightM: bl.ledgeHeightM,
        ledgeDepthM: bl.ledgeDepthM,
        edgeChamferM: bl.edgeChamferM,
      }),
    },
    {
      id: "gap-platform",
      name: "Gap platform",
      surface: "ground",
      transform: placed(gap.xM, gap.zM),
      // A one-step "stair set": a raised landing with a roll-up slope and a single drop.
      shape: ObstacleShape.stairs({
        stepCount: 1,
        riseM: gap.heightM,
        runM: gap.heightM,
        widthM: gap.widthM,
        topDepthM: gap.topDepthM,
        backSlopeRad: gap.backSlopeRad,
        roundedBackSlope: true,
      }),
    },
    {
      id: "up-ledge",
      name: "Up-ledge",
      surface: "ledge",
      transform: placed(s.upLedge.xM, s.upLedge.zM),
      shape: ObstacleShape.ledge({
        lengthM: s.upLedge.lengthM,
        depthM: s.upLedge.depthM,
        heightM: s.upLedge.heightM,
        edgeChamferM: s.upLedge.edgeChamferM,
      }),
    },
  ];

  return Level.create({
    id: "street",
    name: "Street Course",
    obstacles,
    spawn: {
      positionM: Vec3.create(s.spawn.xM, stairsHeightM(bigStairs), s.spawn.zM),
      headingRad: s.spawn.headingRad,
    },
  });
}
