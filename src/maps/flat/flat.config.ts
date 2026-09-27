import type {
  GraffitiOnGroundOptions,
  PerimeterOpening,
  PerimeterSide,
} from "../../contexts/world";
import { deepFreeze } from "../../shared";

/** A banner on the flat map's ring (see `perimeter.banners`). */
export interface FlatBanner {
  readonly side: PerimeterSide;
  /** World X on the north/south runs, world Z on the east/west runs, m. */
  readonly atM: number;
  readonly sponsorId: string;
}

/** The flat ground (`?map=flat`), also where the tutorial runs. */
export const FLAT_CONFIG = deepFreeze({
  /** The ground slab: 200 × 200 m, 1 m thick, its top at y = 0. */
  ground: { halfSizeM: 100, thicknessM: 1 },
  spawn: { xM: 0, zM: 0, headingRad: 0 },
  /**
   * A small plaza ringed by low barriers (outer faces, world m), so the tutorial doesn't
   * float in a void: 32 × 20 m, the spawn 8 m in from the west run and facing 24 m of
   * open concrete (the tutorial's pushes, ollie and kickflip never reach a wall). A gap
   * behind the spawn leads out onto the open ground.
   */
  perimeter: {
    minXM: -8,
    maxXM: 24,
    minZM: -10,
    maxZM: 10,
    heightM: 0.9,
    thicknessM: 0.3,
    segmentLengthM: 4,
    openings: [{ side: "west", centerM: 0, widthM: 4 }] satisfies PerimeterOpening[],
    /**
     * Two banners on otherwise plain wall: BipBop Labs dead ahead of the spawn, v4rgas
     * on the right as you push.
     */
    banners: [
      { side: "east", atM: 0, sponsorId: "bipbop" },
      { side: "north", atM: 10, sponsorId: "v4rgas" },
    ] satisfies FlatBanner[],
  },
  /**
   * A few floor pieces round the tutorial plaza (STYLE.md "Graffiti"), never in the push
   * lane (z = 0, ahead of the spawn): each reads pushing away from the spawn (up = +X).
   */
  graffiti: [
    { pieceId: "v4rgas-wildstyle", xM: 12, zM: -6, sizeM: 3.2, rotationRad: -Math.PI / 2 },
    { pieceId: "sticker-bomb", xM: 5, zM: 6, sizeM: 1.3, rotationRad: -Math.PI / 2 },
    { pieceId: "tag-scribbles", xM: 19, zM: 5.5, sizeM: 1.8, rotationRad: -Math.PI / 2 },
    { pieceId: "pixel-penguin", xM: -4.5, zM: -5, sizeM: 1, rotationRad: -Math.PI / 2 },
  ] satisfies GraffitiOnGroundOptions[],
});

/** Type of the flat map's parameters (deeply readonly). */
export type FlatConfig = typeof FLAT_CONFIG;
