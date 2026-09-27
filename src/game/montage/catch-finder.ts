import { INPUT_CONFIG } from "../../contexts/input";
import { Transform, Vec3 } from "../../shared";
import type { MontageClip } from "./clip";
import { ClipRun } from "./clip-run";

/** What the catch waits for (how a player times Space: the rotation looks done). */
export interface CatchTarget {
  /** Only Space presses at or after this clip time are replaced, s. */
  readonly afterS: number;
  /** Flip turns (|roll| / 2π): 0, 1 or 2. */
  readonly flipTurns: number;
  /** Shove half-turns (|board yaw relative to the body| / π): 0, 1 or 2. */
  readonly shoveHalfTurns: number;
  /** Body half-turns (|rider heading change| / π): 0, 1 or 2. */
  readonly bodyHalfTurns?: number;
}

/**
 * Roll and yaw slack of the "looks done" check, rad (as in the scenario helpers): the catch
 * is torque-limited, so Space goes in at the end of the rotation.
 */
const ROLL_SLACK_RAD = 0.15;
const YAW_SLACK_RAD = 0.15;
/** The board looks upright when its tilt from world up is below this, rad. */
const UPRIGHT_TILT_RAD = 0.5;

/**
 * TUNING AID for clips: plays `clip` with its catch removed (every Space press from
 * `target.afterS` on) and returns the first clip time at which a player would hit Space:
 * the air's rotation has reached the target and the board looks upright. Null if that
 * never happens before touchdown. Paste the result into the clip's `catch(...)`.
 */
export async function findCatchTimeS(
  clip: MontageClip,
  target: CatchTarget,
): Promise<number | null> {
  const feetDown = INPUT_CONFIG.keys.feetDown;
  const keys = clip.keys.filter((k) => !(k.code === feetDown && k.atS >= target.afterS - 1e-9));
  const run = await ClipRun.create({ ...clip, keys });
  try {
    let wasAirborne = false;
    while (!run.done) {
      run.step();
      if (run.timeS < target.afterS) continue;
      const air = run.sim.tricks.air;
      const board = run.sim.board.snapshot;
      if (board.grounded) {
        if (wasAirborne) return null;
        continue;
      }
      wasAirborne = true;
      if (air === null) continue;
      const roll = Math.abs(air.rotation.rollRad);
      const body = Math.abs(air.bodyRad);
      // The air's yaw is already the shove (the board's yaw relative to the body).
      const shove = Math.abs(air.rotation.yawRad);
      const up = Transform.toWorldDirection(board.transform, Vec3.UNIT_Y);
      const tilt = Math.acos(Math.max(-1, Math.min(1, up.y)));
      const rolled = roll >= target.flipTurns * 2 * Math.PI - ROLL_SLACK_RAD;
      const shoved = shove >= target.shoveHalfTurns * Math.PI - YAW_SLACK_RAD;
      const turned = body >= (target.bodyHalfTurns ?? 0) * Math.PI - YAW_SLACK_RAD;
      if (rolled && shoved && turned && tilt <= UPRIGHT_TILT_RAD) return run.timeS;
    }
    return null;
  } finally {
    run.dispose();
  }
}
