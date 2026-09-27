import { deepFreeze, degToRad } from "../../shared";

/**
 * Every tunable constant of the `rider` context (REQUIREMENTS §2.5). SI units.
 * The trick model is MECHANICS.md (assisted physics); ADR 0005 records the tuning.
 */
export const RIDER_CONFIG = deepFreeze({
  feet: {
    /** Rest (neutral-stick) positions in the rider frame, m along the rider's front. */
    frontRestAlongM: 0.12,
    backRestAlongM: -0.2,
    /** Rest position across, m (0 = centre line). */
    restAcrossM: 0,
    /** A full stick moves the foot this far from rest (rider frame), m. */
    reachAlongM: 0.15,
    reachAcrossM: 0.09,
    /** Max foot slide speed over the grip tape, m/s. */
    maxSlideSpeedMps: 2.5,
    /** Detached feet hover this far above the level deck under the torso, m. */
    airLiftM: 0.04,
    /** A back foot this close to (or past) the start of the tail kick is "over the tail", m. */
    tailZoneMarginM: 0.03,
  },
  /** Standing on the board: weight at the feet, carving lean, push (MECHANICS.md "Rolling"). */
  stance: {
    /** Standing weight share pushed down through each attached foot while grounded, N. */
    standingPressN: 25,
    /** Both sticks leaning the same edge by at least this |x| carve. */
    carveMinStickX: 0.15,
    /** Extra weight per foot at full lean, at the foot's (clamped) sideways spot, N. */
    carveLeanN: 80,
    /**
     * Press forces act at most this far off the centre line, m — inside the wheel line
     * (axle track / 2 = 0.09 m), so leaning loads the edge wheels without tipping the board
     * (the rider's mass, which would keep it down, is not simulated).
     */
    pressMaxAcrossM: 0.06,
    /** Push impulse along the rider's heading, N·s. */
    pushImpulseNs: 3,
    /** Minimum time between pushes, s. */
    pushCooldownS: 0.6,
    /** Both sticks within this radius count as "near neutral" for pushing. */
    pushNeutralRadius: 0.3,
    /** No push above this forward speed, m/s. */
    pushMaxSpeedMps: 6,
  },
  /** MECHANICS.md tunables. Assists go from 0 (pure physics) to 1 (full help). */
  tricks: {
    /** A stick past this (toward a key's direction) counts as that key held. */
    keyDownStick: 0.5,
    /**
     * While loaded, the back stick rising above −this counts as ↓ released (the pop). High,
     * so the pop fires ≈ 25 ms after the key-up instead of waiting for the stick to relax.
     */
    popReleaseStick: 0.85,
    /** Both sticks within this radius in the air = "all foot keys released" (catch). */
    releasedRadius: 0.35,

    /** ↓ + set (front foot to the toe edge) held at least this long loads a pop, s. */
    loadMinS: 0.08,
    /** Loading longer than this adds nothing, s. */
    loadMaxS: 0.35,
    /** Pop height (board centre above its rest height) at no / full load, m. */
    popMinHeightM: 0.22,
    popMaxHeightM: 0.45,
    /** The tail snap: nose-up pitch rate right after the pop, rad/s. */
    popPitchRateRadps: 4.5,
    /** Gravity used to predict the airtime (same as the board's world), m/s². */
    gravityMps2: 9.81,
    /**
     * The airtime prediction ends when the board centre is this far above its rest height
     * (a tilted or flipping board touches down with a wheel or an edge earlier), m.
     */
    landingMarginM: 0.06,
    /** Floor of the predicted remaining airtime, so a very late flick is not infinitely fast, s. */
    minAirtimeS: 0.05,

    /** Tail press (↓ alone): PD toward this nose-up pitch, rad. */
    manualPitchRad: 0.16,
    /** Tail press PD natural frequency, rad/s, and its torque cap, N·m. */
    manualOmegaRadps: 40,
    manualMaxTorqueNm: 20,
    /** …and keeps the board straight along the rider heading (yaw PD), rad/s. */
    manualYawOmegaRadps: 10,

    /** W within this long after the pop levels the board (ollie), s. */
    levelWindowS: 0.35,
    /** Level PD gain (0–1) and natural frequency, rad/s. */
    levelAssist: 0.8,
    levelOmegaRadps: 14,
    /** Extra pop height for W right at the pop, fading to 0 at the end of the window. */
    levelHeightBonus: 0.25,

    /** A (toward the heel edge) within this long after the pop flips the board, s. */
    flickWindowS: 0.35,
    /** The flip completes one turn in this fraction of the predicted airtime. */
    flipCompleteFraction: 0.85,
    maxFlipRateRadps: 30,

    /** ←/→ (back foot) within this long after the pop shoves the board, s. */
    shoveWindowS: 0.2,
    /** The shove completes 180° in this fraction of the predicted airtime. */
    shoveCompleteFraction: 0.85,
    maxShoveRateRadps: 20,
    /**
     * Scoop: the shove spins tilted. Peak dip of the scooped kick (far end up) and lean
     * toward the scoop side, reached mid-scoop, rad.
     */
    shoveScoopPitchRad: 0.3,
    shoveScoopRollRad: 0.12,
    /** The scoop lasts this fraction of the 180° spin, then the board is level again. */
    scoopDurationFraction: 0.75,
    /** Scoop tracking PD natural frequency, rad/s. */
    scoopOmegaRadps: 45,

    /** Catch cone: board tilt within this of upright… */
    catchRollRad: 0.7,
    /** …and yaw within this of 0° or 180° from the rider heading. */
    catchYawRad: 0.6,
    /** After a catch attempt outside the cone, Space is locked out this long, s. */
    catchRetryS: 0.15,
    /** Easy mode: releasing every foot key in the air also catches. */
    autoCatchOnRelease: false,
    /** Catch PD gain (0–1) and natural frequency, rad/s: kills spin, levels, snaps yaw. */
    catchAssist: 0.8,
    catchOmegaRadps: 25,

    /** An uncaught board lands clean only within this tilt, rad. */
    landTiltRad: 0.5,
    /** After touchdown the landing assist damps bounce and rocking for this long, s. */
    landAssistS: 0.15,
    /** Landing assist gain (0–1) and damping rate, 1/s. */
    landAssist: 0.8,
    landDampingPerS: 25,
  },
  torso: {
    /** Torso height above the deck when standing, m. */
    heightM: 0.9,
    /** Spring-follow natural frequency, rad/s. */
    followOmegaRadps: 8,
    followDampingRatio: 1,
    /**
     * Rider heading (yaw only) follows the board's long axis (either way round) while
     * grounded with this rate constant, 1/s, capped at `headingMaxRateRadps`. Held in the
     * air, so a shove-it spins the board under still feet.
     */
    headingFollowPerS: 12,
    headingMaxRateRadps: 4,
  },
  bail: {
    /** Both feet detached for longer than this while the board is on its wheels → bail, s. */
    feetDetachedAfterLandingS: 0.35,
    /** A caught landing tilted beyond this (board up vs world up) → bail, rad. */
    maxLandingTiltRad: degToRad(50),
    /** Board resting upside down (grip tape down, touching) for this long → bail, s. */
    upsideDownRestS: 0.25,
  },
});

/** Type of the rider config (deeply readonly). */
export type RiderConfig = typeof RIDER_CONFIG;
