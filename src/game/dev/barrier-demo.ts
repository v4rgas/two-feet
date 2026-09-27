import type { Obstacle } from "../../contexts/world";
import {
  createFlatGroundLevel,
  graffitiOnFace,
  Level,
  ObstacleShape,
  perimeterBarriers,
  WORLD_CONFIG,
} from "../../contexts/world";
import { Quat, Transform, Vec3 } from "../../shared";

/*
 * DEV-ONLY demo (`?level=barrier-demo`): a small plaza ringed by perimeter barriers with
 * sponsor and house banners, an opening on each short side, one ledge, and a couple of
 * graffiti pieces. It shows map authors the barrier / banner / graffiti API; real maps
 * live in src/maps/<id>/ and place their own.
 */

/** Plaza bounds (outer faces of the barriers), m. */
const BOUNDS = { minXM: -14, maxXM: 14, minZM: -9, maxZM: 9 } as const;

export function createBarrierDemoLevel(): Level {
  const ground = createFlatGroundLevel(WORLD_CONFIG.flatGround).obstacles;
  const ring = perimeterBarriers(BOUNDS, {
    idPrefix: "demo-barrier",
    openings: [
      { side: "west", centerM: 0, widthM: 4 },
      { side: "east", centerM: 0, widthM: 4 },
    ],
    // BipBop Labs, v4rgas and the house banners, with a plain (paintable) segment now and then.
    banners: ["bipbop", "v4rgas", "house-deck", null, "bipbop", "v4rgas", "house-feet", null],
  });
  const ledge: Obstacle = {
    id: "demo-ledge",
    name: "Ledge",
    surface: "ledge",
    transform: Transform.create(Vec3.create(2, 0, 0), Quat.IDENTITY),
    shape: ObstacleShape.ledge({ lengthM: 5, depthM: 0.5, heightM: 0.4, edgeChamferM: 0.03 }),
  };
  const plain = ring.filter((o) => o.shape.kind === "barrier" && o.shape.banner === undefined);
  const graffiti = [
    graffitiOnFace(ledge, { pieceId: "v4rgas-throwup", face: "-z", sizeM: 0.7, alongM: -1.2 }),
    graffitiOnFace(ledge, { pieceId: "pixel-penguin", face: "-z", sizeM: 0.34, alongM: 1.3 }),
    ...plain.slice(0, 2).map((o, i) =>
      graffitiOnFace(o, {
        pieceId: i === 0 ? "deck-penguin-roundel" : "penguin-king",
        face: "+z",
        sizeM: i === 0 ? 0.7 : 1.0,
        rotationRad: i === 0 ? 0.05 : -0.04,
      }),
    ),
  ];
  return Level.create({
    id: "barrier-demo",
    name: "Barrier demo",
    obstacles: [...ground, ...ring, ledge],
    spawn: { positionM: Vec3.create(-6, 0, -3), headingRad: 0 },
    graffiti,
  });
}
