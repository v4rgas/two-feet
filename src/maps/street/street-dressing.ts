import type {
  GraffitiPlacement,
  Obstacle,
  PerimeterSide,
  QuarterPipeShape,
} from "../../contexts/world";
import {
  graffitiOnFace,
  graffitiOnGround,
  graffitiOnObstacleSurface,
  ObstacleShape,
  perimeterBarriers,
  quarterPipeLipXM,
} from "../../contexts/world";
import { Quat, Transform, Vec3 } from "../../shared";
import type { BannerSpot, StreetConfig } from "./street.config";

/*
 * The street course's dressing (DESIGN.md "Barriers, banners and graffiti"): the
 * perimeter barriers with their sponsor banners, the banner fence on the
 * quarter pipe's deck, and a couple of graffiti pieces. Barriers are solid (never
 * grindable); banners and graffiti are artwork only.
 */

/** A barrier's side (from its `<prefix>-<side>-<n>` id) and its centre along that side. */
function sideOf(o: Obstacle): { side: PerimeterSide; centreM: number } {
  const side = o.id.split("-").at(-2) as PerimeterSide;
  const p = o.transform.positionM;
  return { side, centreM: side === "north" || side === "south" ? p.x : p.z };
}

/** The same barrier with `sponsorId`'s banner on its front (or plain for null). */
function withBanner(o: Obstacle, sponsorId: string | null): Obstacle {
  if (o.shape.kind !== "barrier") return o;
  const { lengthM, heightM, thicknessM } = o.shape;
  return {
    ...o,
    shape: ObstacleShape.barrier({
      lengthM,
      heightM,
      thicknessM,
      ...(sponsorId === null ? {} : { banner: { sponsorId } }),
    }),
  };
}

/** The spot (if any) whose point lies on barrier `o`. */
function spotOn(o: Obstacle, spots: readonly BannerSpot[]): BannerSpot | undefined {
  if (o.shape.kind !== "barrier") return undefined;
  const { side, centreM } = sideOf(o);
  const half = o.shape.lengthM / 2;
  return spots.find((x) => x.side === side && Math.abs(x.atM - centreM) <= half);
}

/**
 * The perimeter ring: the sponsors on their spots; every other segment is plain concrete
 * (so a sponsor never reads as one of a row of logos, and there is wall for graffiti).
 */
export function streetPerimeter(s: StreetConfig): Obstacle[] {
  const p = s.perimeter;
  const ring = perimeterBarriers(p, {
    idPrefix: "barrier",
    heightM: p.heightM,
    thicknessM: p.thicknessM,
    segmentLengthM: p.segmentLengthM,
    openings: p.openings,
  });
  return ring.map((o) => withBanner(o, spotOn(o, p.spots)?.sponsorId ?? null));
}

/**
 * The banner fence standing on the back of the quarter pipe's deck (its front faces the
 * course, −X), so the BipBop Labs banner shows above the deck from the spawn.
 */
export function streetDeckFence(s: StreetConfig, qp: QuarterPipeShape): Obstacle[] {
  const f = s.deckFence;
  const x = s.quarterPipe.toeXM + quarterPipeLipXM(qp) + qp.deckDepthM - f.thicknessM / 2;
  const facingWest = Quat.fromAxisAngle(Vec3.UNIT_Y, -Math.PI / 2);
  return f.segments.map(
    (seg, i): Obstacle => ({
      id: `qp-deck-fence-${i}`,
      name: "Deck fence",
      surface: "ground",
      transform: Transform.create(Vec3.create(x, qp.heightM, seg.zM), facingWest),
      shape: ObstacleShape.barrier({
        lengthM: seg.lengthM,
        heightM: f.heightM,
        thicknessM: f.thicknessM,
        ...(seg.sponsorId === null ? {} : { banner: { sponsorId: seg.sponsorId } }),
      }),
    }),
  );
}

/**
 * The course's graffiti: the 7-stair deck's side wall and the SW corner barrier, the
 * funbox's banks, the quarter pipe's transition and deck, the bank-to-ledge, the hip, the
 * gap platform's top, and the open ground (a landing target, two floor pieces).
 */
export function streetGraffiti(
  s: StreetConfig,
  obstacles: readonly Obstacle[],
): GraffitiPlacement[] {
  const byId = (id: string): Obstacle => {
    const o = obstacles.find((x) => x.id === id);
    if (o === undefined) throw new Error(`street graffiti: no obstacle "${id}"`);
    return o;
  };
  const corner = obstacles.find((o) => {
    if (!o.id.startsWith("barrier-")) return false;
    if (o.shape.kind !== "barrier" || o.shape.banner !== undefined) return false;
    const spot = s.perimeter.spots.find((x) => x.sponsorId === null);
    if (spot === undefined) return false;
    const { side, centreM } = sideOf(o);
    return side === spot.side && Math.abs(spot.atM - centreM) <= o.shape.lengthM / 2;
  });
  const g = s.graffiti;
  return [
    graffitiOnFace(byId("big-stairs"), g.stairDeck),
    ...(corner === undefined ? [] : [graffitiOnFace(corner, g.corner)]),
    ...g.surfaces.map(({ obstacleId, ...o }) =>
      graffitiOnObstacleSurface(byId(obstacleId), { ...o, frame: "world" }),
    ),
    ...g.ground.map((o) => graffitiOnGround(o)),
  ];
}
