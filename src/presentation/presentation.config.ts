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
    /** Sky: a soft blue zenith over a warm, hazy horizon (the fog colour too)… */
    skyZenith: "#a9c6d8",
    skyHorizon: "#ece3d3",
    /** …and a warm glow around the low sun. */
    sunGlow: "#ffd9a8",
    deck: "#c8553d",
    wheel: "#f4efe3",
    metal: "#9aa0a6",
    frontFoot: "#3d7a3a",
    backFoot: "#3b6ea5",
    warn: "#b54836",
    /** Shoe sole and side stripe: a cream cupsole, a touch warmer than `wheel`. */
    shoeSole: "#efe6d2",
  },
  renderer: {
    /** devicePixelRatio is capped at this (fill-rate budget, REQUIREMENTS §1.9). */
    maxPixelRatio: 2,
    /**
     * `neutral` (Khronos PBR Neutral: keeps base colours, so the palette, the foot colours
     * and the sponsors' brand colours stay true) or `aces` (filmic, more contrast).
     */
    toneMapping: "neutral" as "neutral" | "aces",
    toneMappingExposure: 1.05,
  },
  lighting: {
    sunColor: "#ffead4",
    sunIntensity: 3.4,
    /** Sun elevation above the horizon (low, late afternoon), rad. */
    sunElevationRad: degToRad(28),
    /** Sun azimuth around world +Y (0 = from +X), rad. */
    sunAzimuthRad: degToRad(215),
    /** Distance of the sun from the board it follows, m. */
    sunDistanceM: 12,
    /**
     * Half size of the shadow camera frustum around the board, m. Wide enough that the
     * obstacles around the rider cast shadows too (texel ≈ 3.4 mm at 4096 px).
     */
    shadowHalfExtentM: 7,
    shadowMapSizePx: 4096,
    /** PCF blur radius in texels (soft shadows). */
    shadowRadiusPx: 4,
    shadowBias: -0.0004,
    shadowNormalBias: 0.012,
    /** Sky fill: a cool blue from above, warm concrete bounce from below. */
    hemiSkyColor: "#dfe8ee",
    hemiGroundColor: "#d6d0c3",
    hemiIntensity: 2.0,
    /** Fog blends the far ground into the horizon color, m. */
    fogNearM: 30,
    fogFarM: 130,
    /** Sky dome: gradient curve exponent (lower = the blue starts nearer the horizon). */
    skyGradientPower: 0.55,
    /** Sun glow on the sky dome: tightness (higher = smaller) and strength. */
    sunGlowPower: 6,
    sunGlowStrength: 0.55,
  },
  /**
   * Level surfaces (scene/level-mesh.ts): one shared material per tone. Each has a flat
   * palette colour (used until its CC0 texture set loads, and in tests) and an optional
   * texture set from `public/textures/<set>/` (color + normal + roughness, LICENSES.md).
   * Textures tile in world space: one repeat every `metresPerRepeat`.
   */
  surfaces: {
    /** Anisotropic filtering (capped by the GPU). */
    anisotropy: 8,
    /**
     * Mean of the detail colour maps in linear light (they are neutral grey, mean 0.9
     * sRGB): the palette colour is divided by it, so a textured surface keeps its token.
     */
    detailMeanLinear: 0.79,
    ground: {
      color: "#e9e6df",
      textureSet: "concrete-ground",
      /** One tile per slab (the joints hide the repeat). */
      metresPerRepeat: 3,
      roughness: 0.95,
      metalness: 0,
      normalScale: 0.55,
    },
    body: {
      color: "#c9c4b8",
      textureSet: "concrete-smooth",
      metresPerRepeat: 3,
      roughness: 0.82,
      metalness: 0,
      normalScale: 0.45,
    },
    edge: {
      color: "#8a8478",
      textureSet: "concrete-smooth",
      metresPerRepeat: 3,
      roughness: 0.75,
      metalness: 0,
      normalScale: 0.45,
    },
    metal: {
      color: "#9aa0a6",
      textureSet: "metal-brushed",
      metresPerRepeat: 0.6,
      roughness: 0.5,
      metalness: 0.25,
      normalScale: 0.35,
    },
    /** Banner rim and the fallback colour of a banner face before its art loads. */
    bannerFallback: "#f7f5f0",
    /**
     * Contact shading on walls near the ground (a cheap stand-in for ambient occlusion):
     * vertical faces darken by up to `strength` at y = 0, fading out by `heightM`.
     */
    contactShadeHeightM: 0.35,
    contactShadeStrength: 0.22,
  },
  /** Sponsor banners on barriers (sponsors/): canvas art, see the registry. */
  banners: {
    /** Canvas size of one banner tile, px (5:1, the panel of a 4 m × 0.9 m barrier). */
    widthPx: 2560,
    heightPx: 512,
    roughness: 0.6,
  },
  /** Graffiti decals (graffiti/): canvas art multiplied into the wall. */
  graffiti: {
    /** Longest side of a piece's canvas, px. */
    canvasPx: 1024,
    /** Paint strength: 1 = full colour, lower lets more wall through. */
    opacity: 0.85,
    /** How far the decal quad floats off the wall (plus polygon offset), m. */
    liftM: 0.003,
  },
  ground: {
    /** Spacing of the concrete slab joints drawn on ground surfaces, m. */
    slabJointSpacingM: 3,
    /** Lift of the joint lines above the surface to avoid z-fighting, m. */
    slabJointLiftM: 0.001,
    slabJointOpacity: 0.3,
  },
  board: {
    /** Grip tape thickness on top of the deck, m (visual only, above the collider). */
    gripThicknessM: 0.0008,
    /** Grip tape inset from the deck edge on each side, m. */
    gripInsetM: 0.002,
    /** CC0 grip texture set (public/textures/grip/); one repeat per this much deck, m. */
    gripTextureSet: "grip",
    gripMetresPerRepeat: 0.12,
    gripNormalScale: 1.5,
    /**
     * Nose/tail rounding in the top view, as a fraction of the deck half width
     * (1 = full semicircle). Visual only: the collider tips stay square.
     */
    tipRoundness: 1,
    /** Cross-sections around each rounded tip (more = smoother curve). */
    tipSegments: 10,
    /** Radial segments of a wheel (low-poly facets make the spin readable). */
    wheelSegments: 12,
    /** Wheel spin decay per second while airborne (fraction kept per s). */
    airborneSpinKeepPerS: 0.6,
    /** Deck edge flash after a clean landing, s (STYLE.md: 80 ms). */
    catchFlashS: 0.08,
    catchFlashIntensity: 0.6,
  },
  feet: {
    /**
     * Simple low-poly skate shoe (scene/shoe-geometry.ts), m. Origin at the centre of the sole's
     * bottom face, +X toe, +Y up. Baked at construction (reload to apply).
     */
    shoe: {
      lengthM: 0.28,
      widthM: 0.1,
      /** Top of the collar. */
      heightM: 0.09,
      soleThicknessM: 0.024,
      /** Sole overhang past the upper, all around. */
      soleFlareM: 0.004,
    },
    /**
     * Each toe points at the rider's facing (the toe edge, across the deck), then turns
     * this much toward the nose, rad. Front ~15–25°, back ~5–10° (roughly across the tail).
     */
    frontFootYawRad: degToRad(20),
    backFootYawRad: degToRad(8),
    /**
     * Ankle tilt in the air (STYLE.md): sideways stick (|x|) tilts the shoe about its width
     * axis, the back foot toe down, the front foot toes up, at most this much, rad…
     */
    ankleTiltMaxRad: 0.45,
    /** …smoothed with this time constant, s. */
    ankleTiltResponseS: 0.06,
    /** Tilt pivot: the ball of the foot, as a fraction of the length from the centre toward the toe. */
    ankleBallFraction: 0.25,
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
    fovDeg: 55,
    /** Extra FOV while airborne (STYLE.md: +5°). */
    airborneFovExtraDeg: 5,
    /** Time constant of the FOV ease in/out, s. */
    fovEaseTauS: 0.25,
    /** Board must be airborne at least this long before the FOV widens, s (ignores bumps). */
    airborneFovMinAirS: 0.06,
    /** Close follow: the board and feet fill a good part of the screen (STYLE.md §Camera). */
    distanceBehindM: 1.1,
    heightM: 0.65,
    /** Offset toward the rider's heel side, m (a 3/4 view, so the deck is not end-on). */
    heelSideOffsetM: 0.4,
    /** The camera aims this far ahead of the board, m… */
    lookAheadM: 0.45,
    /** …and this high above the board origin, m. */
    lookHeightM: 0.08,
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
    /** Grind balance bar: the marker warns from this |balance| on (falls off past 1). */
    balanceDanger: 0.75,
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
