import type { RotationTotals } from "../../../shared";
import { Quat, shortestDelta, Vec3 } from "../../../shared";
import type { RotationAccumulator } from "./air-session";

const ZERO: RotationTotals = Object.freeze({ rollRad: 0, yawRad: 0, pitchRad: 0 });

/**
 * Integrates the board's rotation about its LOCAL axes (ADR 0002: roll = X, yaw = Y,
 * pitch = Z). Each step's delta is `q_prev⁻¹ · q_curr` (the rotation applied first, so in
 * the board frame) turned into a rotation vector; the totals are not wrapped, so a double
 * flip reads 4π. Steps must stay below π each: at 120 Hz that is 377 rad/s.
 *
 * Roll is the FLIP coordinate: the local-X rotation minus the part of that step's world
 * heading turn that projects onto the board's X axis. Without that correction a 360 shove
 * on a scooped (nose-up) deck leaks heading into roll (≈ 0.6 rad) and reads as a flip.
 */
export class LocalRotationAccumulator implements RotationAccumulator {
  private previous: Quat = Quat.IDENTITY;
  private previousHeadingRad: number | null = null;
  private rollRad = 0;
  private yawRad = 0;
  private pitchRad = 0;

  reset(rotation: Quat): void {
    this.previous = rotation;
    this.previousHeadingRad = headingOf(rotation);
    this.rollRad = 0;
    this.yawRad = 0;
    this.pitchRad = 0;
  }

  add(rotation: Quat): void {
    const d = Quat.multiply(Quat.conjugate(this.previous), rotation);
    this.previous = rotation;
    const heading = headingOf(rotation);
    const dHeading =
      heading !== null && this.previousHeadingRad !== null
        ? shortestDelta(this.previousHeadingRad, heading)
        : 0;
    this.previousHeadingRad = heading;
    const axisUp = Quat.rotate(rotation, Vec3.UNIT_X).y;
    const sinHalf = Math.hypot(d.x, d.y, d.z);
    if (sinHalf < 1e-12) return;
    // Shortest arc: q and −q are the same rotation.
    const s = d.w < 0 ? -1 : 1;
    const k = (s * 2 * Math.atan2(sinHalf, s * d.w)) / sinHalf;
    this.rollRad += d.x * k - dHeading * axisUp;
    this.yawRad += d.y * k;
    this.pitchRad += d.z * k;
  }

  get totals(): RotationTotals {
    if (this.rollRad === 0 && this.yawRad === 0 && this.pitchRad === 0) return ZERO;
    return Object.freeze({ rollRad: this.rollRad, yawRad: this.yawRad, pitchRad: this.pitchRad });
  }
}

/** Heading of the board's long axis about world up (CCW from above), or null when it is near vertical. */
function headingOf(rotation: Quat): number | null {
  const x = Quat.rotate(rotation, Vec3.UNIT_X);
  if (Math.hypot(x.x, x.z) < 0.2) return null;
  return Math.atan2(-x.z, x.x);
}
