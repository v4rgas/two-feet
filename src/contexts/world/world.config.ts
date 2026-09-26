import { deepFreeze } from "../../shared";

/** Every tunable constant of the `world` context (REQUIREMENTS §2.5). */
export const WORLD_CONFIG = deepFreeze({
  flatGround: {
    /** Half the side of the square ground, m. */
    halfSizeM: 100,
    /** Thickness of the ground box (keeps the collider robust), m. */
    thicknessM: 1,
    /** Board heading at spawn, rad (0 = nose toward world +X). */
    spawnHeadingRad: 0,
  },
});

/** Type of the world config (deeply readonly). */
export type WorldConfig = typeof WORLD_CONFIG;
