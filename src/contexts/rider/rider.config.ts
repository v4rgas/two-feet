import { deepFreeze } from "../../shared";

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
     * Q / E STEER on the ground (not loaded, not in a manual): a lean of this fraction of a
     * full lean, eased in and out over `steerLeanResponseS`, s, added to the carve lean —
     * the same lean → truck steer path. Q turns the travel left, E right.
     */
    steerLeanFraction: 0.8,
    steerLeanResponseS: 0.12,
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
    /**
     * A load carried off a lip still pops if the pop foot leaves its kick within this long
     * after the wheels left (the stick crosses `popReleaseStick` ≈ 25 ms after the key-up);
     * later the load is dropped, so it never pops at the next touchdown, s.
     */
    popLipGraceS: 0.04,
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

    /** A guide-foot swipe ending within this long after the pop flips the board, s. */
    flickWindowS: 0.35,
    /** The flip completes its turns in this fraction of the predicted remaining airtime. */
    flipCompleteFraction: 0.92,
    /**
     * Flip rate cap per turn, rad/s (× 2 for a double): a flip takes most of the air, not
     * a snap — a single on a normal pop turns in ≈ 0.4 s.
     */
    maxFlipRatePerTurnRadps: 16,

    /** A pop-foot swipe ending within this long after the pop shoves the board, s. */
    shoveWindowS: 0.2,
    /** The shove completes its half turns in this fraction of the predicted airtime. */
    shoveCompleteFraction: 0.85,
    /** Shove rate cap per half turn, rad/s (× 2 for a 360). */
    maxShoveRatePerHalfTurnRadps: 9,
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

    /**
     * SWIPE SIZE (MECHANICS.md): a foot's sideways swipe ends when its stick reaches
     * |x| ≥ `swipeEndMin` (the far side) and starts at the opposite extreme within the last
     * `swipeLookbackS` (s, may be before the pop). Travel ≥ `swipeMinTravel` is one unit (a
     * flip, a 180 shove), ≥ `swipeDoubleTravel` two (a double flip, a 360 shove): tap `A`
     * from the middle = kickflip, `D` → `A` edge to edge = double kickflip.
     * `swipeEndMin` is 0.6, not MECHANICS' first guess of 0.8: the smoothed stick of a
     * key tapped for less than 0.1 s peaks below 0.8 (0.05 s → 0.6, 0.08 s → 0.75), so a
     * quick tap would not flip. The travels follow: one unit from the middle (≥ 0.55), two
     * only from a position held on the far edge (x_start ≤ −0.85: ≥ 1.45).
     */
    swipeLookbackS: 0.3,
    swipeEndMin: 0.6,
    swipeMinTravel: 0.55,
    swipeDoubleTravel: 1.45,
    /** How firmly the flip / shove rates are held each step until the catch (0–1). */
    spinHoldAssist: 1,
    /**
     * SPIN SETTLE: as a flip / shove nears its target (N turns / half turns) its held rate
     * eases down — over about `spinSettleS`, s (a deceleration of rate / spinSettleS, so
     * flip and shove settle together) — to `spinCoastRadps`, rad/s, which it keeps past the
     * target until the catch. So near the end the board turns slowly enough for the feet
     * to grab it (|ω| < `catchMaxOmegaRadps`), and an uncaught board keeps turning. Caught
     * before its target, the channel rides on under the feet to the target, slowing to
     * `catchRideInRadps`, rad/s; then the catch correction (torque-limited) takes over.
     */
    spinSettleS: 0.12,
    spinCoastRadps: 5,
    catchRideInRadps: 3,

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

    /**
     * CATCH CONE (MECHANICS.md "Catch": feet, not magic): roll within this of upright, rad…
     */
    catchRollRad: 0.5,
    /** …yaw within this of 0° or 180° from the rider heading (the stance angle), rad… */
    catchYawRad: 0.45,
    /** …pitch within this of level, rad… */
    catchPitchRad: 0.6,
    /** …and the board turning slower than this (feet cannot grab a whipping board), rad/s. */
    catchMaxOmegaRadps: 14,
    /** After a catch attempt outside the cone, Space is locked out this long, s. */
    catchRetryS: 0.15,
    /** Easy mode: releasing every foot key in the air also catches. */
    autoCatchOnRelease: false,
    /**
     * CATCH CORRECTION: a PD (gain `catchAssist`, 0–1) toward level and the nearest stance
     * yaw that settles over about `catchSettleS`, s. Torque-limited: angular acceleration at
     * most `catchMaxAlphaRadps2`, rad/s² (eased in while the feet reach the deck), and at most
     * `catchMaxCorrectionRad` of each axis' error at the catch is corrected, rad; the rest
     * stays, and the landing decides.
     */
    catchAssist: 0.8,
    catchSettleS: 0.18,
    catchMaxAlphaRadps2: 60,
    catchMaxCorrectionRad: 0.35,
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
    /** Edges within this horizontal distance count as a landing for the airtime prediction, m. */
    airtimeEdgeRadiusM: 0.5,
  },
  /**
   * ASSISTS (MECHANICS.md "Assists", ADR 0012): they widen WHEN and WHERE an input counts
   * (catch, lock-on, pop out, flick windows), never how the board moves while riding. One
   * mode: always on, at the values once called `easy` (the pro / normal / easy levels were
   * removed by user decision; ADR 0012 keeps the history). The dev tuning panel edits them.
   */
  assist: {
    /** CATCH BUFFER: a Space pressed up to this long before the board can be caught is held, s. */
    catchBufferS: 0.25,
    /** LATE CATCH: a Space up to this long after touchdown still counts as the catch, s. */
    catchLateS: 0.1,
    /** STANCE-KEY GRACE: ↓ / W held this long before or after the lock-in picks the stance, s. */
    stanceKeyGraceS: 0.25,
    /** SWIPE GRACE: a swipe ending up to this long before the pop is applied to it, s. */
    swipeGraceS: 0.08,
    /** MAGNETISM: a grind edge within this sideways of the predicted path pulls the board, m… */
    magnetReachM: 0.4,
    /** …by a sideways velocity nudge of at most this (net), m/s. */
    magnetMaxMps: 0.35,
    /** LIP CATCH: a board part up to this far below an edge top (rising or level) locks on, m. */
    lipCatchBelowM: 0.1,
    /** ANGLE BANDS: the lock's parallel / perpendicular tolerances widen by this, rad. */
    parallelWidenRad: 0.2,
    perpWidenRad: 0.3,
    /**
     * FLIP-IN CATCH: a board this much further from upright than `grind.lockMaxTiltRad`
     * (still finishing its flip, turning slower than `tricks.catchMaxOmegaRadps`) still
     * locks: the feet catch it onto the edge and the stance is finished with the catch's
     * capped correction, rad.
     */
    lockTiltWidenRad: 1,
    /** SPIN SNAP: a body spin released within this of a stance angle to an edge ahead stops on it, rad. */
    spinSnapRad: 0.5,
    /** POP-OUT FLOOR: a pop out that starts a flip / shove gets at least this airtime per turn, s. */
    popOutMinAirPerTurnS: 0.42,
    /** POP-OUT BUFFER: a load (↓ + S) held this long before the lock-in is kept for the pop out, s. */
    popOutBufferS: 0.2,
    /** BALANCE EASE: the balance drift is cut by this fraction (0.4 → × 0.6)… */
    balanceDriftCut: 0.6,
    /** …during the first this-long of a grind (never more than 1 s), s. */
    balanceEaseS: 1,
    /**
     * The buffered catch fires once every running flip / shove is within this of its
     * target (the well-timed catch: at the end of the rotation), rad…
     */
    catchFireFlipLeftRad: 0.15,
    catchFireShoveLeftRad: 0.4,
    /** …or when the predicted airtime left is below this (catch before touchdown), s. */
    catchFireAirLeftS: 0.1,
    /** The magnet's nudge changes at most this fast (gentle, never a jolt), m/s². */
    magnetAccelMps2: 8,
    /** The magnet acts on the final approach only: this long before the board comes down, s. */
    magnetLeadS: 0.3,
    /** The magnet aims the trucks within this of a grind edge's line, m… */
    magnetGrindBandM: 0.03,
    /** …and a slide's deck part at least this far inside its part of the deck, m. */
    magnetSlideMarginM: 0.03,
    /**
     * Edges ahead (magnet, spin snap): the path is followed this far ahead, s, in steps of
     * this, s; an edge counts where the board centre comes down to this above it, m, within
     * this sideways of it, m.
     */
    approachHorizonS: 1,
    approachStepS: 0.01,
    approachCentreAboveM: 0.06,
    approachMaxOffsetM: 0.8,
    /**
     * STANCE-KEY GRACE before the lock-in counts a ↓ / W held at least this long, s (the
     * level is a short W tap, not a nose press).
     */
    stanceKeyMinHoldS: 0.25,
    /** …and only presses from this long after the pop (not the pop's own release), s. */
    stanceKeyAfterPopS: 0.05,
    /** A body spin slower than this is not snapped, rad/s. */
    spinSnapMinRateRadps: 1,
    /**
     * SWIPE GRACE: a swipe that ended before the pop counts once its foot's stick has been
     * within this of the middle for this long, s (a key still held there is a pre-position).
     */
    graceLetGoStick: 0.25,
    graceLetGoS: 0.03,
    /** FLIP-IN CATCH: the capped correction ends once the stance is within this, rad. */
    flipInDoneRad: 0.1,
    /** LIP CATCH: "level" = the part sinking no faster than this, m/s. */
    lipCatchLevelMps: 0.3,
    /** The balance ease never lasts longer than this, s. */
    balanceEaseMaxS: 1,
    /** A body spin counts as released when its smoothed key is below this. */
    spinSnapReleasedStick: 0.3,
    /** The snap may slow the body up to this × `bodySpinAccelRadps2`. */
    spinSnapAccelScale: 2,
  },
  torso: {
    /** Torso height above the deck when standing, m. */
    heightM: 0.9,
    /** Spring-follow natural frequency, rad/s. */
    followOmegaRadps: 8,
    followDampingRatio: 1,
    /**
     * While a foot is on the deck the torso rides the board exactly (no lag on a push or a
     * carve); a lag left from the air eases out over this time constant on the catch, s.
     */
    attachBlendS: 0.05,
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
    /** Board resting upside down (grip tape down, touching) for this long → bail, s. */
    upsideDownRestS: 0.25,
    /**
     * TOUCHDOWN (MECHANICS.md "Bail: the board goes ragdoll"): in the air for at least
     * `touchdownMinAirS`, a deck / tail / nose touching the ground (not a grind edge) with
     * the board tilted beyond `tricks.landTiltRad` from the contact normal. While it
     * touches, no controller acts; held `touchdownHoldS` it is a bail (a one-step graze of
     * a kick mid-flip is not), s.
     */
    touchdownMinAirS: 0.1,
    touchdownHoldS: 0.05,
    /** Bailed, the torso falls toward this height above the board, m (visual). */
    fallenTorsoHeightM: 0.35,
  },
});

/** The assist tunables (the `assist` block). */
export type AssistTuning = RiderConfig["assist"];

/** Type of the rider config (deeply readonly). */
export type RiderConfig = typeof RIDER_CONFIG;
