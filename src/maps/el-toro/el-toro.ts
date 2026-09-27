import type { Obstacle } from "../../contexts/world";
import { groundObstacle, Level, ObstacleShape, stairsHeightM } from "../../contexts/world";
import { deepFreeze, degToRad, Quat, Transform, Vec3 } from "../../shared";

/*
 * EL TORO: the 20-stair with a handrail (El Toro High School, Lake Forest, CA), a big-drop
 * challenge map. Built only from the world context's obstacle kinds; its parameters live
 * here, in the map's folder (GAME.md "Maps"). No school logo or branding: plain concrete.
 *
 * Layout (world metres, the drop goes toward +X):
 * - The STAIRS: 20 × (0.165 rise, 0.30 run) = a 3.30 m drop over 6 m, 4 m wide, top nosing
 *   on x = 0, foot at x = 6. The handrail runs down the −Z side, 0.38 m above the nosings.
 * - The PLAZA on top: one funbox (a single convex piece, so there is no seam anywhere on
 *   it: ADR 0008), 18 m deep (x ∈ [−18, 0]) and 9 m wide (z ∈ [−3.5, 5.5]), its top
 *   `plazaAboveStairsM` above the stairs' own platform, which it buries: the stairs'
 *   platform edges lie ≥ `seamBuryM` under it, so the lip is the plaza's edge and the first
 *   drop is 0.195 m instead of 0.165 m. Walls on +X (the drop) and −Z; long 10° banks on
 *   −X (the roll-up from behind: arrive already facing the stairs) and +Z (the flank), so R
 *   is not the only way back up. A low planter ledge runs along the top on the −Z side (the
 *   push lane down the middle stays clear), a planter guards the drop edge beside the stairs.
 * - The LANDING: flat ground, ≥ 20 m of clear roll-out past the foot, framed by low
 *   concrete walls and planters (plain ledges, STYLE.md).
 * - SPAWN: on the plaza, 14 m behind the nosing, in the middle of the stairs, facing them.
 */
export const EL_TORO = deepFreeze({
  /** The ground slab under the map. */
  ground: { halfSizeM: 100, thicknessM: 1 },
  stairs: {
    /** Top nosing (the stairs' local origin). */
    xM: 0,
    zM: 0,
    stepCount: 20,
    riseM: 0.165,
    runM: 0.3,
    widthM: 4,
    /** The stairs' own platform: buried under the plaza, so only a stub. */
    topDepthM: 0.3,
    handrail: {
      /**
       * Top of the bar above each nosing, measured VERTICALLY (how a handrail is measured),
       * m: grindable with the ≈ 0.45 m pop. The shape's `heightM` is square to the nosings.
       */
      aboveNosingsM: 0.38,
      barRadiusM: 0.024,
      offsetM: 0.3,
      /**
       * It starts right at the top nosing (a bar reaching back over the plaza would stand
       * higher than the pop beside the approach) and ends 0.15 m past the foot, in the air.
       */
      topOverhangM: 0.05,
      bottomOverhangM: 0.15,
    },
  },
  plaza: {
    /** Flat top from x = −lengthM to the top nosing (x = 0). */
    lengthM: 18,
    minZM: -3.5,
    maxZM: 5.5,
    /**
     * The plaza's top is this far above the stairs' platform (which it buries), m. Must
     * exceed `WORLD_CONFIG.geometry.seamBuryM` (2.5 cm) so the stairs' platform edges are
     * no ghost seams under the wheels (ADR 0008).
     */
    aboveStairsM: 0.03,
    bankAngleRad: degToRad(10),
    edgeChamferM: 0.03,
  },
  spawn: {
    /** Run-up behind the top nosing, m. */
    runUpM: 14,
    zM: 0,
    headingRad: 0,
  },
  /** Low planter ledge along the top, on the −Z side of the push lane (grindable edges). */
  topPlanter: { xM: -9.5, zM: -2.95, lengthM: 11, depthM: 0.6, heightM: 0.4, edgeChamferM: 0.03 },
  /** Planter along the drop edge beside the stairs (+Z): it keeps you off the 3.3 m wall. */
  edgePlanter: {
    xM: -0.55,
    zM: 3.95,
    lengthM: 2.9,
    depthM: 0.8,
    heightM: 0.45,
    edgeChamferM: 0.03,
  },
  /** Campus surroundings at the bottom: low walls and planters (plain concrete ledges). */
  bottom: [
    {
      id: "end-wall",
      name: "Low wall",
      xM: 36,
      zM: 1,
      lengthM: 22,
      depthM: 0.4,
      heightM: 0.55,
      alongZ: true,
    },
    {
      id: "planter-south",
      name: "Planter",
      xM: 20,
      zM: -8,
      lengthM: 18,
      depthM: 1.2,
      heightM: 0.45,
      alongZ: false,
    },
    {
      id: "planter-north",
      name: "Planter",
      xM: 22,
      zM: 12,
      lengthM: 12,
      depthM: 1.2,
      heightM: 0.45,
      alongZ: false,
    },
    {
      id: "bench-wall",
      name: "Low wall",
      xM: 13,
      zM: -5.5,
      lengthM: 5,
      depthM: 0.45,
      heightM: 0.45,
      alongZ: false,
    },
  ],
  bottomChamferM: 0.03,
});

/** El Toro's parameters (deeply readonly). */
export type ElToroParams = typeof EL_TORO;

/** Pose at (x, y, z), turned `headingRad` about world +Y. */
function placed(xM: number, yM: number, zM: number, headingRad = 0): Transform {
  return Transform.create(Vec3.create(xM, yM, zM), Quat.fromAxisAngle(Vec3.UNIT_Y, headingRad));
}

/** Height of the plaza's top above the ground, m. */
export function elToroPlazaHeightM(p: ElToroParams = EL_TORO): number {
  return p.stairs.stepCount * p.stairs.riseM + p.plaza.aboveStairsM;
}

/** Builds the El Toro level (`?map=el-toro`). */
export function createElToroLevel(p: ElToroParams = EL_TORO): Level {
  const ground = [groundObstacle(p.ground)];
  const s = p.stairs;
  const rail = s.handrail;
  const stairs = ObstacleShape.stairs({
    stepCount: s.stepCount,
    riseM: s.riseM,
    runM: s.runM,
    widthM: s.widthM,
    topDepthM: s.topDepthM,
    handrail: {
      heightM: rail.aboveNosingsM * Math.cos(Math.atan2(s.riseM, s.runM)),
      barRadiusM: rail.barRadiusM,
      offsetM: rail.offsetM,
      topOverhangM: rail.topOverhangM,
      bottomOverhangM: rail.bottomOverhangM,
    },
  });
  const plazaY = stairsHeightM(stairs) + p.plaza.aboveStairsM;
  const pl = p.plaza;
  const plazaWidth = pl.maxZM - pl.minZM;
  const ledge = (
    id: string,
    name: string,
    l: {
      readonly xM: number;
      readonly zM: number;
      readonly lengthM: number;
      readonly depthM: number;
      readonly heightM: number;
    },
    yM: number,
    chamferM: number,
    alongZ: boolean,
  ): Obstacle => ({
    id,
    name,
    surface: "ledge",
    // A ledge runs along its local X; turned 90° it runs along world Z.
    transform: placed(l.xM, yM, l.zM, alongZ ? Math.PI / 2 : 0),
    shape: ObstacleShape.ledge({
      lengthM: l.lengthM,
      depthM: l.depthM,
      heightM: l.heightM,
      edgeChamferM: chamferM,
    }),
  });

  const obstacles: Obstacle[] = [
    ...ground,
    {
      id: "stairs",
      name: `${s.stepCount}-stair`,
      surface: "ground",
      transform: placed(s.xM, 0, s.zM),
      shape: stairs,
    },
    {
      id: "plaza",
      name: "Plaza",
      surface: "ground",
      transform: placed(s.xM - pl.lengthM / 2, 0, s.zM + (pl.minZM + pl.maxZM) / 2),
      shape: ObstacleShape.funbox({
        topLengthM: pl.lengthM,
        topWidthM: plazaWidth,
        heightM: plazaY,
        bankAngleRad: pl.bankAngleRad,
        sides: { plusX: "wall", minusX: "bank", plusZ: "bank", minusZ: "wall" },
        edgeChamferM: pl.edgeChamferM,
      }),
    },
    ledge("top-planter", "Planter ledge", p.topPlanter, plazaY, p.topPlanter.edgeChamferM, false),
    ledge("edge-planter", "Planter", p.edgePlanter, plazaY, p.edgePlanter.edgeChamferM, true),
    ...p.bottom.map((b) => ledge(b.id, b.name, b, 0, p.bottomChamferM, b.alongZ)),
  ];

  return Level.create({
    id: "el-toro",
    name: "El Toro",
    obstacles,
    spawn: {
      positionM: Vec3.create(s.xM - p.spawn.runUpM, plazaY, s.zM + p.spawn.zM),
      headingRad: p.spawn.headingRad,
    },
  });
}
