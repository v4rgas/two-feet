import { groundObstacle, Level, ObstacleShape } from "../../../contexts/world";
import { deepFreeze, Quat, Transform, Vec3 } from "../../../shared";

/*
 * THE DESK SET (promo only, never a map): the in-game double of the fingerboard clip that
 * opens the LinkedIn promo. A short round rail on open ground, in the proportions the real
 * clip's rail has next to the board (a real fingerboard rail is short and low), so the
 * game shot can be laid over the real frame and cut into seamlessly. The camera that
 * matches the real phone is `DESK_CAMERA` (fitted to the footage: promo/linkedin/SCRIPT.md).
 */

export const DESK_SET = deepFreeze({
  ground: { halfSizeM: 80, thicknessM: 1 },
  /** The rail runs along world X; its NEAR end (toward the camera) is at x = 0. */
  rail: { lengthM: 1.0, heightM: 0.225, barRadiusM: 0.02, zM: 0 },
});

/**
 * The camera that matches the real phone, fitted to the fingerboard frame in the promo's
 * 4:5 crop (SCRIPT.md "Camera match"). The real rail's two posts put the horizon at 55.9 %
 * of the frame height and the camera at 0.62 × the bar's underside; the bar's vanishing
 * point (55.5 % across) puts the view 3.4° off the rail; its two ends put the near end
 * 0.535 rail-lengths out, which only a wide lens gives: ≈ 68° vertical over the 4:5 crop
 * (the phone's wide camera). The camera is 0.2 m to the rail's side, so the rail runs in
 * on the left and the board comes at the lens.
 */
export const DESK_CAMERA = deepFreeze(
  deskCamera({
    nearDepthM: 0.535,
    sideM: 0.2,
    heightM: 0.114,
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

/** The rail's centre (the obstacle's origin), world m. */
export const DESK_RAIL_CENTRE_X = -DESK_SET.rail.lengthM / 2;

/** The desk set as a level: the ground and the rail (spawn: overridden by each clip). */
export function createDeskSetLevel(): Level {
  const r = DESK_SET.rail;
  return Level.create({
    id: "promo-desk",
    name: "Promo desk set",
    obstacles: [
      groundObstacle(DESK_SET.ground),
      {
        id: "desk-rail",
        name: "Desk rail",
        surface: "grindable",
        transform: Transform.create(Vec3.create(DESK_RAIL_CENTRE_X, 0, r.zM), Quat.IDENTITY),
        shape: ObstacleShape.rail({
          lengthM: r.lengthM,
          heightM: r.heightM,
          barRadiusM: r.barRadiusM,
          profile: "round",
        }),
      },
    ],
    spawn: { positionM: Vec3.create(-6, 0, 0), headingRad: 0 },
  });
}
