import { Vec2 } from "../../../shared";
import type { InputConfig } from "../input.config";
import { StickValue, type StickVelocity } from "./stick-value";
import type { VirtualStick } from "./virtual-stick";

/** Spring-damper tuning of one virtual stick (`INPUT_CONFIG.stick`). */
export type StickTuning = InputConfig["stick"];

/**
 * `VirtualStick` driven by one damped spring per axis:
 * `a = ω²·(target − x) − 2ζω·v`, integrated with semi-implicit Euler (stable for
 * ω·dt < 2; the defaults give ω·dt ≈ 0.23 at 120 Hz).
 *
 * - ω is `pressOmegaRadps` while that axis has a non-zero target, `releaseOmegaRadps`
 *   while it returns to neutral.
 * - The position is clamped to [-1, 1]; hitting a bound zeroes the outward velocity.
 * - `value` applies a rescaled deadzone (|x| ≤ deadzone → 0, 1 stays 1). `velocityPerS`
 *   is the raw spring velocity, so flicks are measured without deadzone artefacts.
 */
export class SpringVirtualStick implements VirtualStick {
  private x = 0;
  private y = 0;
  private vx = 0;
  private vy = 0;

  constructor(private readonly tuning: StickTuning) {}

  get value(): StickValue {
    return StickValue.clamped(this.applyDeadzone(this.x), this.applyDeadzone(this.y));
  }

  get velocityPerS(): StickVelocity {
    return Vec2.create(this.vx, this.vy);
  }

  update(target: StickValue, dtS: number): void {
    if (!(dtS > 0) || !Number.isFinite(dtS)) return;
    const nx = this.integrateAxis(this.x, this.vx, target.x, dtS);
    const ny = this.integrateAxis(this.y, this.vy, target.y, dtS);
    this.x = nx.position;
    this.vx = nx.velocity;
    this.y = ny.position;
    this.vy = ny.velocity;
  }

  reset(): void {
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
  }

  private integrateAxis(
    position: number,
    velocity: number,
    target: number,
    dtS: number,
  ): { position: number; velocity: number } {
    const { pressOmegaRadps, releaseOmegaRadps, dampingRatio } = this.tuning;
    const omega = target === 0 ? releaseOmegaRadps : pressOmegaRadps;
    const accel = omega * omega * (target - position) - 2 * dampingRatio * omega * velocity;
    let v = velocity + accel * dtS;
    let p = position + v * dtS;
    if (p > 1) {
      p = 1;
      v = Math.min(0, v);
    } else if (p < -1) {
      p = -1;
      v = Math.max(0, v);
    }
    return { position: p, velocity: v };
  }

  private applyDeadzone(v: number): number {
    const dz = this.tuning.deadzone;
    const magnitude = Math.abs(v);
    if (magnitude <= dz) return 0;
    return (Math.sign(v) * (magnitude - dz)) / (1 - dz);
  }
}
