import { deepFreeze } from "../../shared";

/** The flat ground (`?map=flat`), also where the tutorial runs. */
export const FLAT_CONFIG = deepFreeze({
  /** The ground slab: 200 × 200 m, 1 m thick, its top at y = 0. */
  ground: { halfSizeM: 100, thicknessM: 1 },
  spawn: { xM: 0, zM: 0, headingRad: 0 },
});

/** Type of the flat map's parameters (deeply readonly). */
export type FlatConfig = typeof FLAT_CONFIG;
