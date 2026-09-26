import type { Vec3 } from "../../../shared";
import type { FootState } from "./foot";

/**
 * Read model of the `Rider` aggregate (immutable). The aggregate owns both feet, the
 * kinematic torso and the bail state, and guards: a foot applies force only while
 * attached; a bailed rider applies no force until reset.
 */
export interface RiderState {
  readonly front: FootState;
  readonly back: FootState;
  /** Kinematic torso (spring-follows the board), m (world). Gives feet their rest positions. */
  readonly torsoPositionWorldM: Vec3;
  /** True from `RiderBailed` until the game resets the run. */
  readonly bailed: boolean;
}
