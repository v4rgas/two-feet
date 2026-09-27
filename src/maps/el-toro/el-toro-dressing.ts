import type { GraffitiPlacement, Obstacle, PerimeterSide } from "../../contexts/world";
import {
  graffitiOnFace,
  graffitiOnGround,
  graffitiOnObstacleSurface,
  ObstacleShape,
  perimeterBarriers,
} from "../../contexts/world";
import { Quat, Transform, Vec3 } from "../../shared";
import type { BannerSpot, ElToroParams } from "./el-toro.config";

/*
 * El Toro's dressing (DESIGN.md "Barriers, sponsor banners and graffiti"): the school
 * fence line as `barrier` segments with the sponsor banners, banner boards on
 * the retaining walls beside the stairs, and a couple of graffiti pieces. Barriers are
 * solid (never grindable); banners and graffiti are artwork only.
 */

/** A fence segment's side (from its `fence-<side>-<n>` id) and its centre along it. */
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

/** The fence line: the sponsors on their spots; every other segment is plain concrete. */
export function elToroFence(p: ElToroParams): Obstacle[] {
  const f = p.fence;
  const ring = perimeterBarriers(f.bounds, {
    idPrefix: "fence",
    sides: f.sides,
    heightM: f.heightM,
    thicknessM: f.thicknessM,
    segmentLengthM: f.segmentLengthM,
  });
  return ring.map((o) => withBanner(o, spotOn(o, f.spots)?.sponsorId ?? null));
}

/**
 * The banner boards fixed to the quad's retaining walls beside the stairs (their backs on
 * the wall at x = `wallXM`, their fronts facing the courtyard, +X).
 */
export function elToroWallBanners(p: ElToroParams, wallXM: number): Obstacle[] {
  const w = p.wallBanners;
  const facingEast = Quat.fromAxisAngle(Vec3.UNIT_Y, Math.PI / 2);
  return w.boards.map(
    (b): Obstacle => ({
      id: b.id,
      name: "Banner board",
      surface: "ground",
      transform: Transform.create(
        Vec3.create(wallXM + w.thicknessM / 2, w.baseYM, b.zM),
        facingEast,
      ),
      shape: ObstacleShape.barrier({
        lengthM: b.lengthM,
        heightM: w.heightM,
        thicknessM: w.thicknessM,
        banner: { sponsorId: b.sponsorId },
      }),
    }),
  );
}

/**
 * El Toro's graffiti: the south wing's end wall and the quad's wall above the ramp, the
 * quad floor, the walkway ramp, and the courtyard ground (a landing target, a big piece).
 */
export function elToroGraffiti(
  p: ElToroParams,
  obstacles: readonly Obstacle[],
): GraffitiPlacement[] {
  const byId = (id: string): Obstacle => {
    const o = obstacles.find((x) => x.id === id);
    if (o === undefined) throw new Error(`El Toro graffiti: no obstacle "${id}"`);
    return o;
  };
  return [
    graffitiOnFace(byId("building-south"), p.graffiti.endWall),
    graffitiOnFace(byId("plaza"), p.graffiti.rampWall),
    ...p.graffiti.surfaces.map(({ obstacleId, ...o }) =>
      graffitiOnObstacleSurface(byId(obstacleId), { ...o, frame: "world" }),
    ),
    ...p.graffiti.ground.map((o) => graffitiOnGround(o)),
  ];
}
