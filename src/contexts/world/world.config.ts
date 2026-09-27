import { deepFreeze, degToRad } from "../../shared";

/** Every tunable constant of the `world` context (REQUIREMENTS §2.5). */
export const WORLD_CONFIG = deepFreeze({
  flatGround: {
    /** Half the side of the square ground, m. */
    halfSizeM: 100,
    /** Thickness of the ground box (keeps the collider robust), m. */
    thicknessM: 1,
    /** Board heading at spawn, rad (0 = nose toward world +X). */
    spawnHeadingRad: 0,
  },
  /**
   * Tessellation of the curved shapes. Physics and rendering both build from the same
   * pieces (`obstacleGeometry`), so these values change both at once.
   */
  geometry: {
    /**
     * Largest angle one transition segment may span, rad. Each segment is one convex
     * piece; the kink between two segments is at most this angle (ADR 0008).
     */
    maxSegmentAngleRad: degToRad(4),
    /**
     * How deep the end edge of a ramp piece is buried under its neighbour (or the
     * ground), m. Must exceed the physics engine's contact prediction distance (Rapier:
     * `normalizedPredictionDistance` 0.02 × `lengthUnit` 1 = 2 cm) with margin, or wheels
     * get "ghost" speculative contacts on the seam edges and bounce off (ADR 0008).
     */
    seamBuryM: 0.025,
    /** Smallest kink the seam overlap is sized for (caps the overlap length), rad. */
    minSeamKinkRad: degToRad(1),
    /**
     * Radius of the rounded toe of a funbox or bank-to-ledge bank (a concave fillet from
     * the ground into the bank, tessellated like a transition), m. Big enough that the
     * bank's own sharp toe lies ≥ `seamBuryM` under it (R·(sec(a/2) − 1) ≥ 2.5 cm for 20°).
     */
    bankToeRadiusM: 2,
    /**
     * Radius of the rounded crest where a funbox bank meets the top, m. A board crossing it
     * at v stays on the surface while v²/R < g (up to ≈ 4.4 m/s here).
     */
    // Crest facets use `maxSegmentAngleRad` too: at 2° the facets next to the top are so
    // nearly coplanar with it that Rapier's hull of the points is no longer flat there, and
    // a board chatters across the top.
    bankCrestRadiusM: 2,
    /**
     * Radius of the rounded ridge where two funbox banks meet at a corner (a hip), m. The
     * sharp ridge of two 22° banks is a 31° convex kink across the diagonal.
     */
    hipRidgeRadiusM: 1,
    /** Sides of the polygon that approximates a round coping pipe. */
    copingSides: 12,
    /** How far the top of the coping stands proud of the deck, m. */
    copingRevealM: 0.004,
    /**
     * How far the coping's wall-side facet sits behind the transition wall, m. Flush (a
     * hair behind, to avoid z-fighting): a coping that bulges past the wall slams wheels.
     */
    copingInsetM: 0.001,
    /** Sides of the polygon that approximates a round rail. */
    roundRailSides: 12,
    /** Half the side of a square rail post, m. */
    railPostHalfSizeM: 0.025,
    /** Distance from each end of a rail to the centre of its post, m. */
    railPostInsetM: 0.35,
    /** Perimeter barrier (`barrier` kind): top chamfer and the banner panel's inset, m. */
    barrier: {
      edgeChamferM: 0.025,
      /** How far the banner plate stands proud of the barrier face. */
      bannerPanelThicknessM: 0.012,
      /** Gap between the panel and each end of the barrier. */
      bannerInsetEndsM: 0.12,
      bannerInsetBottomM: 0.1,
      /** Gap between the panel top and the start of the top chamfer. */
      bannerInsetTopM: 0.06,
      /** `perimeterBarriers` defaults: height, thickness and target segment length, m. */
      perimeterHeightM: 0.9,
      perimeterThicknessM: 0.3,
      perimeterSegmentLengthM: 4,
      /** Leftover runs shorter than this (next to an opening or a corner) are dropped, m. */
      perimeterMinSegmentM: 0.6,
    },
  },
  /**
   * The M3 skatepark (`createSkateparkLevel`): a plaza on a big flat ground, laid out
   * along world +X as one line. You spawn on the top platform of a stair set (a slope
   * behind it rolls up from the ground), push, drop the stairs (hubba on the right,
   * handrail on the left), roll away, then kicker → ledge (right) / rail (left) → bank.
   * A mini halfpipe (two quarter pipes facing each other) sits off to the left (−Z).
   * Positions are in world metres; heights are above the ground.
   */
  park: {
    spawnHeadingRad: 0,
    /** Spawn distance behind the top nosing of the stairs (the run-up), m. */
    spawnRunUpM: 6.8,
    stairs: {
      /** Top nosing (local origin) position. The steps go down toward +X. */
      xM: 0,
      zM: 0,
      stepCount: 5,
      riseM: 0.16,
      runM: 0.32,
      widthM: 3.5,
      topDepthM: 8,
      /** Roll-up slope from the ground to the back of the platform. */
      backSlopeRad: degToRad(14),
      /**
       * The flat top reaches 0.9 m back onto the platform, like many real hubbas: a board
       * coming down a little early lands on it instead of its end face (ADR 0012).
       */
      hubba: { widthM: 0.45, heightM: 0.35, edgeRadiusM: 0.02, flatTopM: 0.9 },
      handrail: { heightM: 0.8, barRadiusM: 0.024, offsetM: 0.3 },
    },
    kicker: { xM: 12, zM: 0, lengthM: 1.4, heightM: 0.32, widthM: 1.2 },
    ledge: { xM: 19, zM: 1.8, lengthM: 4, depthM: 0.5, heightM: 0.4, edgeChamferM: 0.03 },
    rail: { xM: 19, zM: -1.8, lengthM: 4, heightM: 0.35, barRadiusM: 0.024 },
    bank: { xM: 26, zM: 0, angleRad: degToRad(20), lengthM: 3, widthM: 6 },
    halfpipe: {
      /** Centre of the flat bottom between the two quarter pipes. */
      xM: 10,
      zM: -12,
      /** Length of the flat bottom between the two toes, m. */
      flatBottomM: 4,
      radiusM: 2.2,
      heightM: 1.3,
      widthM: 5,
      deckDepthM: 1.2,
      copingRadiusM: 0.03,
    },
  },
  /**
   * The contest-style street course (`createStreetCourseLevel`, `?level=street`): a
   * ≈ 53 × 29 m plaza built for lines, with quarter pipes at both short ends (x = ±23.5 m
   * toes). You spawn at the west end on the top landing of the 7-stair (run-up along +X).
   * Every obstacle is placed by its local origin (see `obstacle.ts`); x/z are world metres.
   * Heights stay within the ≈ 0.45 m pop from where you take off (MECHANICS.md).
   */
  street: {
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
  },
});

/** Type of the world config (deeply readonly). */
export type WorldConfig = typeof WORLD_CONFIG;
