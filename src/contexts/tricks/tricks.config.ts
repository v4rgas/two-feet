import { deepFreeze } from "../../shared";
import type { GrindNames, TrickTable } from "./domain/trick-definition";

/**
 * Every tunable constant of the `tricks` context (REQUIREMENTS §2.5). Rotations are
 * rider-normalised (ADR 0007). The name table is data too, but not a tunable: see
 * `TRICK_TABLE` below.
 */
export const TRICKS_CONFIG = deepFreeze({
  session: {
    /** A pop counts for the air session if it happened at most this long before takeoff, s. */
    popToTakeoffWindowS: 0.25,
    /**
     * A pop up to this long AFTER takeoff belongs to that air (a load carried off a lip
     * pops just past it: the rider's `tricks.popLipGraceS`), s.
     */
    popAfterTakeoffWindowS: 0.05,
    /** Popped airs shorter than this are hops, not tricks: no outcome, s. */
    minAirtimeS: 0.15,
    /** Rolling backwards (vs the rider heading) faster than this at the pop = fakie, m/s. */
    fakieMinSpeedMps: 0.3,
    /**
     * The board's long axis must be at least this horizontal (|xz| of the unit axis) for its
     * heading to count toward the shove; steeper steps are skipped.
     */
    minHorizontalAxis: 0.2,
  },
  /**
   * How far each channel may end from a whole step and still count as completed, rad
   * (flip: a multiple of 2π; shove and body: a multiple of π). Beyond: `TrickBailed`
   * ("underRotated") with the closest name.
   */
  tolerances: {
    flipRad: 0.6,
    shoveRad: 0.6,
    bodyRad: 0.6,
  },
  /** Grinds and lines (MECHANICS.md M4). */
  grind: {
    /**
     * The trick into a grind is named this long after the lock-on: the stance assist
     * finishes the last bit of the flip, which then counts, s.
     */
    entrySettleS: 0.15,
  },
  landing: {
    /** Max angle between board up and world up at touchdown for a clean landing, rad. */
    maxTiltRad: 0.5,
    /** Wheels that must be down (at touchdown or within `settleWindowS`) for a clean landing. */
    minWheels: 4,
    /** Both feet must be attached by this long after touchdown (the catch), s. */
    catchWindowS: 0.2,
    /** The board must reach `minWheels` by this long after touchdown, s. */
    settleWindowS: 0.3,
  },
});

/** Type of the tricks config (deeply readonly). */
export type TricksConfig = typeof TRICKS_CONFIG;

/**
 * MECHANICS.md "Names the recognizer must produce", as data. Flip units are full turns
 * (+ = kickflip), shove and body units half turns (+ = backside). A flip × shove pair
 * without an entry in `tricks` (a "—" cell) gets the generic `<flip> + <shove>` name.
 */
export const TRICK_TABLE: TrickTable = deepFreeze<TrickTable>({
  flips: [
    { id: "none", name: "", units: 0 },
    { id: "kickflip", name: "Kickflip", units: 1 },
    { id: "heelflip", name: "Heelflip", units: -1 },
    { id: "double-kickflip", name: "Double Kickflip", units: 2 },
    { id: "double-heelflip", name: "Double Heelflip", units: -2 },
  ],
  shoves: [
    { id: "none", name: "", units: 0 },
    { id: "bs", name: "BS Shove-it", units: 1 },
    { id: "fs", name: "FS Shove-it", units: -1 },
    { id: "bs360", name: "360 Shove-it", units: 2 },
    { id: "fs360", name: "FS 360 Shove-it", units: -2 },
  ],
  bodies: [
    { id: "none", name: "", units: 0 },
    { id: "bs180", name: "BS 180", units: 1 },
    { id: "fs180", name: "FS 180", units: -1 },
    { id: "bs360", name: "360", units: 2 },
    { id: "fs360", name: "360", units: -2 },
  ],
  tricks: [
    { id: "ollie", name: "Ollie", flip: "none", shove: "none", omitWith: ["nollie", "body"] },
    { id: "bs-pop-shove-it", name: "BS Pop Shove-it", flip: "none", shove: "bs" },
    { id: "fs-pop-shove-it", name: "FS Pop Shove-it", flip: "none", shove: "fs" },
    { id: "360-shove-it", name: "360 Shove-it", flip: "none", shove: "bs360" },
    { id: "fs-360-shove-it", name: "FS 360 Shove-it", flip: "none", shove: "fs360" },
    { id: "kickflip", name: "Kickflip", flip: "kickflip", shove: "none" },
    { id: "varial-kickflip", name: "Varial Kickflip", flip: "kickflip", shove: "bs" },
    { id: "hardflip", name: "Hardflip", flip: "kickflip", shove: "fs" },
    { id: "tre-flip", name: "360 Flip", flip: "kickflip", shove: "bs360" },
    { id: "heelflip", name: "Heelflip", flip: "heelflip", shove: "none" },
    { id: "inward-heelflip", name: "Inward Heelflip", flip: "heelflip", shove: "bs" },
    { id: "varial-heelflip", name: "Varial Heelflip", flip: "heelflip", shove: "fs" },
    { id: "laser-flip", name: "Laser Flip", flip: "heelflip", shove: "fs360" },
    { id: "double-kickflip", name: "Double Kickflip", flip: "double-kickflip", shove: "none" },
    { id: "double-heelflip", name: "Double Heelflip", flip: "double-heelflip", shove: "none" },
  ],
  prefixes: { switch: "Switch", fakie: "Fakie", nollie: "Nollie" },
  genericJoiner: " + ",
});

/** Grind and slide names and how lines are written (MECHANICS.md M4 "Recognizer"). */
export const GRIND_NAMES: GrindNames = deepFreeze<GrindNames>({
  kinds: {
    fiftyFifty: "50-50",
    fiveO: "5-0",
    noseGrind: "Nosegrind",
    boardslide: "Boardslide",
    tailslide: "Tailslide",
    noseslide: "Noseslide",
  },
  sides: { frontside: "FS", backside: "BS" },
  lineJoiner: " → ",
  outSuffix: " out",
  silentInLine: ["ollie"],
});
