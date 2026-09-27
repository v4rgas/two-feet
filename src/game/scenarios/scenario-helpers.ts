/*
 * Shared gestures and measurements for the full-loop scenarios (test support only).
 * Gestures follow MECHANICS.md; keys are chosen by foot role and board edge, so the same
 * script plays in both stances (regular: WASD = front, arrows = back).
 */
import type { FootId, Kick, Stance } from "../../shared";
import { Transform, Vec3 } from "../../shared";
import type { FootDirection, HarnessOptions, StepRecord } from "./scenario-harness";
import { ScenarioHarness } from "./scenario-harness";

/** Standing start, then `pushS` of Space; returns the harness rolling (or still). */
export async function rolling(
  pushS: number,
  options: HarnessOptions = {},
): Promise<ScenarioHarness> {
  const h = await ScenarioHarness.create(options);
  h.run(0.3);
  if (pushS > 0) h.press({ code: "Space", atS: 0, holdS: pushS });
  h.run(pushS + 0.2);
  return h;
}

/** Stick direction toward the toe edge (+Z in regular, −Z in goofy). */
export function toe(stance: Stance): FootDirection {
  return stance === "regular" ? "right" : "left";
}

/** Stick direction toward the heel edge. */
export function heel(stance: Stance): FootDirection {
  return stance === "regular" ? "left" : "right";
}

/** The pop foot of a kick (back on the tail, front on the nose) and the guide foot. */
export function popFoot(kick: Kick): FootId {
  return kick === "tail" ? "back" : "front";
}
export function guideFoot(kick: Kick): FootId {
  return kick === "tail" ? "front" : "back";
}

/** Stick direction of a foot toward a kick (the tail is "down", the nose "up"). */
export function toward(kick: Kick): FootDirection {
  return kick === "tail" ? "down" : "up";
}

/** Stick direction away from a kick (the guide foot's level key: W for an ollie). */
export function awayFrom(kick: Kick): FootDirection {
  return kick === "tail" ? "up" : "down";
}

/**
 * The set-up (MECHANICS.md "Load" / "Pop"): the pop foot goes onto its kick, the guide
 * foot sets 0.02 s later and stays set; the pop foot is released at `popAtS` (the pop) while
 * the set is still held. Ollie: ↓, D, release ↓. Nollie: W, →, release W. Times from now.
 */
export function loadAndPop(h: ScenarioHarness, popAtS = 0.22, kick: Kick = "tail"): void {
  h.foot(popFoot(kick), toward(kick), 0, popAtS);
  h.foot(guideFoot(kick), toe(h.stance), 0.02, popAtS + 0.05);
}

/** Press Space (catch in the air) at `atS` for 0.1 s. */
export function catchAt(h: ScenarioHarness, atS: number): void {
  h.press({ code: "Space", atS, holdS: 0.1 });
}

/** Summary of the air after `fromS`. */
export interface AirSummary {
  /** Highest rise of the board origin above its start height, m. */
  readonly riseM: number;
  readonly maxClearanceM: number;
  readonly maxPitchRad: number;
  readonly airtimeS: number;
  readonly landingUpDot: number | null;
  /** Roll about the board's X accumulated in the air; heading change from `fromS` on, rad. */
  readonly rollRad: number;
  readonly yawRad: number;
  readonly bailed: boolean;
  readonly popped: boolean;
}

export function airSummary(h: ScenarioHarness, fromS: number): AirSummary {
  const records = h.since(fromS);
  const startY = records[0]?.board.transform.positionM.y ?? 0;
  const landings = h.eventsOf("BoardLanded").filter((e) => e.timeS >= fromS);
  const main = [...landings].sort((a, b) => b.airtimeS - a.airtimeS)[0];
  let rollRad = 0;
  let yawRad = 0;
  let prev: StepRecord | undefined;
  for (const r of records) {
    if (prev !== undefined) {
      const dt = r.timeS - prev.timeS;
      // Yaw = change of the board's heading (unwrapped), not ∫ω_y: a flip about a pitched
      // axis has a world-Y component that is not a heading change.
      yawRad += wrap(h.headingRad(r.board) - h.headingRad(prev.board));
      if (!r.board.grounded) {
        const x = Transform.toWorldDirection(r.board.transform, Vec3.UNIT_X);
        rollRad += Vec3.dot(r.board.angularVelocityRadps, x) * dt;
      }
    }
    prev = r;
  }
  return {
    riseM: Math.max(0, ...records.map((r) => r.board.transform.positionM.y - startY)),
    maxClearanceM: Math.max(0, ...records.map((r) => r.wheelClearanceM)),
    maxPitchRad: Math.max(...records.map((r) => h.pitchRad(r.board))),
    airtimeS: main?.airtimeS ?? 0,
    landingUpDot: main?.upDot ?? null,
    rollRad,
    yawRad,
    bailed: h.eventsOf("RiderBailed").some((e) => e.timeS >= fromS),
    popped: h.eventsOf("BoardPopped").some((e) => e.timeS >= fromS),
  };
}

/** Both feet attached. */
export function feetOn(h: ScenarioHarness): boolean {
  return h.rider.front.contact === "attached" && h.rider.back.contact === "attached";
}

/** Horizontal speed, m/s. */
export function horizontalSpeed(r: StepRecord): number {
  const v = r.board.linearVelocityMps;
  return Math.hypot(v.x, v.z);
}

export const STANCES: readonly Stance[] = ["regular", "goofy"];

function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
