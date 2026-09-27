import type { GraffitiOnFaceOptions, PerimeterOpening, PerimeterSide } from "../../contexts/world";
import { deepFreeze, degToRad } from "../../shared";

/** A sponsor's spot on the perimeter (see `perimeter.spots`). */
export interface BannerSpot {
  readonly side: PerimeterSide;
  readonly atM: number;
  readonly sponsorId: string | null;
}

/**
 * The contest-style street course (`createStreetCourseLevel`, `?map=street`): a tight
 * ≈ 37 × 22 m plaza built for lines (see `DESIGN.md` for the references and the intent).
 * World X is the long axis; the lanes run along it:
 * - centre lane (z = 0): the 7-stair (spawn on its deck, run-up along +X) → 6.3 m of
 *   roll-out → the funbox (the hub) → the east quarter pipe;
 * - middle lane (z = 4.5): the flat bar, between the two stair sets;
 * - north lane (z = 8.5): the 3-stair with its kinked rail → two manual pads → the hip in
 *   the north-east corner;
 * - south lanes: the long ledge (z = −5); the euro gap → up-ledge → bank-to-ledge in the
 *   south-east corner (z = −9).
 * Every feature leaves ≥ 4 m of roll-out along +X (≥ 6 m after the 7-stair and the gap)
 * and the outline keeps ≈ 1 m inside the planned perimeter (`perimeter`). Every obstacle
 * is placed by its local origin (see the world context's `obstacle.ts`); x/z are world
 * metres. Heights stay within the ≈ 0.45 m pop from where you take off (MECHANICS.md).
 */
export const STREET_CONFIG = deepFreeze({
  /** The ground slab under the course. */
  ground: { halfSizeM: 100, thicknessM: 1 },
  /** On the 7-stair's deck, 6.5 m behind the top nosing, in the lane between rail and hubba. */
  spawn: { xM: -13, zM: 1, headingRad: 0 },
  /**
   * The perimeter barriers (DESIGN.md "Barriers, banners and graffiti"): the outer faces of
   * the ring, world m. Every feature stands ≥ 1 m inside it. The west run sits ≈ 4.7 m
   * behind the toes of the stair decks' roll-up slopes (a flat run-up onto them, and room
   * to carve round from the middle lane); the east run ≈ 4.5 m past the hip's back wall
   * (its roll-out) and ≈ 2 m behind the quarter pipe.
   */
  perimeter: {
    minXM: -23,
    maxXM: 21.5,
    minZM: -12.5,
    maxZM: 11.5,
    heightM: 0.9,
    thicknessM: 0.3,
    segmentLengthM: 4,
    /** Entry gaps (centre: world X on north/south, world Z on east/west). */
    openings: [
      // West: the middle lane, the turn-around between the two stair decks.
      { side: "west", centerM: 4.5, widthM: 3 },
      // North: between the kinked rail's end and the first manual pad.
      { side: "north", centerM: -3.5, widthM: 3 },
      // South: between the up-ledge and the bank-to-ledge.
      { side: "south", centerM: 4, widthM: 3 },
    ] satisfies PerimeterOpening[],
    /**
     * The sponsors' spots: the segment on `side` that spans `atM` (world X on north/south,
     * world Z on east/west) carries `sponsorId`; `null` keeps it plain (for graffiti).
     */
    spots: [
      // v4rgas: the north run behind the manual pads, the funbox and flat-bar backdrop.
      { side: "north", atM: 7.5, sponsorId: "v4rgas" },
      // BipBop Labs: the south run right behind the long ledge.
      { side: "south", atM: 7, sponsorId: "bipbop" },
      // v4rgas: the west run behind the 7-stair deck, seen carving back to the spawn.
      { side: "west", atM: 1, sponsorId: "v4rgas" },
      // Plain: the south-west corner behind the gap platform (graffiti).
      { side: "south", atM: -19, sponsorId: null },
    ] satisfies BannerSpot[],
    /** Every other segment, in ring order: mostly plain, a house banner now and then. */
    rhythm: [null, null, "house-deck", null, null, "house-feet"],
    /** Only segments this long carry a banner (the art is a ≈ 5:1 tile on a 0.9 m wall). */
    bannerSegmentM: { min: 3.4, max: 4.5 },
  },
  /**
   * The deck fence on the quarter pipe: a banner wall standing on the back of its deck,
   * so it rises above the deck (1.2 m) where the ground barrier behind would be hidden.
   * BipBop Labs in the middle, at z = 0: the first thing you see from the spawn, down the
   * main line. Plain concrete on either side.
   */
  deckFence: {
    heightM: 0.9,
    thicknessM: 0.2,
    /** Its segments along the deck (world Z, centred), m, and their banners. */
    segments: [
      { zM: -3.5, lengthM: 3, sponsorId: null },
      { zM: 0, lengthM: 4, sponsorId: "bipbop" },
      { zM: 3.5, lengthM: 3, sponsorId: null },
    ],
  },
  /** A couple of graffiti pieces (STYLE.md): plaza walls, never a riding surface or an edge. */
  graffiti: {
    /** The 7-stair deck's south side wall, seen from the south lane and the euro gap. */
    stairDeck: {
      pieceId: "v4rgas-throwup",
      face: "-z",
      sizeM: 1.3,
      alongM: -3.2,
    } satisfies GraffitiOnFaceOptions,
    /** The funbox's +Z wall, under its ledge edge, facing the flat bar. */
    funbox: {
      pieceId: "deck-penguin-roundel",
      face: "+z",
      sizeM: 0.36,
      alongM: 1.6,
      heightM: 0.22,
    } satisfies GraffitiOnFaceOptions,
    /** The plain barrier in the south-west corner, behind the gap platform. */
    corner: {
      pieceId: "penguin-king",
      face: "+z",
      sizeM: 1,
      rotationRad: -0.04,
    } satisfies GraffitiOnFaceOptions,
  },
  /** One quarter pipe, across the east end (it rises toward +X). */
  quarterPipe: {
    toeXM: 15.8,
    radiusM: 2.2,
    heightM: 1.2,
    widthM: 10,
    deckDepthM: 1.2,
    copingRadiusM: 0.03,
  },
  /** Centre stair set: 7 stairs, a hubba on each side, a round handrail down the middle. */
  bigStairs: {
    xM: -6.5,
    zM: 0,
    stepCount: 7,
    riseM: 0.15,
    runM: 0.33,
    widthM: 4,
    topDepthM: 7,
    backSlopeRad: degToRad(14),
    hubba: { widthM: 0.45, heightM: 0.28, edgeRadiusM: 0.02, flatTopM: 0.9, bothSides: true },
    /**
     * 0.38 m square to the nosings, from over the top nosing to over the foot (no
     * overhang): its top end is ≈ 0.35 m above the landing, within an ollie from it.
     */
    handrail: {
      heightM: 0.38,
      barRadiusM: 0.024,
      offsetM: 0.3,
      centered: true,
      topOverhangM: 0,
      bottomOverhangM: 0,
    },
  },
  /** The hub, in line with the 7-stair: banks on −X, +X and −Z, a ledge on +Z, two rails. */
  funbox: {
    xM: 6.5,
    zM: 0,
    topLengthM: 6,
    topWidthM: 3,
    heightM: 0.5,
    bankAngleRad: degToRad(20),
    edgeChamferM: 0.03,
    topRail: { zM: -0.7, lengthM: 3, heightM: 0.3, barRadiusM: 0.024 },
    bankRail: { zM: 0.6, flatM: 1.2, heightM: 0.3, barRadiusM: 0.024 },
  },
  /** A 3-stair (north lane) with a kinked handrail down its middle. */
  smallStairs: {
    xM: -9,
    zM: 8.5,
    stepCount: 3,
    riseM: 0.15,
    runM: 0.33,
    widthM: 3.6,
    topDepthM: 6.5,
    backSlopeRad: degToRad(12),
  },
  /** Down the middle of the 3-stair (its posts stand on the landing, treads and ground). */
  kinkedRail: {
    flatTopM: 2.5,
    flatBottomM: 2.5,
    /** Height of the bar top above the nosings (and the ground at the bottom flat), m. */
    heightM: 0.35,
    barRadiusM: 0.024,
  },
  /** North lane after the kinked rail: low pad, a push, high pad (a manual line). */
  manualPads: [
    { id: "manual-pad-low", xM: 0.75, zM: 8.5, lengthM: 4, depthM: 1.6, heightM: 0.15 },
    { id: "manual-pad-high", xM: 7, zM: 8.5, lengthM: 4, depthM: 1.6, heightM: 0.25 },
  ],
  manualPadChamferM: 0.02,
  /** Hip in the north-east corner: two banks meeting at a ridge, its walls to the fence. */
  hip: {
    xM: 15.75,
    zM: 9.5,
    topLengthM: 2,
    topWidthM: 2,
    heightM: 0.7,
    bankAngleRad: degToRad(22),
  },
  /** South lane (z = −5): the long ledge, between the stair roll-out and the quarter pipe. */
  longLedge: { xM: 7, zM: -5, lengthM: 6, depthM: 0.5, heightM: 0.4, edgeChamferM: 0.03 },
  /** Middle lane (z = 4.5): the flat bar, between the 7-stair and the 3-stair. */
  flatBar: { xM: 1, zM: 4.5, lengthM: 5, heightM: 0.3, barRadiusM: 0.025 },
  bankLedge: {
    /** Toe of the bank; it rises toward +X into the ledge (the south-east corner). */
    xM: 13,
    zM: -9,
    angleRad: degToRad(25),
    bankHeightM: 0.6,
    widthM: 5,
    ledgeHeightM: 0.3,
    ledgeDepthM: 0.6,
    edgeChamferM: 0.03,
  },
  /** Euro gap: a 0.6 m platform (roll-up slope behind) with a straight drop toward +X. */
  gapPlatform: {
    /** The drop edge. */
    xM: -8,
    zM: -9,
    heightM: 0.6,
    widthM: 4,
    topDepthM: 5,
    backSlopeRad: degToRad(14),
  },
  /** 7 m past the euro gap's drop: ollie (or manual) up onto it, out toward the bank. */
  upLedge: { xM: 0.5, zM: -9, lengthM: 3, depthM: 3, heightM: 0.3, edgeChamferM: 0.03 },
});

/** Type of the street course's parameters (deeply readonly). */
export type StreetConfig = typeof STREET_CONFIG;
