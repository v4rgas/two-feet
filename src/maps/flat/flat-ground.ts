import type { Obstacle, PerimeterSide } from "../../contexts/world";
import {
  graffitiOnGround,
  groundObstacle,
  Level,
  ObstacleShape,
  perimeterBarriers,
} from "../../contexts/world";
import { Vec3 } from "../../shared";
import type { FlatConfig } from "./flat.config";
import { FLAT_CONFIG } from "./flat.config";

/**
 * The M1 level: one large ground slab whose top face is the plane y = 0 (nothing else).
 * Scenarios and dev pages that want only the slab use this; the map adds its barriers.
 */
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

/** The ring's barriers, with a banner on each segment that holds one of `perimeter.banners`. */
function flatPerimeter(config: FlatConfig): Obstacle[] {
  const p = config.perimeter;
  const ring = perimeterBarriers(p, {
    idPrefix: "barrier",
    heightM: p.heightM,
    thicknessM: p.thicknessM,
    segmentLengthM: p.segmentLengthM,
    openings: p.openings,
  });
  return ring.map((o) => {
    if (o.shape.kind !== "barrier") return o;
    const side = o.id.split("-").at(-2) as PerimeterSide;
    const pos = o.transform.positionM;
    const centreM = side === "north" || side === "south" ? pos.x : pos.z;
    const half = o.shape.lengthM / 2;
    const banner = p.banners.find((b) => b.side === side && Math.abs(b.atM - centreM) <= half);
    if (banner === undefined) return o;
    const { lengthM, heightM, thicknessM } = o.shape;
    return {
      ...o,
      shape: ObstacleShape.barrier({
        lengthM,
        heightM,
        thicknessM,
        banner: { sponsorId: banner.sponsorId },
      }),
    };
  });
}

/**
 * The flat map (`?map=flat`, where the tutorial runs): the ground slab and a small plaza
 * of low barriers round the spawn, with a few banners and floor graffiti.
 */
export function createFlatMapLevel(config: FlatConfig = FLAT_CONFIG): Level {
  const ground = createFlatGroundLevel(config);
  return Level.create({
    id: ground.id,
    name: ground.name,
    obstacles: [...ground.obstacles, ...flatPerimeter(config)],
    spawn: ground.spawn,
    graffiti: config.graffiti.map((g) => graffitiOnGround(g)),
  });
}
