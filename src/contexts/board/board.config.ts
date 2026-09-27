import type { SurfaceType } from "../../shared";
import { deepFreeze, degToRad } from "../../shared";

/**
 * Every tunable constant of the `board` context (REQUIREMENTS §2.5). SI units.
 * Frozen: the dev tuning panel works on a clone, and systems receive their config
 * by injection. The values are pinned by the headless Rapier scenarios in
 * `infrastructure/rapier-physics-world.test.ts`; re-run them after any change.
 * Wheel model: real wheel colliders + a tyre model (ADR 0003).
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
  /** Shape details of the colliders that `BoardSpec` does not describe (infrastructure). */
  colliders: {
    /** Rounding radius of the deck boxes (smooths edge contacts), m. */
    deckRoundingM: 0.002,
    /** Baseplate footprint along X, m. */
    truckBaseLengthM: 0.06,
    /** Baseplate footprint across Z, m. */
    truckBaseWidthM: 0.06,
    /** Half height of the hanger around the axle, m (keeps it above the wheel bottoms). */
    hangerHalfHeightM: 0.01,
    /** Half length of the hanger along X, m. */
    hangerHalfLengthM: 0.015,
  },
  physics: {
    /** Rolling resistance coefficient of urethane on concrete: F = Crr · N per wheel. */
    rollingResistanceCoeff: 0.015,
    /**
     * Below this speed the rolling resistance fades out linearly (F = Crr·N·v/v₀), so a
     * board at rest does not jitter around zero, m/s.
     */
    rollingResistanceFadeSpeedMps: 0.05,
    /** Max sideways grip force per wheel = coeff · N (before the surface multiplier). */
    lateralGripCoeff: 1.1,
    /**
     * Sideways grip as a velocity damper per wheel, N per m/s of sideways slip. Must stay
     * below ≈ m_board / (4 · dt) ≈ 60 for stability at 1/120 s (ADR 0003).
     */
    lateralGripDampingNsPerM: 40,
    /**
     * Cap on the wheel normal force the tyre model uses, N. A hard landing produces one
     * huge solver impulse; this keeps it from turning into a huge grip force.
     */
    maxWheelLoadN: 400,
    /**
     * Bushing roll stiffness: lean = (roll moment of the wheel loads about the board's
     * long axis) / stiffness, N·m/rad. A 700 N rider shifting 2 cm reaches max lean.
     */
    bushingStiffnessNmPerRad: 60,
    /** Time constant of the bushings following the load moment, s. */
    leanResponseTimeS: 0.06,
    /** Friction of the flat deck and the trucks against the world (tune). */
    deckFrictionCoeff: 0.5,
    /**
     * Friction of the kicked tail and nose against the world. Low: a pop strike loads the
     * tail with a huge, brief normal force, and full wood-on-concrete friction there would
     * brake the board and flip its nose up (ADR 0005).
     */
    kickFrictionCoeff: 0.1,
    /** Restitution of deck/tail/nose — governs how much a pop bounces (tune). */
    deckRestitution: 0.3,
    /** Wheels have no solver friction; grip and rolling come from the tyre model. */
    wheelFrictionCoeff: 0,
    /** Restitution of the wheels: 0 = plastic landing, no bounce. */
    wheelRestitution: 0,
    /** Friction multiplier per surface type, applied to the coefficients above. */
    surfaceFriction: {
      ground: 1,
      ramp: 1,
      grindable: 0.3,
      ledge: 0.6,
    } satisfies Record<SurfaceType, number>,
    /** Linear / angular damping of the board body (air drag stand-in), 1/s. */
    linearDamping: 0.02,
    angularDamping: 0.05,
    /** World gravity, m/s². */
    gravityMps2: -9.81,
    /** Rapier solver iterations per step. */
    solverIterations: 8,
  },
  contact: {
    /** Minimum wheels touching for the board to count as grounded. */
    groundedMinWheels: 1,
    /** Max distance from a board part to the surface still counted as touching, m. */
    wheelContactToleranceM: 0.003,
  },
});

/** Type of the board config (deeply readonly). */
export type BoardConfig = typeof BOARD_CONFIG;
