import type { Obstacle } from "../../contexts/world";
import { groundObstacle, Level, ObstacleShape, stairsHeightM } from "../../contexts/world";
import { Quat, Transform, Vec3 } from "../../shared";
import type { Block, ElToroParams, Rect } from "./el-toro.config";
import { EL_TORO } from "./el-toro.config";
import { elToroFence, elToroGraffiti, elToroWallBanners } from "./el-toro-dressing";

export type { Block, ElToroParams, Rect } from "./el-toro.config";
export { EL_TORO } from "./el-toro.config";

/*
 * EL TORO: the 20-stair (El Toro High School, Lake Forest, CA), a big-drop challenge map
 * set in a school: an upper quad framed by one-storey classroom blocks, with a covered
 * walkway and lunch tables; the 20-stair (a handrail down each side) into a lower
 * courtyard with a long roll-out; a 10° walkway ramp back up along the north retaining
 * wall; and the smaller spots a real campus has (a 4-stair off a lower terrace, a planter
 * ledge, a curb), all inside the school fence line (sponsor banners on its
 * barriers, banner boards on the retaining walls, graffiti on walls, floors and the ramp:
 * `el-toro-dressing.ts`). Built only from the world context's obstacle kinds; the parameters are
 * in `el-toro.config.ts`, the research and the choices in DESIGN.md.
 *
 * Seams (ADR 0008): the quad and the terrace are each ONE funbox piece that buries its
 * stair set's platform 3 cm under its top, and the ramp's landing buries the quad's edge
 * 3 cm under it, so no riding surface ever meets another flush.
 */

/** Pose at (x, y, z), turned `headingRad` about world +Y. */
function placed(xM: number, yM: number, zM: number, headingRad = 0): Transform {
  return Transform.create(Vec3.create(xM, yM, zM), Quat.fromAxisAngle(Vec3.UNIT_Y, headingRad));
}

const midX = (r: Rect): number => (r.minXM + r.maxXM) / 2;
const midZ = (r: Rect): number => (r.minZM + r.maxZM) / 2;

/** Height of the upper quad's top above the ground, m. */
export function elToroPlazaHeightM(p: ElToroParams = EL_TORO): number {
  return p.stairs.stepCount * p.stairs.riseM + p.plaza.aboveStairsM;
}

/** Height of the lower terrace's top above the ground, m. */
export function elToroTerraceHeightM(p: ElToroParams = EL_TORO): number {
  const s = p.terrace.stairs;
  return s.stepCount * s.riseM + p.terrace.aboveStairsM;
}

/** A plain concrete block standing on `yM`: a ledge kind (chamfered, grindable top edges). */
function block(b: Block, yM: number, chamferM: number): Obstacle {
  // A ledge runs along its local X; the long side of the block picks the turn.
  const lengthX = b.maxXM - b.minXM;
  const depthZ = b.maxZM - b.minZM;
  const alongZ = depthZ > lengthX;
  return {
    id: b.id,
    name: b.name,
    surface: "ledge",
    transform: placed(midX(b), yM, midZ(b), alongZ ? Math.PI / 2 : 0),
    shape: ObstacleShape.ledge({
      lengthM: alongZ ? depthZ : lengthX,
      depthM: alongZ ? lengthX : depthZ,
      heightM: b.heightM,
      edgeChamferM: chamferM,
    }),
  };
}

/** The lunch tables: per set, a table between two benches. */
function lunchBlocks(p: ElToroParams): Block[] {
  const l = p.lunch;
  const out: Block[] = [];
  l.sets.forEach((set, i) => {
    const x0 = set.xM - l.lengthM / 2;
    const x1 = set.xM + l.lengthM / 2;
    const n = i + 1;
    const slab = (id: string, name: string, zM: number, depthM: number, heightM: number) => ({
      id,
      name,
      minXM: x0,
      maxXM: x1,
      minZM: zM - depthM / 2,
      maxZM: zM + depthM / 2,
      heightM,
    });
    out.push(
      slab(`lunch-table-${n}`, "Lunch table", set.zM, l.table.depthM, l.table.heightM),
      slab(`lunch-bench-${n}a`, "Bench", set.zM - l.bench.offsetM, l.bench.depthM, l.bench.heightM),
      slab(`lunch-bench-${n}b`, "Bench", set.zM + l.bench.offsetM, l.bench.depthM, l.bench.heightM),
    );
  });
  return out;
}

/** The covered walkway's posts and roof (blocks on the quad; the roof floats on them). */
function walkwayBlocks(p: ElToroParams, quadY: number): { block: Block; yM: number }[] {
  const w = p.walkway;
  const half = w.postSizeM / 2;
  const posts = w.postXsM.map((x, i) => ({
    block: {
      id: `walkway-post-${i + 1}`,
      name: "Walkway post",
      minXM: x - half,
      maxXM: x + half,
      minZM: w.postZM - half,
      maxZM: w.postZM + half,
      heightM: w.roofUnderM,
    },
    yM: quadY,
  }));
  return [
    ...posts,
    {
      block: { id: "walkway-roof", name: "Walkway roof", ...w.roof, heightM: w.roofThicknessM },
      yM: quadY + w.roofUnderM,
    },
  ];
}

/** Builds the El Toro level (`?map=el-toro`). */
export function createElToroLevel(p: ElToroParams = EL_TORO): Level {
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
      bothSides: rail.bothSides,
    },
  });
  const quadY = stairsHeightM(stairs) + p.plaza.aboveStairsM;
  const pl = p.plaza;
  const ramp = p.adaRamp;
  const rampW = ramp.landing.maxZM - ramp.landing.minZM;
  const t = p.terrace;
  const smallStairs = ObstacleShape.stairs({
    stepCount: t.stairs.stepCount,
    riseM: t.stairs.riseM,
    runM: t.stairs.runM,
    widthM: t.maxZM - t.minZM,
    topDepthM: t.stairs.topDepthM,
  });
  const terraceY = stairsHeightM(smallStairs) + t.aboveStairsM;

  const obstacles: Obstacle[] = [
    groundObstacle(p.ground),
    {
      id: "stairs",
      name: `${s.stepCount}-stair`,
      surface: "ground",
      transform: placed(s.xM, 0, s.zM),
      shape: stairs,
    },
    {
      id: "plaza",
      name: "Upper quad",
      surface: "ground",
      transform: placed(midX(pl), 0, midZ(pl)),
      shape: ObstacleShape.funbox({
        topLengthM: pl.maxXM - pl.minXM,
        topWidthM: pl.maxZM - pl.minZM,
        heightM: quadY,
        // Only the bank angle's value is unused: every side is a wall.
        bankAngleRad: ramp.angleRad,
        sides: { plusX: "wall", minusX: "wall", plusZ: "wall", minusZ: "wall" },
        edgeChamferM: pl.edgeChamferM,
      }),
    },
    {
      id: "ada-ramp",
      name: "Walkway ramp",
      surface: "ground",
      transform: placed(midX(ramp.landing), 0, midZ(ramp.landing)),
      shape: ObstacleShape.funbox({
        topLengthM: ramp.landing.maxXM - ramp.landing.minXM,
        topWidthM: rampW,
        heightM: quadY + ramp.aboveQuadM,
        bankAngleRad: ramp.angleRad,
        sides: { plusX: "bank", minusX: "wall", plusZ: "wall", minusZ: "wall" },
        edgeChamferM: ramp.edgeChamferM,
        bankRail: {
          side: "plusX",
          zM: rampW / 2 - ramp.rail.insetM,
          flatM: ramp.rail.flatM,
          heightM: ramp.rail.heightM,
          barRadiusM: ramp.rail.barRadiusM,
        },
      }),
    },
    {
      id: "terrace",
      name: "Lower terrace",
      surface: "ground",
      transform: placed(midX(t), 0, midZ(t)),
      shape: ObstacleShape.funbox({
        topLengthM: t.maxXM - t.minXM,
        topWidthM: t.maxZM - t.minZM,
        heightM: terraceY,
        bankAngleRad: t.bankAngleRad,
        sides: { plusX: "bank", minusX: "wall", plusZ: "bank", minusZ: "wall" },
        edgeChamferM: t.edgeChamferM,
      }),
    },
    {
      // Down toward −X off the terrace's west edge: turned half a turn.
      id: "small-stairs",
      name: `${t.stairs.stepCount}-stair`,
      surface: "ground",
      transform: placed(t.minXM, 0, midZ(t), Math.PI),
      shape: smallStairs,
    },
    ...p.buildings.map((b) => block(b, 0, p.chamferM)),
    ...walkwayBlocks(p, quadY).map(({ block: b, yM }) => block(b, yM, p.chamferM)),
    ...p.quad.map((b) => block(b, quadY, p.chamferM)),
    ...lunchBlocks(p).map((b) => block(b, quadY, p.chamferM)),
    ...p.courtyard.map((b) => block(b, 0, b.id === "curb" ? p.curbChamferM : p.chamferM)),
    ...elToroWallBanners(p, pl.maxXM),
    ...elToroFence(p),
  ];

  return Level.create({
    id: "el-toro",
    name: "El Toro",
    obstacles,
    graffiti: elToroGraffiti(p, obstacles),
    spawn: {
      positionM: Vec3.create(s.xM - p.spawn.runUpM, quadY, s.zM + p.spawn.zM),
      headingRad: p.spawn.headingRad,
    },
  });
}
