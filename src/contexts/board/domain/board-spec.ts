import type { WheelId } from "../../../shared";
import { Vec3 } from "../../../shared";

/**
 * Physical definition of a skateboard (value object). SI units.
 * Local board frame (ADR 0002): origin at the deck's centre (mid-thickness of the flat
 * section), +X toward the nose, +Y up, +Z to the board's right (toe edge in regular).
 * Rendering must build its meshes from these numbers so visuals match colliders.
 */
export interface BoardSpec {
  readonly deck: {
    /** Tip-to-tip length, projected on the X axis, m. */
    readonly lengthM: number;
    readonly widthM: number;
    readonly thicknessM: number;
    readonly massKg: number;
    /** Length of each kicked end (nose / tail), measured along the kicked surface, m. */
    readonly kickLengthM: number;
    /** Upward angle of the kicked ends relative to the flat section, rad. */
    readonly kickAngleRad: number;
  };
  readonly trucks: {
    /** Axle-to-axle distance, m. Axles are at x = ±wheelbaseM/2. */
    readonly wheelbaseM: number;
    /** Distance from the deck's underside down to the axle centre, m. */
    readonly heightM: number;
    /** Wheel-centre to wheel-centre distance across one axle, m. */
    readonly axleTrackM: number;
    /** Mass of one truck, kg. */
    readonly massKg: number;
    /** Max steering angle of one truck, rad. */
    readonly maxSteerRad: number;
    /** Truck steer angle per radian of deck lean (dimensionless). */
    readonly steerPerLean: number;
    /** Max deck lean the bushings allow, rad. */
    readonly maxLeanRad: number;
  };
  readonly wheels: {
    readonly radiusM: number;
    readonly widthM: number;
    /** Mass of one wheel incl. bearings, kg. */
    readonly massKg: number;
  };
}

function requirePositive(name: string, value: number): void {
  if (!(value > 0) || !Number.isFinite(value)) {
    throw new RangeError(`BoardSpec.${name} must be a positive finite number, got ${value}`);
  }
}

/** Validates and freezes a BoardSpec. Throws `RangeError` on impossible geometry. */
function create(input: BoardSpec): BoardSpec {
  const { deck, trucks, wheels } = input;
  for (const [k, v] of Object.entries(deck)) requirePositive(`deck.${k}`, v);
  for (const [k, v] of Object.entries(trucks)) requirePositive(`trucks.${k}`, v);
  for (const [k, v] of Object.entries(wheels)) requirePositive(`wheels.${k}`, v);
  if (deck.kickAngleRad >= Math.PI / 2) {
    throw new RangeError("BoardSpec.deck.kickAngleRad must be < π/2");
  }
  if (flatLengthM(input) <= trucks.wheelbaseM) {
    throw new RangeError("BoardSpec: the flat section must be longer than the wheelbase");
  }
  if (trucks.axleTrackM + wheels.widthM > deck.widthM * 1.5) {
    throw new RangeError("BoardSpec: axle track is implausibly wide for the deck");
  }
  return Object.freeze({
    deck: Object.freeze({ ...deck }),
    trucks: Object.freeze({ ...trucks }),
    wheels: Object.freeze({ ...wheels }),
  });
}

/** Length of the flat (un-kicked) middle section, m. */
function flatLengthM(spec: BoardSpec): number {
  return spec.deck.lengthM - 2 * spec.deck.kickLengthM * Math.cos(spec.deck.kickAngleRad);
}

/** Total mass of deck + 2 trucks + 4 wheels, kg. */
function totalMassKg(spec: BoardSpec): number {
  return spec.deck.massKg + 2 * spec.trucks.massKg + 4 * spec.wheels.massKg;
}

/** Height of the local origin above flat ground when resting on 4 wheels, m. */
function restHeightM(spec: BoardSpec): number {
  return spec.wheels.radiusM + spec.trucks.heightM + spec.deck.thicknessM / 2;
}

/** Local position of a wheel centre, m. */
function wheelCenterLocal(spec: BoardSpec, wheel: WheelId): Vec3 {
  const x = (wheel.startsWith("nose") ? 1 : -1) * (spec.trucks.wheelbaseM / 2);
  const z = (wheel.includes("Right") ? 1 : -1) * (spec.trucks.axleTrackM / 2);
  const y = -(spec.deck.thicknessM / 2 + spec.trucks.heightM);
  return Vec3.create(x, y, z);
}

/**
 * Local position of a point on the deck's TOP surface (grip tape), m, for a given
 * `alongM` (x) and `acrossM` (z). Follows the kick on nose/tail. `alongM` is clamped
 * to the deck's extent. This is where feet touch the board.
 */
function deckTopPointLocal(spec: BoardSpec, alongM: number, acrossM: number): Vec3 {
  const halfFlat = flatLengthM(spec) / 2;
  const halfLen = spec.deck.lengthM / 2;
  const x = Math.max(-halfLen, Math.min(halfLen, alongM));
  const beyond = Math.max(0, Math.abs(x) - halfFlat);
  const y = spec.deck.thicknessM / 2 + beyond * Math.tan(spec.deck.kickAngleRad);
  return Vec3.create(x, y, acrossM);
}

/** Local position of the tail tip (underside edge that strikes the ground on a pop), m. */
function tailTipLocal(spec: BoardSpec): Vec3 {
  const top = deckTopPointLocal(spec, -spec.deck.lengthM / 2, 0);
  return Vec3.create(top.x, top.y - spec.deck.thicknessM, 0);
}

/** Local position of the nose tip (underside edge), m. */
function noseTipLocal(spec: BoardSpec): Vec3 {
  const top = deckTopPointLocal(spec, spec.deck.lengthM / 2, 0);
  return Vec3.create(top.x, top.y - spec.deck.thicknessM, 0);
}

/** Namespace for the BoardSpec value object and its derived geometry. */
export const BoardSpec = Object.freeze({
  create,
  flatLengthM,
  totalMassKg,
  restHeightM,
  wheelCenterLocal,
  deckTopPointLocal,
  tailTipLocal,
  noseTipLocal,
});
