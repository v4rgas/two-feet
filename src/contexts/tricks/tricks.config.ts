import { deepFreeze, degToRad, TAU } from "../../shared";
import type { TrickDefinition } from "./domain/trick-definition";
import { AngleRange } from "./domain/trick-definition";

/** How far a rotation may be off the ideal value and still count, rad. */
const TOL = degToRad(50);
/** Rotation small enough to count as "none", rad. */
const NONE = AngleRange.around(0, degToRad(45));
const HALF = Math.PI;

/**
 * Every tunable constant of the `tricks` context, including the trick table
 * (REQUIREMENTS §1.5, §2.5). Rotations are stance-normalised (see tricks README).
 */
export const TRICKS_CONFIG = deepFreeze({
  landing: {
    /** Max angle between board up and world up for a clean landing, rad. */
    maxTiltRad: degToRad(35),
    /** A pop counts for the air session if it happened at most this long before takeoff, s. */
    popToTakeoffWindowS: 0.25,
    /** Both feet must be attached within this time after touchdown, s. */
    catchWindowS: 0.2,
  },
  definitions: [
    {
      id: "ollie",
      name: "Ollie",
      rollRad: NONE,
      yawRad: NONE,
      requiresPop: true,
      minAirtimeS: 0.15,
      priority: 0,
    },
    {
      id: "kickflip",
      name: "Kickflip",
      rollRad: AngleRange.around(TAU, TOL),
      yawRad: NONE,
      requiresPop: true,
      minAirtimeS: 0.2,
      priority: 10,
    },
    {
      id: "heelflip",
      name: "Heelflip",
      rollRad: AngleRange.around(-TAU, TOL),
      yawRad: NONE,
      requiresPop: true,
      minAirtimeS: 0.2,
      priority: 10,
    },
    {
      id: "double-kickflip",
      name: "Double Kickflip",
      rollRad: AngleRange.around(2 * TAU, TOL),
      yawRad: NONE,
      requiresPop: true,
      minAirtimeS: 0.3,
      priority: 20,
    },
    {
      id: "bs-pop-shuvit",
      name: "Pop Shuvit",
      rollRad: NONE,
      yawRad: AngleRange.around(HALF, TOL),
      requiresPop: true,
      minAirtimeS: 0.15,
      priority: 10,
    },
    {
      id: "fs-pop-shuvit",
      name: "Frontside Pop Shuvit",
      rollRad: NONE,
      yawRad: AngleRange.around(-HALF, TOL),
      requiresPop: true,
      minAirtimeS: 0.15,
      priority: 10,
    },
    {
      id: "360-shuvit",
      name: "360 Shuvit",
      rollRad: NONE,
      yawRad: AngleRange.around(TAU, TOL),
      requiresPop: true,
      minAirtimeS: 0.25,
      priority: 15,
    },
    {
      id: "varial-kickflip",
      name: "Varial Kickflip",
      rollRad: AngleRange.around(TAU, TOL),
      yawRad: AngleRange.around(HALF, TOL),
      requiresPop: true,
      minAirtimeS: 0.25,
      priority: 20,
    },
    {
      id: "varial-heelflip",
      name: "Varial Heelflip",
      rollRad: AngleRange.around(-TAU, TOL),
      yawRad: AngleRange.around(-HALF, TOL),
      requiresPop: true,
      minAirtimeS: 0.25,
      priority: 20,
    },
  ] satisfies TrickDefinition[],
});

/** Type of the tricks config (deeply readonly). */
export type TricksConfig = typeof TRICKS_CONFIG;
