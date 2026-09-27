import type { GraffitiOnFaceOptions, PerimeterSide } from "../../contexts/world";
import { deepFreeze, degToRad } from "../../shared";

/** A sponsor's spot on the fence line (see `fence.spots`). */
export interface BannerSpot {
  readonly side: PerimeterSide;
  readonly atM: number;
  readonly sponsorId: string | null;
}

/*
 * EL TORO's parameters (world metres; the big drop goes toward +X, the top nosing of the
 * 20-stair is on x = 0). The layout and what it borrows from the real spot are in
 * DESIGN.md next to this file. Plain concrete: no school names or logos.
 *
 *            −Z (south)                                          +Z (north)
 *   x = −19 ┌──────────────── back classroom block ─────────────────────┐
 *   x = −16 │ south wing │ UPPER QUAD (3.33 m up, one funbox piece)   │ramp│ north wing
 *           │ (building) │ covered walkway │ push lane │ lunch tables │ top│ (building)
 *   x =   0 └────────────┴──── retaining wall ── 20-STAIR ── wall ────┴────┘
 *   x =   6          4-stair landing ←┐  foot   courtyard   ADA ramp toe ↑
 *   x = 13…19.5   lower terrace + 4-stair   landing lane   curb   planter ledge
 *   x = 23   ─────────────────── fence line (barriers) ─────────────────────
 */

/** An axis-aligned footprint on the ground (or on the quad), m. */
export interface Rect {
  readonly minXM: number;
  readonly maxXM: number;
  readonly minZM: number;
  readonly maxZM: number;
}

/** A plain block (a building, a planter, a table, a post, a low wall), m. */
export interface Block extends Rect {
  readonly id: string;
  readonly name: string;
  readonly heightM: number;
}

const RISE_M = 0.165;
const STEPS = 20;
/** The quad's top above the ground: the 20 risers plus the 3 cm that buries the stairs' platform. */
const QUAD_Y = STEPS * RISE_M + 0.03;
/** One storey of classroom above the quad. */
const BUILDING_H = QUAD_Y + 3.2;

export const EL_TORO = deepFreeze({
  /** The ground slab under the map. */
  ground: { halfSizeM: 80, thicknessM: 1 },
  stairs: {
    /** Top nosing (the stairs' local origin). */
    xM: 0,
    zM: 0,
    stepCount: STEPS,
    riseM: RISE_M,
    runM: 0.3,
    widthM: 4,
    /** The stairs' own platform: buried under the quad, so only a stub. */
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
       * It starts right at the top nosing (a bar reaching back over the quad would stand
       * higher than the pop beside the approach) and ends 0.15 m past the foot, in the air.
       */
      topOverhangM: 0.05,
      bottomOverhangM: 0.15,
      /** One down each side, like the real set after its middle rail came out (DESIGN.md). */
      bothSides: true,
    },
  },
  /** The upper quad: ONE funbox piece (walls all round), so its run-up has no seam (ADR 0008). */
  plaza: {
    minXM: -16,
    /** Its +X edge is the lip, over the top nosing. */
    maxXM: 0,
    minZM: -6,
    maxZM: 6,
    /**
     * The quad's top is this far above the stairs' platform (which it buries), m. Must
     * exceed `WORLD_CONFIG.geometry.seamBuryM` (2.5 cm) so the stairs' platform edges are
     * no ghost seams under the wheels (ADR 0008).
     */
    aboveStairsM: 0.03,
    edgeChamferM: 0.03,
  },
  spawn: {
    /** Run-up behind the top nosing, m. */
    runUpM: 14,
    zM: 0,
    headingRad: 0,
  },
  /**
   * The way back up: a long 10° walkway ramp (ADA-style) along the quad's north retaining
   * wall, from the courtyard (toe near x ≈ 6) up to a landing at the back of the quad. Its
   * landing stands `aboveQuadM` over the quad and overlaps it, so the quad's edge is buried
   * under it and you roll off a 3 cm lip onto the quad (never up a step). A 0.9 m guard rail
   * runs down its outer side, against the north wing.
   */
  adaRamp: {
    landing: { minXM: -16, maxXM: -13, minZM: 5.7, maxZM: 8.5 },
    aboveQuadM: 0.03,
    angleRad: degToRad(10),
    edgeChamferM: 0.03,
    rail: { insetM: 0.15, flatM: 2.4, heightM: 0.9, barRadiusM: 0.024 },
  },
  /**
   * The lower terrace in the courtyard: a raised walk (one funbox piece) with a 4-stair
   * down toward −X (its platform buried under the terrace, like the 20's) and 15° banks on
   * its +X and +Z sides (a hip) to roll up onto it.
   */
  terrace: {
    minXM: 13,
    maxXM: 19.5,
    minZM: -10.4,
    maxZM: -6.4,
    aboveStairsM: 0.03,
    bankAngleRad: degToRad(15),
    edgeChamferM: 0.03,
    stairs: { stepCount: 4, riseM: RISE_M, runM: 0.3, topDepthM: 0.3 },
  },
  chamferM: 0.03,
  /** Classroom blocks framing the quad (one storey above it), m. */
  buildings: [
    {
      id: "building-back",
      name: "Classrooms",
      minXM: -19,
      maxXM: -16,
      minZM: -10.8,
      maxZM: 12.5,
      heightM: BUILDING_H,
    },
    {
      id: "building-south",
      name: "Classrooms",
      minXM: -16,
      maxXM: 0,
      minZM: -10.8,
      maxZM: -6,
      heightM: BUILDING_H,
    },
    {
      id: "building-north",
      name: "Classrooms",
      minXM: -16,
      maxXM: 0,
      minZM: 8.5,
      maxZM: 12.5,
      heightM: BUILDING_H,
    },
  ] satisfies Block[],
  /** The covered walkway along the south wing, on the quad: posts and a flat roof. */
  walkway: {
    postXsM: [-14.5, -11, -7.5, -4],
    postZM: -3.5,
    postSizeM: 0.2,
    roof: { minXM: -16, maxXM: -2.5, minZM: -6, maxZM: -3.2 },
    roofUnderM: 2.7,
    roofThicknessM: 0.15,
  },
  /** On the quad (standing on its top). */
  quad: [
    {
      id: "walkway-bench",
      name: "Bench wall",
      minXM: -15,
      maxXM: -3,
      minZM: -5.9,
      maxZM: -5.35,
      heightM: 0.42,
    },
    {
      id: "quad-planter",
      name: "Planter",
      minXM: -12.5,
      maxXM: -1.2,
      minZM: 5.15,
      maxZM: 5.65,
      heightM: 0.45,
    },
    {
      id: "edge-planter-north",
      name: "Planter",
      minXM: -0.95,
      maxXM: -0.15,
      minZM: 2.9,
      maxZM: 5.65,
      heightM: 0.45,
    },
    {
      id: "edge-planter-south",
      name: "Planter",
      minXM: -0.95,
      maxXM: -0.15,
      minZM: -5.85,
      maxZM: -2.9,
      heightM: 0.45,
    },
  ] satisfies Block[],
  /**
   * Lunch tables on the quad's north side: a concrete table (too tall to grind) between two
   * benches (low ledges), per set; each set centred on (xM, zM).
   */
  lunch: {
    sets: [
      { xM: -9.5, zM: 4.2 },
      { xM: -5.5, zM: 4.2 },
    ],
    lengthM: 1.8,
    table: { depthM: 0.8, heightM: 0.72 },
    bench: { depthM: 0.32, heightM: 0.44, offsetM: 0.74 },
  },
  /** In the courtyard (on the ground). */
  courtyard: [
    {
      id: "cheek-planter-north",
      name: "Planter",
      minXM: 1,
      maxXM: 5,
      minZM: 3,
      maxZM: 5.4,
      heightM: 0.45,
    },
    {
      id: "cheek-planter-south",
      name: "Planter",
      minXM: 1,
      maxXM: 5,
      minZM: -5.4,
      maxZM: -3,
      heightM: 0.45,
    },
    // The planter ledge: a raised bed whose 0.42 m concrete wall is the ledge (a 50-50).
    {
      id: "planter-ledge",
      name: "Planter ledge",
      minXM: 8,
      maxXM: 14,
      minZM: 9.6,
      maxZM: 11.2,
      heightM: 0.38,
    },
    // The curb between the landing walk and the courtyard.
    {
      id: "curb",
      name: "Curb",
      minXM: 9,
      maxXM: 19,
      minZM: 4,
      maxZM: 4.25,
      heightM: 0.15,
    },
  ] satisfies Block[],
  curbChamferM: 0.02,
  /**
   * The school fence line round the courtyard: `barrier` segments (solid, never grindable)
   * on its east (x 23–23.3, behind the roll-out), north (z 12.5–12.8) and south
   * (z −11.1…−10.8) sides; the quad and the classroom blocks close the west. Ids are
   * `fence-<side>-<n>`.
   */
  fence: {
    bounds: { minXM: 0, maxXM: 23.3, minZM: -11.1, maxZM: 12.8 },
    sides: ["south", "east", "north"] satisfies PerimeterSide[],
    heightM: 0.9,
    thicknessM: 0.3,
    segmentLengthM: 4,
    /**
     * The sponsors' spots: the segment on `side` spanning `atM` (world X on north/south,
     * world Z on east) carries `sponsorId`. BipBop Labs and v4rgas side by side on the
     * east fence, square to the drop (the backdrop seen from the top of the stairs and in
     * the montage), and again on the north fence behind the planter ledge.
     */
    spots: [
      { side: "east", atM: -1, sponsorId: "bipbop" },
      { side: "east", atM: 2.8, sponsorId: "v4rgas" },
      { side: "north", atM: 13.6, sponsorId: "bipbop" },
      { side: "north", atM: 9.7, sponsorId: "v4rgas" },
    ] satisfies BannerSpot[],
    /** Every other segment, in ring order: mostly plain, a house banner now and then. */
    rhythm: [null, "house-deck", null, null, "house-feet", null],
    /** Only segments this long carry a banner (the art is a ≈ 5:1 tile on a 0.9 m wall). */
    bannerSegmentM: { min: 3.4, max: 4.5 },
  },
  /**
   * Banner boards on the quad's retaining walls beside the stairs (x = 0), facing the
   * courtyard: thin `barrier` plates fixed to the wall between the handrail approaches
   * (|z| ≤ 2.7) and the ramp, below the lip. Sized to the art's 5:1 tile.
   */
  wallBanners: {
    heightM: 0.7,
    thicknessM: 0.08,
    /** Height of the board's bottom above the courtyard, m. */
    baseYM: 1.9,
    boards: [
      { id: "wall-banner-north", zM: 4.2, lengthM: 2.8, sponsorId: "bipbop" },
      { id: "wall-banner-south", zM: -4.2, lengthM: 2.8, sponsorId: "v4rgas" },
    ],
  },
  /** A couple of graffiti pieces (STYLE.md): walls only, never the stairs or a riding surface. */
  graffiti: {
    /** The south wing's end wall (x = 0), the backdrop of the 4-stair's landing. */
    endWall: {
      pieceId: "v4rgas-throwup",
      face: "+x",
      sizeM: 1.8,
      heightM: 1.5,
    } satisfies GraffitiOnFaceOptions,
    /** The quad's north retaining wall above the walkway ramp (at world x ≈ −4). */
    rampWall: {
      pieceId: "penguin-king",
      face: "+z",
      sizeM: 1,
      alongM: 4,
      heightM: 2.5,
      rotationRad: 0.04,
    } satisfies GraffitiOnFaceOptions,
  },
});

/** El Toro's parameters (deeply readonly). */
export type ElToroParams = typeof EL_TORO;
