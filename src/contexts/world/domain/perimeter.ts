import { Quat, Transform, Vec3 } from "../../../shared";
import type { WorldConfig } from "../world.config";
import { WORLD_CONFIG } from "../world.config";
import type { BarrierBannerSides, Obstacle } from "./obstacle";
import { ObstacleShape } from "./obstacle";

/*
 * PERIMETER (pure). Rings a map's rectangular bounds with `barrier` segments, leaving
 * openings where the map wants them, and hands out banners along the way. The barriers
 * stand just INSIDE the bounds with their front (local +Z, the banner side) facing in.
 */

/** A side of the bounds: north = +Z edge, south = −Z, east = +X, west = −X. */
export type PerimeterSide = "north" | "south" | "east" | "west";

/** The rectangle to ring, world metres (the outer faces of the barriers lie on it). */
export interface PerimeterBounds {
  readonly minXM: number;
  readonly maxXM: number;
  readonly minZM: number;
  readonly maxZM: number;
}

/**
 * A gap in the ring. `centerM` is the world X of its centre on the north/south sides,
 * the world Z on the east/west sides.
 */
export interface PerimeterOpening {
  readonly side: PerimeterSide;
  readonly centerM: number;
  readonly widthM: number;
}

export interface PerimeterOptions {
  /** Obstacle ids are `<idPrefix>-<side>-<n>`. Default `barrier`. */
  readonly idPrefix?: string;
  /** Default `WORLD_CONFIG.geometry.barrier.perimeterHeightM`. */
  readonly heightM?: number;
  readonly thicknessM?: number;
  /** Target segment length; each straight run is split evenly near it. */
  readonly segmentLengthM?: number;
  readonly openings?: readonly PerimeterOpening[];
  /**
   * Banner sponsor ids handed out to the segments in ring order (south west→east, east,
   * north east→west, west), cycling; `null` leaves a segment plain. Default: none.
   */
  readonly banners?: readonly (string | null)[];
  readonly bannerSides?: BarrierBannerSides;
  /** Which sides get barriers. Default all four. */
  readonly sides?: readonly PerimeterSide[];
}

type BarrierConfig = WorldConfig["geometry"]["barrier"];

interface SideFrame {
  readonly side: PerimeterSide;
  /** World start and end of the side's run, along its axis (ring order). */
  readonly fromM: number;
  readonly toM: number;
  /** World point on the side's centre line at axis coordinate `a`. */
  readonly at: (a: number) => Vec3;
  /** Rotation about +Y that turns local +Z (the front) inward. */
  readonly headingRad: number;
}

const RING: readonly PerimeterSide[] = ["south", "east", "north", "west"];

function sideFrames(b: PerimeterBounds, t: number): Record<PerimeterSide, SideFrame> {
  const half = t / 2;
  return {
    // North/south run the full width; east/west fit between them (no overlap at corners).
    south: {
      side: "south",
      fromM: b.minXM,
      toM: b.maxXM,
      at: (x) => Vec3.create(x, 0, b.minZM + half),
      headingRad: 0,
    },
    east: {
      side: "east",
      fromM: b.minZM + t,
      toM: b.maxZM - t,
      at: (z) => Vec3.create(b.maxXM - half, 0, z),
      headingRad: -Math.PI / 2,
    },
    north: {
      side: "north",
      fromM: b.maxXM,
      toM: b.minXM,
      at: (x) => Vec3.create(x, 0, b.maxZM - half),
      headingRad: Math.PI,
    },
    west: {
      side: "west",
      fromM: b.maxZM - t,
      toM: b.minZM + t,
      at: (z) => Vec3.create(b.minXM + half, 0, z),
      headingRad: Math.PI / 2,
    },
  };
}

/** The parts of [lo, hi] not covered by the openings, in ascending order. */
function openRuns(lo: number, hi: number, gaps: readonly PerimeterOpening[]): [number, number][] {
  let runs: [number, number][] = [[lo, hi]];
  for (const gap of gaps) {
    const g0 = gap.centerM - gap.widthM / 2;
    const g1 = gap.centerM + gap.widthM / 2;
    runs = runs.flatMap(([a, b]): [number, number][] => {
      if (g1 <= a || g0 >= b) return [[a, b]];
      const out: [number, number][] = [];
      if (g0 > a) out.push([a, g0]);
      if (g1 < b) out.push([g1, b]);
      return out;
    });
  }
  return runs;
}

/**
 * Barrier obstacles ringing `bounds`, split into segments of about `segmentLengthM`, with
 * gaps at `openings`. Every barrier is a `barrier` kind, surface `ground`. Throws a
 * `RangeError` for inverted bounds or bad sizes.
 */
export function perimeterBarriers(
  bounds: PerimeterBounds,
  options: PerimeterOptions = {},
  config: BarrierConfig = WORLD_CONFIG.geometry.barrier,
): Obstacle[] {
  const heightM = options.heightM ?? config.perimeterHeightM;
  const thicknessM = options.thicknessM ?? config.perimeterThicknessM;
  const segmentM = options.segmentLengthM ?? config.perimeterSegmentLengthM;
  if (
    !(bounds.maxXM - bounds.minXM > 2 * thicknessM && bounds.maxZM - bounds.minZM > 2 * thicknessM)
  ) {
    throw new RangeError("perimeterBarriers: bounds must be larger than two barrier thicknesses");
  }
  if (!(segmentM > 0)) throw new RangeError("perimeterBarriers: segmentLengthM must be positive");
  const prefix = options.idPrefix ?? "barrier";
  const wanted = new Set(options.sides ?? RING);
  const banners = options.banners ?? [];
  const frames = sideFrames(bounds, thicknessM);
  const out: Obstacle[] = [];
  let ringIndex = 0;

  for (const side of RING) {
    if (!wanted.has(side)) continue;
    const f = frames[side];
    const dir = Math.sign(f.toM - f.fromM);
    const lo = Math.min(f.fromM, f.toM);
    const hi = Math.max(f.fromM, f.toM);
    const gaps = (options.openings ?? []).filter((o) => o.side === side);
    let runs = openRuns(lo, hi, gaps).filter(([a, b]) => b - a >= config.perimeterMinSegmentM);
    if (dir < 0) runs = runs.map(([a, b]): [number, number] => [b, a]).reverse();
    const rotation = Quat.fromAxisAngle(Vec3.UNIT_Y, f.headingRad);
    let n = 0;
    for (const [a, b] of runs) {
      const length = Math.abs(b - a);
      const count = Math.max(1, Math.round(length / segmentM));
      const step = (b - a) / count;
      for (let i = 0; i < count; i += 1) {
        const sponsor = banners.length > 0 ? banners[ringIndex % banners.length] : null;
        ringIndex += 1;
        const centre = a + step * (i + 0.5);
        out.push({
          id: `${prefix}-${side}-${n}`,
          name: `Barrier (${side})`,
          surface: "ground",
          transform: Transform.create(f.at(centre), rotation),
          shape: ObstacleShape.barrier({
            lengthM: Math.abs(step),
            heightM,
            thicknessM,
            ...(sponsor === null || sponsor === undefined
              ? {}
              : {
                  banner: {
                    sponsorId: sponsor,
                    ...(options.bannerSides === undefined ? {} : { sides: options.bannerSides }),
                  },
                }),
          }),
        });
        n += 1;
      }
    }
  }
  return out;
}
