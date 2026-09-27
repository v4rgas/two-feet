/*
 * Shared gestures and measurements for the full-loop scenarios (test support only).
 * Timings are "natural keyboard" timings: what a player's fingers actually do.
 */
import type { Stance } from "../../shared";
import type { HarnessOptions, StepRecord } from "./scenario-harness";
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

/** The ollie gesture: tap the back foot ↓ for `tapS`, then slide the front foot (W). */
export function ollieGesture(
  h: ScenarioHarness,
  { tapS = 0.1, frontDelayS = 0.03, slide = true } = {},
): void {
  h.foot("back", "down", 0, tapS);
  if (slide) h.foot("front", "up", tapS + frontDelayS, 0.3);
}

/** Summary of one air session after `fromS`. */
export interface AirSummary {
  readonly maxClearanceM: number;
  readonly maxPitchRad: number;
  readonly airtimeS: number;
  readonly landingUpDot: number | null;
  readonly bailed: boolean;
}

export function airSummary(h: ScenarioHarness, fromS: number): AirSummary {
  const records = h.since(fromS);
  const landings = h.eventsOf("BoardLanded").filter((e) => e.timeS >= fromS);
  const main = [...landings].sort((a, b) => b.airtimeS - a.airtimeS)[0];
  return {
    maxClearanceM: Math.max(0, ...records.map((r) => r.wheelClearanceM)),
    maxPitchRad: Math.max(...records.map((r) => h.pitchRad(r.board))),
    airtimeS: main?.airtimeS ?? 0,
    landingUpDot: main?.upDot ?? null,
    bailed: h.eventsOf("RiderBailed").some((e) => e.timeS >= fromS),
  };
}

/** Both feet attached at the end. */
export function feetOn(h: ScenarioHarness): boolean {
  return h.rider.front.contact === "attached" && h.rider.back.contact === "attached";
}

/** Horizontal speed, m/s. */
export function horizontalSpeed(r: StepRecord): number {
  const v = r.board.linearVelocityMps;
  return Math.hypot(v.x, v.z);
}

export const STANCES: readonly Stance[] = ["regular", "goofy"];
