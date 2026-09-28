import { groundObstacle, Level, ObstacleShape, perimeterBarriers } from "../../../contexts/world";
import { deepFreeze, Quat, Transform, Vec3 } from "../../../shared";

/*
 * THE DESK SET (promo only, never a map): the in-game double of the fingerboard clip that
 * opens the LinkedIn promo. A round rail on open ground whose FAR part has the real rail's
 * proportions next to the board, so the game shot can be laid over the real frame and cut
 * into; the rail then runs on past where the real one ends (out of the matched frame,
 * toward the camera), so the board keeps grinding after the cut while the camera pulls
 * back and reveals the game (a ring of barriers with the sponsors' banners). The camera
 * that matches the phone is `DESK_CAMERA` (fitted to the footage: SCRIPT.md).
 *
 * Scale: the matched geometry is the first fit (a 1.0 m rail, camera 0.535 m out) scaled by
 * 0.8, so the (fixed-size) board reads 25 % bigger in the matched frame, closer to the real
 * board's size next to its rail. Angles and the FOV don't change with the scale.
 */

const SCALE = 0.8;

export const DESK_SET = deepFreeze({
  ground: { halfSizeM: 80, thicknessM: 1 },
  rail: {
    /** The matched part: its far end is x = −this, the real rail's near end is x = 0. */
    matchedLengthM: 1.0 * SCALE,
    /** How far the rail runs on past x = 0 (toward the camera, then past it). */
    extensionM: 4.6,
    heightM: 0.225 * SCALE,
    barRadiusM: 0.02 * SCALE,
    zM: 0,
  },
  /** The barrier ring round the set (banners in view once the camera has pulled back). */
  perimeter: { minXM: -16, maxXM: 18, minZM: -9, maxZM: 9, heightM: 0.9, thicknessM: 0.3 },
});

const r = DESK_SET.rail;
/** The rail's world ends, m. */
export const DESK_RAIL_FAR_X = -r.matchedLengthM;
export const DESK_RAIL_NEAR_X = r.extensionM;

/**
 * The camera that matches the real phone, fitted to the fingerboard frame in the promo's
 * 4:5 crop (SCRIPT.md "Camera match"): the real rail's two posts put the horizon at 55.9 %
 * of the frame height and the camera at 0.62 × the bar's underside; the bar's vanishing
 * point (55.5 % across) puts the view 3.4° off the rail; its two ends put the near end
 * 0.535 rail-lengths out, which only a wide lens gives: ≈ 68° vertical over the 4:5 crop.
 * The camera is 0.2 rail-lengths to the rail's side, so the rail runs in on the left and
 * the board comes at the lens.
 */
export const DESK_CAMERA = deepFreeze(
  deskCamera({
    nearDepthM: 0.535 * SCALE,
    sideM: 0.2 * SCALE,
    heightM: 0.114 * SCALE,
    yawOffRad: 0.0595,
    pitchRad: 0.0793,
    fovDeg: 68.1,
  }),
);

function deskCamera(p: {
  nearDepthM: number;
  sideM: number;
  heightM: number;
  yawOffRad: number;
  pitchRad: number;
  fovDeg: number;
}): { positionM: [number, number, number]; lookAtM: [number, number, number]; fovDeg: number } {
  // Looking back along −X (toward the rail's far end), turned toward +Z by `yawOffRad`: the
  // rail's vanishing point then sits right of centre, the rail on the camera's left.
  const eye: [number, number, number] = [p.nearDepthM, p.heightM, -p.sideM];
  const dir: [number, number, number] = [
    -Math.cos(p.yawOffRad) * Math.cos(p.pitchRad),
    Math.sin(p.pitchRad),
    Math.sin(p.yawOffRad) * Math.cos(p.pitchRad),
  ];
  const d = 3;
  return {
    positionM: eye,
    lookAtM: [eye[0] + dir[0] * d, eye[1] + dir[1] * d, eye[2] + dir[2] * d],
    fovDeg: p.fovDeg,
  };
}

/** The desk set as a level: the ground, the rail and the barrier ring. */
export function createDeskSetLevel(): Level {
  const lengthM = r.matchedLengthM + r.extensionM;
  const p = DESK_SET.perimeter;
  return Level.create({
    id: "promo-desk",
    name: "Promo desk set",
    obstacles: [
      groundObstacle(DESK_SET.ground),
      {
        id: "desk-rail",
        name: "Desk rail",
        surface: "grindable",
        transform: Transform.create(
          Vec3.create((DESK_RAIL_FAR_X + DESK_RAIL_NEAR_X) / 2, 0, r.zM),
          Quat.IDENTITY,
        ),
        shape: ObstacleShape.rail({
          lengthM,
          heightM: r.heightM,
          barRadiusM: r.barRadiusM,
          profile: "round",
        }),
      },
      ...perimeterBarriers(p, {
        idPrefix: "desk-barrier",
        heightM: p.heightM,
        thicknessM: p.thicknessM,
        segmentLengthM: 4,
        banners: [null, "bipbop", null, "v4rgas", null, null],
      }),
    ],
    spawn: { positionM: Vec3.create(-6, 0, 0), headingRad: 0 },
  });
}
