import { deepFreeze, degToRad } from "../../shared";

/**
 * Every tunable constant of the `rider` context (REQUIREMENTS §2.5). SI units.
 * Values are first guesses ("tune") until the headless physics scenarios pin them.
 * The gesture → force mapping these feed is described in docs/adr/0004-foot-force-model.md.
 */
export const RIDER_CONFIG = deepFreeze({
  feet: {
    /** Rest (neutral-stick) positions on the deck, m along +X from deck centre. */
    frontRestAlongM: 0.12,
    backRestAlongM: -0.2,
    /** Rest position across the deck, m (0 = centre line). */
    restAcrossM: 0,
    /**
     * Stick full deflection moves the foot this far from rest, m. `reachAcrossM` is a
     * bit more than half the deck width, so a full sideways stick reaches past the edge
     * (|stick.x| ≳ 0.875 with the default 0.21 m deck).
     */
    reachAlongM: 0.18,
    reachAcrossM: 0.12,
    /** Max foot slide speed over the grip tape, m/s. */
    maxSlideSpeedMps: 2.5,
    /** An airborne foot within this distance of its deck spot reattaches, m. */
    catchRadiusM: 0.1,
    /**
     * An attached foot detaches when the deck under it moves faster than this because
     * of board spin (|ω × r|), m/s ("tooFast").
     */
    detachRelativeSpeedMps: 4,
    /** An airborne foot must stay off at least this long before it can reattach, s. */
    reattachMinDetachedS: 0.06,
    /** Feet can only (re)attach while the board's up axis is within this of world up, rad. */
    catchMaxTiltRad: degToRad(35),
    /** In the air, an attached foot detaches ("separated") beyond this board tilt, rad. */
    separateTiltRad: degToRad(70),
    /** …or when its deck spot is this far from where the rider's foot is, m. */
    separateDistanceM: 0.35,
    /** Airborne feet hover this far above their deck spot, m. */
    airLiftM: 0.03,
    /** Half the shoe width: catch damping acts at both shoe edges (gives roll damping), m. */
    shoeHalfWidthM: 0.045,
    /** A foot is "over the tail" when this close to (or past) the start of the tail kick, m. */
    tailZoneMarginM: 0.03,
  },
  forces: {
    /** Rider weight share pushed through one fully-pressed foot, N (tune). */
    footPressN: 250,
    /** Pressure of each attached foot with neutral sticks while grounded, [0, 1] (tune). */
    standingPressure: 0.1,
    /** Grip-tape friction coefficient (shoe vs grip). */
    gripFrictionCoeff: 1.1,

    /**
     * Pop impulse on the tail, N·s, scaled by how hard the tail was held. Headless Rapier:
     * 4 N·s lifts the nose ~0.43 m (no air), ~8 N·s gives ~0.2 s of air (tune in 4–6+).
     */
    popImpulseNs: 5,
    /** Back stick y at or below −this (over the tail) counts as holding the tail down. */
    popChargeStickY: 0.6,
    /** Back stick y above −this counts as released. */
    popReleaseStickY: 0.3,
    /** The back stick must be held down at least this long before release pops, s. */
    popMinHoldS: 0.06,
    /** …and released (charge → release thresholds) within this window to count as a pop, s. */
    popReleaseWindowS: 0.15,

    /** After a pop, a front-foot slide toward the nose drags the board for this long, s. */
    ollieWindowS: 0.5,
    /** Minimum front-foot slide speed toward the nose (stick velocity × reach), m/s. */
    ollieMinSlideSpeedMps: 0.3,
    /** Normal force of the sliding front foot on the grip, N; friction = μ·this (tune). */
    ollieFootNormalN: 40,

    /** Peak sideways stick speed (within `flickWindowS`) that counts as a flick, 1/s. */
    flickMinStickSpeedPerS: 8,
    /** How far back the flick-speed peak is remembered when the foot crosses the edge, s. */
    flickWindowS: 0.15,
    /** A flick needs the board airborne, or a pop at most this long ago, s. */
    flickAfterPopWindowS: 0.5,
    /**
     * Flick impulse at the deck edge, N·s. A full flip needs ~0.13 N·m·s of roll impulse
     * (roll inertia ≈ 0.0096 kg·m², headless Rapier); the roll lever of this impulse is
     * ≈ halfWidth·sin(flickDownAngleRad) ≈ 0.1 m (tune).
     */
    flickImpulseNs: 1.3,
    /** Flick impulse direction below the outward horizontal of the board, rad (tune). */
    flickDownAngleRad: degToRad(70),

    /** Back stick |x| at or above this during a pop sweeps the tail (shuvit). */
    sweepMinStickX: 0.5,
    /** The sweep can start up to this long after the pop, s. */
    sweepWindowS: 0.15,
    /**
     * Sweep (shuvit) impulse at the tail tip, N·s. Estimate: yaw inertia ≈ 0.11 kg·m², a
     * 180° shuvit in ~0.35 s needs ~0.95 N·m·s ≈ 2.4 N·s at the 0.4 m tail lever (tune).
     */
    sweepImpulseNs: 2,

    /** Both sticks leaning the same side by at least this |x| carve. */
    carveMinStickX: 0.15,
    /**
     * Extra downward force per foot at full lean, N, applied at the foot's (sideways) spot.
     * Pressing the +Z side gives +roll torque, which the board's trucks turn toward +Z (tune).
     */
    carveLeanN: 80,

    /** Push impulse along the board direction, N·s (tune). */
    pushImpulseNs: 3,
    /** Minimum time between pushes, s. */
    pushCooldownS: 0.6,
    /** Both sticks within this radius count as "near neutral" for pushing. */
    pushNeutralRadius: 0.3,
    /** No push above this forward speed, m/s. */
    pushMaxSpeedMps: 6,

    /** A re-attached foot whose stick is within this radius is catching. */
    catchNeutralRadius: 0.35,
    /** Catch damping at each shoe edge: F = −c·(ω × r), N per m/s (tune). */
    catchDampingNsPerM: 30,
  },
  torso: {
    /** Torso height above the deck when standing, m. */
    heightM: 0.9,
    /** Spring-follow natural frequency, rad/s. */
    followOmegaRadps: 8,
    followDampingRatio: 1,
  },
  bail: {
    /** Both feet detached for longer than this while the board is on its wheels → bail, s. */
    feetDetachedAfterLandingS: 0.35,
    /** Landing tilt beyond this (board up vs world up) → bail, rad. */
    maxLandingTiltRad: 0.9,
    /** Board resting upside down (grip tape down, touching) for this long → bail, s. */
    upsideDownRestS: 0.25,
  },
});

/** Type of the rider config (deeply readonly). */
export type RiderConfig = typeof RIDER_CONFIG;
