import { deepFreeze, degToRad } from "../../shared";

/**
 * Every tunable constant of the `world` context (REQUIREMENTS §2.5): how obstacle kinds are
 * built. The maps' own parameters live in their folders (`src/maps/<id>/`, GAME.md).
 */
export const WORLD_CONFIG = deepFreeze({
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
});

/** Type of the world config (deeply readonly). */
export type WorldConfig = typeof WORLD_CONFIG;
