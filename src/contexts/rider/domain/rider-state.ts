import type { Vec3 } from "../../../shared";
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
}
