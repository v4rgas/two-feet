import type { SurfaceType } from "../../shared";
import { deepFreeze, degToRad } from "../../shared";

/**
 * Every tunable constant of the `board` context (REQUIREMENTS §2.5). SI units.
 * Frozen: the dev tuning panel works on a clone, and systems receive their config
 * by injection. Values marked "tune" are first guesses to be set by the headless
 * physics scenarios.
 */
export const BOARD_CONFIG = deepFreeze({
  /** Real-world 8.25" popsicle deck, standard trucks, 54 mm wheels. Feed to `BoardSpec.create`. */
  spec: {
    deck: {
      lengthM: 0.8,
      widthM: 0.21,
      thicknessM: 0.012,
      massKg: 1.3,
      kickLengthM: 0.15,
      kickAngleRad: degToRad(19),
    },
    trucks: {
      wheelbaseM: 0.36,
      heightM: 0.053,
      axleTrackM: 0.18,
      massKg: 0.35,
      maxSteerRad: degToRad(15),
      steerPerLean: 0.7,
      maxLeanRad: degToRad(12),
    },
    wheels: {
      radiusM: 0.027,
      widthM: 0.032,
      massKg: 0.06,
    },
  },
  physics: {
    /** Rolling resistance coefficient of urethane on concrete (tune). */
    rollingResistanceCoeff: 0.015,
    /** Sideways grip coefficient of the wheels (tune). */
    lateralGripCoeff: 1.1,
    /** Friction of deck/tail/nose against the world (tune). */
    deckFrictionCoeff: 0.5,
    /** Restitution of deck/tail/nose — governs how much a pop bounces (tune). */
    deckRestitution: 0.3,
    /** Wheel suspension, if wheels are raycast (tune). */
    suspensionStiffnessNPerM: 60_000,
    suspensionDampingNsPerM: 400,
    suspensionTravelM: 0.004,
    /** Friction multiplier per surface type, applied to the coefficients above. */
    surfaceFriction: {
      ground: 1,
      ramp: 1,
      grindable: 0.3,
      ledge: 0.6,
    } satisfies Record<SurfaceType, number>,
    /** Linear / angular damping of the board body (air drag stand-in). */
    linearDamping: 0.02,
    angularDamping: 0.05,
    /** World gravity, m/s². */
    gravityMps2: -9.81,
  },
  contact: {
    /** Minimum wheels touching for the board to count as grounded. */
    groundedMinWheels: 1,
    /** Max distance from wheel bottom to ground still counted as touching, m. */
    wheelContactToleranceM: 0.003,
  },
});

/** Type of the board config (deeply readonly). */
export type BoardConfig = typeof BOARD_CONFIG;
