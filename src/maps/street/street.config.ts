import { deepFreeze, degToRad } from "../../shared";

/**
 * The contest-style street course (`createStreetCourseLevel`, `?map=street`): a
 * ≈ 53 × 29 m plaza built for lines, with quarter pipes at both short ends (x = ±23.5 m
 * toes). You spawn at the west end on the top landing of the 7-stair (run-up along +X).
 * Every obstacle is placed by its local origin (see the world context's `obstacle.ts`);
 * x/z are world metres. Heights stay within the ≈ 0.45 m pop from where you take off
 * (MECHANICS.md).
 */
export const STREET_CONFIG = deepFreeze({
  /** The ground slab under the course. */
  ground: { halfSizeM: 100, thicknessM: 1 },
  spawn: { xM: -14.5, zM: 1, headingRad: 0 },
  quarterPipes: {
    /** Toe of each quarter pipe on ±X (they face each other down the course). */
    toeXM: 23.5,
    radiusM: 2.2,
    heightM: 1.2,
    widthM: 20,
    deckDepthM: 1.2,
    copingRadiusM: 0.03,
  },
  /** Centre stair set: 7 stairs, a hubba on each side, a round handrail down the middle. */
  bigStairs: {
    xM: -8,
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
    handrail: { heightM: 0.38, barRadiusM: 0.024, offsetM: 0.3, centered: true, overhangM: 0 },
  },
  /** Funbox in the middle: banks on −X, +X and −Z, a ledge on +Z, a flat rail and a down rail. */
  funbox: {
    xM: 8,
    zM: 0,
    topLengthM: 6,
    topWidthM: 3,
    heightM: 0.5,
    bankAngleRad: degToRad(20),
    edgeChamferM: 0.03,
    topRail: { zM: -0.7, lengthM: 3, heightM: 0.3, barRadiusM: 0.024 },
    bankRail: { zM: 0.6, flatM: 1.2, heightM: 0.3, barRadiusM: 0.024 },
  },
  /** A 3-stair (north) with a kinked handrail down its middle. */
  smallStairs: {
    xM: -4,
    zM: 9,
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
  manualPads: [
    { id: "manual-pad-low", xM: 7, zM: 9, lengthM: 4, depthM: 1.6, heightM: 0.15 },
    { id: "manual-pad-high", xM: 15, zM: 9, lengthM: 4, depthM: 1.6, heightM: 0.25 },
  ],
  manualPadChamferM: 0.02,
  /** Hip in the north-east corner: two banks meeting at a ridge. */
  hip: {
    xM: 21,
    zM: 13,
    topLengthM: 2,
    topWidthM: 2,
    heightM: 0.7,
    bankAngleRad: degToRad(22),
  },
  longLedge: { xM: -2, zM: -8.5, lengthM: 6, depthM: 0.5, heightM: 0.4, edgeChamferM: 0.03 },
  flatBar: { xM: 8, zM: -8.5, lengthM: 5, heightM: 0.3, barRadiusM: 0.025 },
  bankLedge: {
    /** Toe of the bank; it rises toward +X into the ledge. */
    xM: 15,
    zM: -8.5,
    angleRad: degToRad(25),
    bankHeightM: 0.6,
    widthM: 8,
    ledgeHeightM: 0.3,
    ledgeDepthM: 0.6,
    edgeChamferM: 0.03,
  },
  /** Euro gap: a 0.6 m platform (roll-up slope behind) with a straight drop toward +X. */
  gapPlatform: {
    /** The drop edge. */
    xM: -12,
    zM: -12.5,
    heightM: 0.6,
    widthM: 4,
    topDepthM: 5,
    backSlopeRad: degToRad(14),
  },
  upLedge: { xM: -3.5, zM: -12.5, lengthM: 3, depthM: 3, heightM: 0.3, edgeChamferM: 0.03 },
});

/** Type of the street course's parameters (deeply readonly). */
export type StreetConfig = typeof STREET_CONFIG;
