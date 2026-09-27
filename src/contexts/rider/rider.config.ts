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
    /**
     * The drawn foot (rider frame) moves at most this fast and accelerates at most this
     * hard: ≈ 1.4 cm per 1/120 s step, so a catch or a lift never jumps.
     */
    maxFootSpeedMps: 1.7,
    maxFootAccelMps2: 80,
    /** A catch (or a lift) eases the foot onto the deck (off it) over about this long, s. */
    catchReachS: 0.1,
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

    /** ↓ + set (front foot toward the tail: S) held together at least this long loads a pop, s. */
    loadMinS: 0.05,
    /** Loading longer than this adds nothing, s. */
    loadMaxS: 0.3,
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
    /** How far below the board the ground is looked for (airtime prediction), m. */
    groundProbeM: 10,
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
    /** Fast enough for a double flip (4π) held late in a normal pop. */
    maxFlipRateRadps: 60,

    /** ←/→ (back foot) within this long after the pop shoves the board, s. */
    shoveWindowS: 0.2,
    /** The shove completes 180° in this fraction of the predicted airtime. */
    shoveCompleteFraction: 0.85,
    /** Fast enough for a 360 shove held late in a normal pop. */
    maxShoveRateRadps: 30,
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

    /** The flick key held at least this long makes it a double flip (4π), s. */
    doubleFlickHoldS: 0.12,
    /** The sweep key held at least this long makes it a 360 shove (2π), s. */
    shove360HoldS: 0.12,
    /** How firmly the flip / shove rates are held each step until the catch (0–1). */
    spinHoldAssist: 1,

    /**
     * Body spin (Q / E) in the air: the heading's spin rate eases toward ±this, rad/s, at
     * most this acceleration, rad/s² (also on release, back to 0).
     */
    bodySpinRateRadps: 14,
    bodySpinAccelRadps2: 90,
    /** Wind-up (Q / E while loaded): the shoulders turn up to this, rad, at this rate, rad/s. */
    windUpMaxRad: 0.6,
    windUpRateRadps: 3,
    /** A full wind-up starts the body spin at this rate at the pop, rad/s. */
    windUpSpinRadps: 4,
    /**
     * In the air, the feet steer the board's yaw toward the rider heading (nearest 0/180°)
     * unless a flip or shove is running: yaw PD natural frequency, rad/s.
     */
    bodyFollowOmegaRadps: 20,

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
    /**
     * At the catch the board rises to meet the feet: a vertical velocity that closes this
     * fraction of the sole-to-grip gap over `feet.catchReachS`, capped, m/s.
     */
    catchRiseFraction: 0.6,
    catchMaxRiseMps: 0.8,

    /**
     * Landing: the board's yaw must be within this of the direction of travel (rolls
     * forward) or of its reverse (rolls fakie); otherwise it is too sideways to roll: bail, rad.
     */
    landYawToleranceRad: 0.35,
    /** An uncaught board lands clean only within this tilt, rad. */
    landTiltRad: 0.5,
    /** After touchdown the landing assist damps bounce and rocking for this long, s. */
    landAssistS: 0.15,
    /** Landing assist gain (0–1) and damping rate, 1/s. */
    landAssist: 0.8,
    landDampingPerS: 25,
  },
  /** MECHANICS.md "Grinds and slides" (M4): lock-on, stances, balance, exits. ADR 0009. */
  grind: {
    /** Edges within this distance of the board centre are considered each step, m. */
    queryRadiusM: 3,
    /** A board part this close to an edge (moving toward it) locks on, m. */
    lockDistanceM: 0.06,
    /** Board yaw within this of the edge's direction: a grind (50-50, 5-0, nosegrind), rad. */
    parallelToleranceRad: 0.44,
    /** …within this of square to it: a slide (boardslide, tailslide, noseslide), rad. */
    perpToleranceRad: 0.61,
    /** No lock when the board is tilted more than this from the edge's up (mid-flip), rad. */
    lockMaxTiltRad: 0.7,
    /** A part more than this BELOW the edge line (passing under a rail) does not lock, m. */
    lockBelowM: 0.03,
    /** Friction along the edge, × g: trucks on metal / deck on concrete or steel. */
    grindFrictionG: 0.08,
    slideFrictionG: 0.2,
    /** Below this speed along the edge the friction fades out (a stall holds still), m/s. */
    frictionFadeSpeedMps: 0.05,
    /**
     * LOCK PD: the locked point is driven onto the edge line (in the plane square to the
     * edge, never along it) with this rate, 1/s, capped at `lockMaxSpeedMps`, applied as
     * this fraction of the velocity error per step; gravity square to the edge is carried.
     */
    lockOmegaPerS: 25,
    lockGain: 0.6,
    lockMaxSpeedMps: 1.5,
    /** The locked point floats this far above the edge (no collider contact), m. */
    hoverM: 0.004,
    /** Hanger bottom below the axle (the part that grinds), m. */
    hangerBelowAxleM: 0.01,
    /** One-sided edge (ledge, hubba, coping): the inner wheel rides this far clear of it, m. */
    wheelClearM: 0.006,
    /** Stance PD (pitch, yaw, roll toward the stance): natural frequency, rad/s. */
    stanceOmegaRadps: 25,
    /** 5-0 / nosegrind: the free end up by this, rad. */
    grindPitchRad: 0.16,
    /** Tailslide / noseslide: the free end up by this, rad. */
    slidePitchRad: 0.2,
    /** Boardslide over a top surface: the end over it tilts up so its wheels clear, + this, rad. */
    boardslideClearRad: 0.03,
    /** Deck middle for a boardslide: |along| up to this (clear of the wheels), m. */
    boardslideHalfM: 0.12,
    /** Tail / nose for a slide: |along| from this to the tip, m. */
    kickPartFromM: 0.24,
    /** At the end of an edge, a next edge of the same obstacle starting this close continues the lock, m. */
    continueGapM: 0.25,
    /** After a lock ends, no new lock for this long, s. */
    relockCooldownS: 0.3,
    /** Pop out: extra speed along the edge's outward normal, m/s. */
    popOutSpeedMps: 1,
    /**
     * BALANCE in [−1, 1] (+ = toward the toe side). Its drift rate does a random walk of
     * `balanceDriftPerS`/√s, decaying at `balanceRateDecayPerS`, scaled up by the slope
     * (× `balanceSlopeFactor` per unit of the edge's sin slope), the speed (× 1 +
     * `balanceSpeedFactor` per m/s) and the time on the edge (doubling every
     * `balanceHardenS`); the balance runs away by `balanceInstabilityPerS` × itself. Both
     * feet leaning the same way push it at `balanceAssist` × `balanceLeanRatePerS`.
     */
    balanceDriftPerS: 0.6,
    balanceRateDecayPerS: 1,
    balanceSlopeFactor: 1.5,
    balanceSpeedFactor: 0.1,
    balanceHardenS: 2,
    balanceInstabilityPerS: 0.8,
    balanceAssist: 1,
    balanceLeanRatePerS: 2.5,
    /** Seed of the balance's random walk (mixed with the lock's step count). */
    balanceSeed: 20260926,
    /** The board rolls this much toward the side the balance leans, rad (visual). */
    balanceLeanRad: 0.1,
    /** Falling off: the board is pushed toward the fall side at this speed, m/s. */
    fallOffSpeedMps: 0.8,
    /** Edges within this horizontal distance count as a landing for the airtime prediction, m. */
    airtimeEdgeRadiusM: 0.5,
  },
  torso: {
    /** Torso height above the deck when standing, m. */
    heightM: 0.9,
    /** Spring-follow natural frequency, rad/s. */
    followOmegaRadps: 8,
    followDampingRatio: 1,
    /**
     * Rider heading (yaw only) follows the direction of travel (the board's long axis when
     * slow), either way round, while grounded, with this rate constant, 1/s, capped at
     * `headingMaxRateRadps`. Held in the air, so a shove-it spins the board under still feet.
     */
    headingFollowPerS: 12,
    headingMaxRateRadps: 4,
    /** Above this ground speed the heading follows the direction of travel, m/s. */
    headingTravelMinSpeedMps: 0.5,
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
