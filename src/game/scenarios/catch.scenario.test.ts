import { afterEach, describe, expect, it } from "vitest";
import { RIDER_CONFIG } from "../../contexts/rider";
import { Vec3 } from "../../shared";
import type { ScenarioHarness, StepRecord } from "./scenario-harness";
import {
  airSummary,
  awayFrom,
  catchAt,
  FULL_POP_S,
  feetOn,
  guideFoot,
  loadAndPop,
  rolling,
  spaceWhenDone,
  swipe,
} from "./scenario-helpers";

/*
 * MECHANICS.md "Catch" — feet, not magic — and scenario 9a: a catch too far off still
 * bails, Space on a board still whipping round does not catch, and a caught board is never
 * flicked (its angular acceleration stays within `catchMaxAlphaRadps2`).
 */

const open: ScenarioHarness[] = [];
afterEach(() => {
  for (const h of open.splice(0)) h.dispose();
});

const T = 30_000;
const TAU = 2 * Math.PI;
const t = RIDER_CONFIG.tricks;

async function start(): Promise<ScenarioHarness> {
  const h = await rolling(1.3);
  open.push(h);
  return h;
}

/** A full pop with the level, and a kickflip swipe `flickAtS` after the pop's start. */
function kickflip(h: ScenarioHarness, flickAtS: number, units: 1 | 2 = 1): void {
  loadAndPop(h, FULL_POP_S, "tail");
  h.foot(guideFoot("tail"), awayFrom("tail"), FULL_POP_S + 0.05, 0.1);
  swipe(h, guideFoot("tail"), "heel", flickAtS, units, 0.06);
}

/** Runs until `done` (checked each step) or touchdown; true if `done` fired in the air. */
function runUntil(h: ScenarioHarness, done: () => boolean, maxS = 1.5): boolean {
  for (let i = 0; i < maxS * 120; i += 1) {
    h.run(1 / 120);
    if (h.timeS > 0 && !h.board.grounded && done()) return true;
    if (h.board.grounded && h.eventsOf("BoardLanded").length > 0 && i > 60) return false;
  }
  return false;
}

describe("9a. the catch is feet, not magic", () => {
  it(
    "a shove caught late, ≈ 0.4 rad past 180° (inside the cone, beyond the correction cap), just before touchdown: it catches, and still bails (offAngle)",
    async () => {
      // MECHANICS 9a asks for a ROLL error of ≈ 0.45 rad. On flat that one cannot be made
      // to bail: an under-rotated flip closes its error before touchdown (the feet ride it
      // in), an uncaught flip overshoots by ≤ 0.35 rad before it lands, and 0.45 is inside
      // landTiltRad (0.5). A shove ends earlier in the air (shoveCompleteFraction) and keeps
      // turning past 180° uncaught; caught ≈ 0.4 rad past, it comes down beyond the landing
      // yaw tolerance (0.35 rad): the feet cannot turn it back in time.
      const h = await start();
      const t0 = h.timeS;
      loadAndPop(h, FULL_POP_S, "tail");
      h.foot(guideFoot("tail"), awayFrom("tail"), FULL_POP_S + 0.05, 0.1);
      swipe(h, "back", "heel", FULL_POP_S + 0.05, 1);
      const reached = runUntil(h, () => Math.abs(airSummary(h, t0).yawRad) >= Math.PI + 0.4);
      expect(reached).toBe(true);
      const error = Math.abs(airSummary(h, t0).yawRad) - Math.PI;
      expect(error).toBeGreaterThan(t.catchMaxCorrectionRad);
      expect(error).toBeLessThan(t.catchYawRad);
      catchAt(h, 0);
      h.run(1 / 60);
      expect(feetOn(h)).toBe(true); // caught: it was inside the cone
      h.run(1.5);
      expect(h.eventsOf("RiderBailed").map((e) => e.reason)).toContain("offAngle");
      expect(h.eventsOf("TrickLanded").filter((e) => e.timeS >= t0)).toEqual([]);
    },
    T,
  );

  it(
    "an under-rotated flip caught at ≈ 0.45 rad of roll error is ridden in by the feet (the error closes before touchdown)",
    async () => {
      const h = await start();
      const t0 = h.timeS;
      kickflip(h, FULL_POP_S + 0.05);
      const reached = runUntil(h, () => Math.abs(airSummary(h, t0).rollRad) >= TAU - 0.47);
      expect(reached).toBe(true);
      catchAt(h, 0);
      h.run(1.5);
      expect(h.eventsOf("TrickLanded").map((e) => e.name)).toEqual(["Kickflip"]);
    },
    T,
  );

  it(
    "Space while |ω| > catchMaxOmegaRadps (upright mid double flip) does not catch",
    async () => {
      const h = await start();
      const t0 = h.timeS;
      kickflip(h, FULL_POP_S + 0.05, 2);
      // Past the first turn, upright again, still spinning at the double's rate.
      const upright = runUntil(h, () => {
        const roll = Math.abs(airSummary(h, t0).rollRad);
        return roll >= TAU - 0.1 && roll <= TAU + 0.2;
      });
      expect(upright).toBe(true);
      expect(Vec3.length(h.board.angularVelocityRadps)).toBeGreaterThan(t.catchMaxOmegaRadps);
      catchAt(h, 0);
      h.run(0.06);
      expect(feetOn(h)).toBe(false);
    },
    T,
  );

  it(
    "a caught board is never flicked: its angular acceleration stays ≤ catchMaxAlphaRadps2",
    async () => {
      const h = await start();
      const t0 = h.timeS;
      kickflip(h, FULL_POP_S + 0.05);
      h.run(FULL_POP_S + 0.15);
      spaceWhenDone(h, t0, TAU, 0);
      h.run(1.5);
      const air = airSummary(h, t0);
      expect(air.bailed).toBe(false);
      // Steps in the air where only the catch acts (the flip channel has ended).
      const records = h.since(t0);
      let checked = 0;
      for (let i = 1; i < records.length; i += 1) {
        const a = records[i - 1] as StepRecord;
        const b = records[i] as StepRecord;
        const labels = b.forces.map((f) => f.label);
        if (b.board.grounded || a.board.grounded || !labels.includes("catch")) continue;
        if (labels.some((l) => l !== "catch")) continue;
        const alpha =
          Vec3.length(Vec3.sub(b.board.angularVelocityRadps, a.board.angularVelocityRadps)) /
          (b.timeS - a.timeS);
        // A small allowance for the deck's own torque-free precession (its inertia is not
        // round): the catch itself is capped at catchMaxAlphaRadps2.
        expect(alpha).toBeLessThanOrEqual(t.catchMaxAlphaRadps2 * 1.1);
        checked += 1;
      }
      expect(checked).toBeGreaterThan(3);
    },
    T,
  );
});
