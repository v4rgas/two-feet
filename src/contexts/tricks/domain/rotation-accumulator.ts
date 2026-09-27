import type { RotationTotals } from "../../../shared";
import { Quat } from "../../../shared";
import type { RotationAccumulator } from "./air-session";

const ZERO: RotationTotals = Object.freeze({ rollRad: 0, yawRad: 0, pitchRad: 0 });

/**
 * Integrates the board's rotation about its LOCAL axes (ADR 0002: roll = X, yaw = Y,
 * pitch = Z). Each step's delta is `q_prev⁻¹ · q_curr` (the rotation applied first, so in
 * the board frame) turned into a rotation vector; the totals are not wrapped, so a double
 * flip reads 4π. Steps must stay below π each: at 120 Hz that is 377 rad/s.
 */
export class LocalRotationAccumulator implements RotationAccumulator {
  private previous: Quat = Quat.IDENTITY;
  private rollRad = 0;
  private yawRad = 0;
  private pitchRad = 0;

  reset(rotation: Quat): void {
    this.previous = rotation;
    this.rollRad = 0;
    this.yawRad = 0;
    this.pitchRad = 0;
  }

  add(rotation: Quat): void {
    const d = Quat.multiply(Quat.conjugate(this.previous), rotation);
    this.previous = rotation;
    const sinHalf = Math.hypot(d.x, d.y, d.z);
    if (sinHalf < 1e-12) return;
    // Shortest arc: q and −q are the same rotation.
    const s = d.w < 0 ? -1 : 1;
    const k = (s * 2 * Math.atan2(sinHalf, s * d.w)) / sinHalf;
    this.rollRad += d.x * k;
    this.yawRad += d.y * k;
    this.pitchRad += d.z * k;
  }

  get totals(): RotationTotals {
    if (this.rollRad === 0 && this.yawRad === 0 && this.pitchRad === 0) return ZERO;
    return Object.freeze({ rollRad: this.rollRad, yawRad: this.yawRad, pitchRad: this.pitchRad });
  }
}
