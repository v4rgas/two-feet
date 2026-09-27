import type { Stance } from "../../../shared";
import { Quat, Vec3 } from "../../../shared";

/*
 * SIGN CONVENTIONS (ADR 0002, ADR 0007). Everything here is measured in the frame of the
 * RIDER HEADING AT TAKEOFF: forward f = heading (0 = world +X), side s = the rider frame's
 * +Z (heading 0 → f = +X, s = +Z), up = world +Y. Angles about +Y are
 * counter-clockwise seen from above (heading = atan2(−f.z, f.x), as in the rider context).
 *
 * The rider faces its TOE edge: +s in regular, −s in goofy (`toeSign`). The trick
 * controller (rider context) produces:
 *   - kickflip: board roll rate about the rider-forward end of its long axis = −toe × rate
 *     (heelflip: the opposite);
 *   - backside shove-it (the TAIL swings to the heel side, behind the rider): board yaw
 *     about +Y = −toe × rate, whichever kick popped (frontside: the opposite);
 *   - backside body spin (the rider's back turns toward the front first): rider heading
 *     change about +Y has the sign −toe (regular BS = clockwise from above, `E`).
 * So one rule normalises all three channels: multiply by −toe. After it, + = kickflip /
 * backside / backside in both stances, and for both kicks.
 */

/** Rider data the recognizer reads (satisfied structurally by rider's `RiderState`). */
export interface RiderPose {
  /** Rider heading, rad around world +Y (0 = +X). Changes in the air only by body spin. */
  readonly headingRad: number;
  /**
   * The rider rides in the other stance (switch). Optional: the rider context does not
   * report it yet, so it counts as false.
   */
  readonly switchStance?: boolean;
}

/** +1 when the rider's toe edge is the rider frame's +Z side (regular), −1 in goofy. */
export function toeSign(stance: Stance): 1 | -1 {
  return stance === "regular" ? 1 : -1;
}

/** The other stance. */
export function oppositeStance(stance: Stance): Stance {
  return stance === "regular" ? "goofy" : "regular";
}

/** Rider forward (horizontal unit vector) for a heading. */
export function headingForward(headingRad: number): Vec3 {
  return Vec3.create(Math.cos(headingRad), 0, -Math.sin(headingRad));
}

/**
 * Heading of the board's long axis (+X flattened), rad around world +Y, or null when the
 * long axis is too close to vertical to have one.
 */
export function boardHeadingRad(rotation: Quat, minHorizontal: number): number | null {
  const f = Quat.rotate(rotation, Vec3.UNIT_X);
  if (Math.hypot(f.x, f.z) < minHorizontal) return null;
  return Math.atan2(-f.z, f.x);
}

/**
 * +1 when the board's nose (+X) points to the rider's front, −1 when the board is the other
 * way round under the rider (nose and tail are rider-relative, as in the trick controller).
 */
export function boardFacing(rotation: Quat, headingRad: number): 1 | -1 {
  const f = Quat.rotate(rotation, Vec3.UNIT_X);
  return Vec3.dot(f, headingForward(headingRad)) >= 0 ? 1 : -1;
}

/** Raw air rotation, before stance normalisation. */
export interface RawAirRotation {
  /** Roll accumulated about the board's own local X, rad (ADR 0002 sign). */
  readonly localRollRad: number;
  /** Change of the board's long-axis heading, rad (+ = counter-clockwise from above). */
  readonly boardYawRad: number;
  /** Change of the rider heading, rad (+ = counter-clockwise from above). */
  readonly bodyYawRad: number;
  /** `boardFacing` at takeoff. */
  readonly facing: 1 | -1;
}

/** Rider-normalised channels: + = kickflip, backside shove, backside body spin. */
export interface NormalisedRotation {
  readonly flipRad: number;
  readonly shoveRad: number;
  readonly bodyRad: number;
}

/**
 * Applies the one sign rule (see the file comment): flip = −toe × facing × local roll
 * (the local roll seen about the rider-forward end of the long axis), shove = −toe × board
 * yaw, body = −toe × rider yaw.
 */
export function normaliseRotation(raw: RawAirRotation, stance: Stance): NormalisedRotation {
  const k = -toeSign(stance);
  return {
    flipRad: k * raw.facing * raw.localRollRad,
    shoveRad: k * raw.boardYawRad,
    bodyRad: k * raw.bodyYawRad,
  };
}
