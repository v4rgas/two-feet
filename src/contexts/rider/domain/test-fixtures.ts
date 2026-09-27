import type { Stance } from "../../../shared";
import { degToRad, Quat, Transform, Vec3 } from "../../../shared";
import type {
  BoardKinematics,
  BoardMassProperties,
  DeckGeometry,
  RiderControls,
} from "./foot-force-model";

/*
 * Test fixtures for the rider domain (no other context may be imported here). Numbers
 * match BOARD_CONFIG.spec; application/deck-surface.contract.test.ts pins the formulas.
 */

export const DT = 1 / 120;

export const DECK: DeckGeometry = {
  deck: {
    lengthM: 0.8,
    widthM: 0.21,
    thicknessM: 0.012,
    kickLengthM: 0.15,
    kickAngleRad: degToRad(19),
  },
  trucks: { wheelbaseM: 0.36, heightM: 0.053, axleTrackM: 0.18 },
  wheels: { radiusM: 0.027, widthM: 0.032 },
};

export const REST_Y = 0.027 + 0.053 + 0.006;

export function board(
  overrides: Partial<BoardKinematics> & { pitchRad?: number; rollRad?: number; y?: number } = {},
): BoardKinematics {
  const { pitchRad = 0, rollRad = 0, y = REST_Y, ...rest } = overrides;
  const rotation = Quat.multiply(
    Quat.fromAxisAngle(Vec3.UNIT_Z, pitchRad),
    Quat.fromAxisAngle(Vec3.UNIT_X, rollRad),
  );
  return {
    transform: Transform.create(Vec3.create(0, y, 0), rotation),
    linearVelocityMps: Vec3.ZERO,
    angularVelocityRadps: Vec3.ZERO,
    grounded: true,
    contacts: { tail: false, nose: false, deck: false },
    ...rest,
  };
}

export interface Sticks {
  readonly fx?: number;
  readonly fy?: number;
  readonly bx?: number;
  readonly by?: number;
  readonly feetDown?: boolean;
  readonly stance?: Stance;
}

export function controls({
  fx = 0,
  fy = 0,
  bx = 0,
  by = 0,
  feetDown = false,
  stance = "regular",
}: Sticks = {}): RiderControls {
  return {
    front: { foot: "front", stick: { x: fx, y: fy }, stickVelocityPerS: { x: 0, y: 0 } },
    back: { foot: "back", stick: { x: bx, y: by }, stickVelocityPerS: { x: 0, y: 0 } },
    feetDown,
    stance,
  };
}

/** Isotropic mass properties (enough for the controller's arithmetic). */
export const MASS: BoardMassProperties = {
  massKg: 2.4,
  centerOfMassWorldM: Vec3.create(0, REST_Y - 0.02, 0),
  angularInertiaTimes: (v) => Vec3.scale(v, 0.05),
};
