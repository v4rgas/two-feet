import { deepFreeze, degToRad } from "../shared";

/**
 * Every tunable constant of the presentation layer (STYLE.md). Colors are the palette
 * tokens; everything else is SI (m, s, rad) unless the name says otherwise.
 * Frozen like every context config; the dev tuning panel edits a `structuredClone`,
 * which the game injects into the renderer so camera/HUD values apply live.
 */
export const PRESENTATION_CONFIG = deepFreeze({
  /** STYLE.md palette tokens. Foot colors are semantic: green = front, blue = back. */
  palette: {
    concrete100: "#e9e6df",
    concrete300: "#c9c4b8",
    concrete600: "#7d786e",
    ink: "#1c1b19",
    skyTop: "#f3d9b1",
    skyBottom: "#cfe0e6",
    deck: "#c8553d",
    wheel: "#f4efe3",
    metal: "#9aa0a6",
    frontFoot: "#3d7a3a",
    backFoot: "#3b6ea5",
    warn: "#b54836",
  },
  renderer: {
    /** devicePixelRatio is capped at this (fill-rate budget, REQUIREMENTS §1.9). */
    maxPixelRatio: 2,
    toneMappingExposure: 1.05,
  },
  lighting: {
    sunColor: "#ffeedc",
    sunIntensity: 3.4,
    /** Sun elevation above the horizon (low, late afternoon), rad. */
    sunElevationRad: degToRad(28),
    /** Sun azimuth around world +Y (0 = from +X), rad. */
    sunAzimuthRad: degToRad(215),
    /** Distance of the sun from the board it follows, m. */
    sunDistanceM: 12,
    /** Half size of the shadow camera frustum around the board, m. */
    shadowHalfExtentM: 4,
    shadowMapSizePx: 2048,
    /** PCF blur radius in texels (soft shadows). */
    shadowRadiusPx: 4,
    shadowBias: -0.0004,
    shadowNormalBias: 0.01,
    hemiSkyColor: "#eef0ea",
    hemiGroundColor: "#d6d0c3",
    hemiIntensity: 2.1,
    /** Fog blends the far ground into the horizon color, m. */
    fogNearM: 25,
    fogFarM: 110,
  },
  ground: {
    /** Spacing of the concrete slab joints drawn on ground surfaces, m. */
    slabJointSpacingM: 3,
    /** Lift of the joint lines above the surface to avoid z-fighting, m. */
    slabJointLiftM: 0.001,
    slabJointOpacity: 0.35,
  },
  board: {
    /** Grip tape thickness on top of the deck, m (visual only, above the collider). */
    gripThicknessM: 0.0008,
    /** Grip tape inset from the deck edge on each side, m. */
    gripInsetM: 0.002,
    /** Radial segments of a wheel (low-poly facets make the spin readable). */
    wheelSegments: 12,
    /** Wheel spin decay per second while airborne (fraction kept per s). */
    airborneSpinKeepPerS: 0.6,
    /** Deck edge flash after a clean landing, s (STYLE.md: 80 ms). */
    catchFlashS: 0.08,
    catchFlashIntensity: 0.6,
  },
  feet: {
    /** Shoe size: across the deck (long axis), along the deck, height, m. */
    shoeLengthM: 0.27,
    shoeWidthM: 0.1,
    shoeHeightM: 0.07,
    shoeCornerRadiusM: 0.018,
    /** Yaw of each shoe relative to the deck's cross axis, rad (duck stance). */
    frontFootYawRad: degToRad(-12),
    backFootYawRad: degToRad(8),
    /** Opacity of a detached (airborne) foot. */
    detachedOpacity: 0.4,
    /** Vertical squash at full pressure (0.15 = 15 % shorter). */
    pressureSquash: 0.15,
    /** "Hint of legs": a short stub from the shoe toward the torso, m. */
    legLengthM: 0.16,
    legRadiusM: 0.032,
    legOpacity: 0.35,
  },
  camera: {
    fovDeg: 60,
    /** Extra FOV while airborne (STYLE.md: +5°). */
    airborneFovExtraDeg: 5,
    /** Time constant of the FOV ease in/out, s. */
    fovEaseTauS: 0.25,
    /** Board must be airborne at least this long before the FOV widens, s (ignores bumps). */
    airborneFovMinAirS: 0.06,
    distanceBehindM: 2.2,
    heightM: 1.2,
    /** Offset toward the rider's heel side, m. */
    heelSideOffsetM: 0.35,
    /** The camera aims this far ahead of the board, m… */
    lookAheadM: 1.2,
    /** …and this high above the board origin, m. */
    lookHeightM: 0.25,
    /** Smooth time of the critically damped position follow, s. */
    positionSmoothTimeS: 0.18,
    /** Smooth time of the look target, s. */
    targetSmoothTimeS: 0.08,
    /** Smooth time of the heading follow, s. */
    headingSmoothTimeS: 0.35,
    /** Below this horizontal speed the camera follows the board's nose instead of travel, m/s. */
    travelHeadingMinSpeedMps: 0.6,
    /** Landing dip (trucks compressing): depth at `landingDipRefSpeedMps` impact, m. */
    landingDipDepthM: 0.06,
    landingDipDurationS: 0.28,
    landingDipRefSpeedMps: 3,
    /** Bail shake (STYLE.md: ≤150 ms). */
    bailShakeDurationS: 0.15,
    bailShakeAmplitudeM: 0.05,
    bailShakeFrequencyHz: 28,
    nearM: 0.05,
    farM: 400,
  },
  hud: {
    /** Trick popup total life (fade in + hold + fade out), s. */
    popupDurationS: 1.2,
    popupFadeInS: 0.12,
    popupFadeOutS: 0.45,
    /** Back-foot stick y at or below this shows the "holding the tail" ring. */
    tailRingStickY: -0.6,
    /** Stick speed that counts as a flick for the trail, 1/s. */
    flickTrailMinSpeedPerS: 6,
    /** How long a flick trail lingers after the flick, s. */
    flickTrailHoldS: 0.25,
    /** Number of trail dots behind the stick dot. */
    flickTrailLength: 6,
    /** Airtime readout stays this long after landing, s. */
    airtimeHoldS: 1.2,
    /** Airtime bar is full at this airtime, s. */
    airtimeFullScaleS: 1,
  },
  debug: {
    /** Arrow length per newton of force, m/N. */
    forceScaleMPerN: 0.002,
    /** Arrow length per N·s of impulse, m/(N·s). */
    impulseScaleMPerNs: 0.12,
    /** Board-internal (wheels, trucks) arrow color. */
    neutralColor: "#8a857b",
    forceShaftRadiusM: 0.004,
    /** Impulses are drawn thicker. */
    impulseShaftRadiusM: 0.009,
    /** Impulses fade over this time, s (STYLE.md: 200 ms). */
    impulseFadeS: 0.2,
    contactSphereRadiusM: 0.009,
    axesLengthM: 0.3,
    /** Max arrows / contact spheres drawn (pool size). */
    maxArrows: 48,
    maxContacts: 32,
    /** Text panel refresh rate, Hz. */
    textRefreshHz: 10,
  },
});

/** Type of the presentation config (deeply readonly). */
export type PresentationConfig = typeof PRESENTATION_CONFIG;
