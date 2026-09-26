import { deepFreeze } from "../../shared";

/**
 * Every tunable constant of the `rider` context (REQUIREMENTS §2.5). SI units.
 * Values are first guesses ("tune") until the headless physics scenarios pin them.
 */
export const RIDER_CONFIG = deepFreeze({
  feet: {
    /** Rest (neutral-stick) positions on the deck, m along +X from deck centre. */
    frontRestAlongM: 0.12,
    backRestAlongM: -0.2,
    /** Rest position across the deck, m (0 = centre line). */
    restAcrossM: 0,
    /** Stick full deflection moves the foot this far from rest, m. */
    reachAlongM: 0.18,
    reachAcrossM: 0.12,
    /** Max foot slide speed over the grip tape, m/s. */
    maxSlideSpeedMps: 2.5,
    /** An airborne foot within this distance of the deck surface reattaches, m. */
    catchRadiusM: 0.1,
    /** A foot faster than this relative to the deck detaches, m/s. */
    detachRelativeSpeedMps: 4,
  },
  forces: {
    /** Rider weight share pushed through one fully-pressed foot, N (tune). */
    footPressN: 250,
    /** Grip-tape friction coefficient (shoe vs grip). */
    gripFrictionCoeff: 1.1,
    /** Pop impulse on the tail, N·s (tune). */
    popImpulseNs: 4,
    /** The back stick must be held down at least this long before release pops, s. */
    popMinHoldS: 0.06,
    /** …and released within this window to count as a pop, s. */
    popReleaseWindowS: 0.15,
    /** Stick sideways speed that counts as a flick, 1/s. */
    flickMinStickSpeedPerS: 8,
    /** Flick impulse at the deck edge, N·s (tune). */
    flickImpulseNs: 0.5,
    /** Sweep (shuvit) impulse at the tail, N·s (tune). */
    sweepImpulseNs: 0.5,
    /** Push impulse along the board direction, N·s (tune). */
    pushImpulseNs: 3,
    /** Minimum time between pushes, s. */
    pushCooldownS: 0.6,
    /** Spin damping applied while catching, N·m·s per rad/s (tune). */
    catchDampingNmsPerRadps: 0.05,
  },
  torso: {
    /** Torso height above the deck when standing, m. */
    heightM: 0.9,
    /** Spring-follow natural frequency, rad/s. */
    followOmegaRadps: 8,
    followDampingRatio: 1,
  },
  bail: {
    /** Both feet detached for longer than this after landing → bail, s. */
    feetDetachedAfterLandingS: 0.35,
    /** Landing tilt beyond this (board up vs world up) → bail, rad. */
    maxLandingTiltRad: 0.9,
  },
});

/** Type of the rider config (deeply readonly). */
export type RiderConfig = typeof RIDER_CONFIG;
