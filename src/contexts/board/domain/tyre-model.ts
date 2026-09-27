import type { Transform, WheelId } from "../../../shared";
import { Quat, Vec3, WHEEL_IDS } from "../../../shared";
import type { BoardConfig } from "../board.config";
import { BoardSpec } from "./board-spec";
import type { BoardContact } from "./physics-world";

/**
 * TYRE + TRUCK MODEL (ADR 0003). Wheels are real colliders with no solver friction; the
 * solver only supports the board. Everything a wheel does along the ground — rolling
 * resistance, sideways grip, truck steering from deck lean — is computed here, as
 * forces the `BoardSystem` applies through the physics port before each step.
 *
 * Sign conventions (board frame, ADR 0002):
 * - `leanRad` > 0 when the +Z (right) wheels carry more load than the -Z ones, i.e. the
 *   rider leans toward +Z (toe edge in regular stance). A torque about +X does that.
 * - `steerRad` has the sign of the lean. Positive steer turns the board toward +Z: the
 *   nose truck points its rolling direction toward +Z and the tail truck toward -Z.
 *   Rolling forward (+X), the heading then rotates about world -Y (clockwise seen from
 *   above): positive lean ⇒ negative yaw rate.
 */

/** Why a board-internal force exists (debug overlay label). */
export type BoardForceLabel = "grip" | "rolling";

/** A force the board applies to itself at a wheel contact, for the next step (value object). */
export interface BoardForce {
  readonly part: WheelId;
  readonly label: BoardForceLabel;
  /** Force, N (world). */
  readonly forceN: Vec3;
  /** Point of application, m (world): the wheel's ground contact. */
  readonly pointWorldM: Vec3;
}

type TyreParams = BoardConfig["physics"];

const WHEELS: ReadonlySet<string> = new Set(WHEEL_IDS);

/** True when `part` is one of the four wheels. */
export function isWheel(part: string): part is WheelId {
  return WHEELS.has(part);
}

/** Wheel normal force implied by a contact's solver impulse over the last step, N (capped). */
export function wheelLoadN(contact: BoardContact, dtS: number, params: TyreParams): number {
  if (!(dtS > 0)) return 0;
  return Math.min(Math.max(0, contact.normalImpulseNs) / dtS, params.maxWheelLoadN);
}

/**
 * Roll moment about the board's long axis produced by the wheel loads, N·m. Positive when
 * the +Z wheels carry more load. This is the moment the bushings resist.
 */
export function wheelLoadRollMomentNm(
  spec: BoardSpec,
  contacts: readonly BoardContact[],
  dtS: number,
  params: TyreParams,
): number {
  let momentNm = 0;
  for (const contact of contacts) {
    if (!isWheel(contact.part)) continue;
    const z = BoardSpec.wheelCenterLocal(spec, contact.part).z;
    momentNm += wheelLoadN(contact, dtS, params) * z;
  }
  return momentNm;
}

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

/**
 * Rolling-load scale for `WheelContactInput.rollingLoadScale`: the board's weight over
 * the total wheel load (at most 1; 0 when nothing is loaded).
 */
export function rollingLoadScale(boardWeightN: number, totalWheelLoadN: number): number {
  return totalWheelLoadN > 0 ? Math.min(1, boardWeightN / totalWheelLoadN) : 0;
}

/** Deck lean the bushings settle at under a roll moment, rad, clamped to `maxLeanRad`. */
export function targetLeanRad(spec: BoardSpec, rollMomentNm: number, params: TyreParams): number {
  return clamp(rollMomentNm / params.bushingStiffnessNmPerRad, spec.trucks.maxLeanRad);
}

/** First-order bushing response: moves `leanRad` toward `targetRad` over `dtS`. */
export function followLeanRad(
  leanRad: number,
  targetRad: number,
  dtS: number,
  params: TyreParams,
): number {
  const k = Math.min(1, dtS / params.leanResponseTimeS);
  return leanRad + (targetRad - leanRad) * k;
}

/** Truck steering angle for a deck lean, rad (same sign as the lean), clamped. */
export function truckSteerRad(spec: BoardSpec, leanRad: number): number {
  return clamp(spec.trucks.steerPerLean * leanRad, spec.trucks.maxSteerRad);
}

/**
 * Rolling direction of a wheel in the board frame. The nose truck turns by `-steerRad`
 * about +Y and the tail truck by `+steerRad`, so positive steer points both axles toward
 * a turn centre on the +Z side.
 */
export function wheelRollingDirLocal(wheel: WheelId, steerRad: number): Vec3 {
  const psi = wheel.startsWith("nose") ? -steerRad : steerRad;
  // Rotation about +Y by psi maps +X to (cos psi, 0, -sin psi).
  return Vec3.create(Math.cos(psi), 0, -Math.sin(psi));
}

/** Everything the tyre model needs for one wheel contact. */
export interface WheelContactInput {
  readonly wheel: WheelId;
  readonly contact: BoardContact;
  readonly boardTransform: Transform;
  /** Velocity of the board material at the contact point, m/s (world). */
  readonly velocityAtContactMps: Vec3;
  readonly steerRad: number;
  /**
   * Share of the wheel load that counts for rolling resistance, [0, 1]. The rider's mass
   * is not simulated, only their press force, so the system scales the load down to the
   * board's own weight: deceleration stays Crr·g however hard the rider stands.
   */
  readonly rollingLoadScale: number;
  /** Length of the step whose solver impulse the contact reports, s. */
  readonly dtS: number;
}

/**
 * Tyre forces at one wheel contact: sideways grip (a velocity damper capped by
 * μ·N) and rolling resistance (Crr·N, faded out near zero speed). Returns 0–2 forces.
 */
export function tyreForces(input: WheelContactInput, params: TyreParams): BoardForce[] {
  const { contact, wheel } = input;
  const normal = contact.normalWorld;
  const loadN = wheelLoadN(contact, input.dtS, params);
  if (loadN <= 0) return [];

  const dirWorld = Quat.rotate(
    input.boardTransform.rotation,
    wheelRollingDirLocal(wheel, input.steerRad),
  );
  const tangent = Vec3.normalize(
    Vec3.sub(dirWorld, Vec3.scale(normal, Vec3.dot(normal, dirWorld))),
  );
  if (Vec3.lengthSq(tangent) === 0) return []; // wheel axis along the normal: no rolling plane
  const lateral = Vec3.cross(normal, tangent);
  const surfaceMu = params.surfaceFriction[contact.surface];
  const forces: BoardForce[] = [];

  const vLat = Vec3.dot(input.velocityAtContactMps, lateral);
  const gripN = -clamp(
    params.lateralGripDampingNsPerM * vLat,
    params.lateralGripCoeff * surfaceMu * loadN,
  );
  if (gripN !== 0) {
    forces.push({
      part: wheel,
      label: "grip",
      forceN: Vec3.scale(lateral, gripN),
      pointWorldM: contact.pointWorldM,
    });
  }

  const vLong = Vec3.dot(input.velocityAtContactMps, tangent);
  const fade = Math.min(1, Math.abs(vLong) / params.rollingResistanceFadeSpeedMps);
  const rollingN =
    -Math.sign(vLong) * params.rollingResistanceCoeff * loadN * input.rollingLoadScale * fade;
  if (rollingN !== 0) {
    forces.push({
      part: wheel,
      label: "rolling",
      forceN: Vec3.scale(tangent, rollingN),
      pointWorldM: contact.pointWorldM,
    });
  }
  return forces;
}
