import type { FootId, GrindExit, GrindKind, GrindSide, Vec3 } from "../../../shared";
import type { FootState } from "./foot";

/**
 * Read model of the `Rider` aggregate (immutable). The aggregate owns both feet, the
 * torso, the rider frame and the bail state, and guards: a bailed rider applies no
 * force until reset.
 */
export interface RiderState {
  readonly front: FootState;
  readonly back: FootState;
  /** Kinematic torso (spring-follows the board), m (world). Gives feet their rest positions. */
  readonly torsoPositionWorldM: Vec3;
  /**
   * Rider heading, rad around world +Y (0 = +X). With the torso this is the RIDER FRAME:
   * upright, yaw only. Feet are held (and drawn) in it.
   */
  readonly headingRad: number;
  /**
   * Body wind-up (Q / E while loaded), rad: how far the shoulders are turned, + = counter-
   * clockwise from above. Visual; the pop turns it into the initial body spin.
   */
  readonly windUpRad: number;
  /** Body spin rate of the rider heading, rad/s (+ = counter-clockwise from above). */
  readonly bodySpinRateRadps: number;
  /** True from `RiderBailed` until the game resets the run. */
  readonly bailed: boolean;
  /** The grind or slide the board is locked in (MECHANICS.md M4), or null. */
  readonly grind: RiderGrind | null;
  /** How the most recent grind ended (kept until the next one starts), or null. */
  readonly lastGrindExit: GrindExit | null;
  /**
   * The turn the body made on its own at the last pop out of a grind, to line up with the
   * travel (rad, + = counter-clockwise from above; 0 otherwise). Not a trick: the
   * recognizer takes it off the body spin.
   */
  readonly popOutTurnRad: number;
  /** The foot flicking a kickflip right now (its toes point down: visual), or null. */
  readonly kickflipFlick: FootId | null;
}

/** A grind in progress (read model). */
export interface RiderGrind {
  readonly kind: GrindKind;
  readonly side: GrindSide;
  readonly obstacleId: string;
  readonly surface: string;
  /** Balance in [−1, 1], + = toward the rider's toe side; past ±1 the rider falls off. */
  readonly balance: number;
}
