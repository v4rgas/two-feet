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
      hubba: { widthM: 0.45, heightM: 0.35, edgeRadiusM: 0.02 },
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
});

/** Type of the world config (deeply readonly). */
export type WorldConfig = typeof WORLD_CONFIG;
