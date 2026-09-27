import { afterEach, describe, expect, it } from "vitest";
import type { Stance } from "../../shared";
import type { ScenarioHarness } from "./scenario-harness";
import { ScenarioHarness as Harness } from "./scenario-harness";
import { horizontalSpeed, STANCES } from "./scenario-helpers";

/*
 * MECHANICS.md "Body spin" → "Steering" and scenario 12g: Q / E on the ground (not loaded,
 * not in a manual) turn the direction of travel left / right — counter-clockwise /
 * clockwise seen from above — in both stances and riding fakie, through the same lean →
 * truck steer path as carving. No thrust.
 */

const open: ScenarioHarness[] = [];
afterEach(() => {
  for (const h of open.splice(0)) h.dispose();
});

const T = 20_000;
const DEG = Math.PI / 180;

/** Direction of travel about world up (CCW from above, 0 = +X), rad. */
function travelRad(h: ScenarioHarness): number {
  const v = h.board.linearVelocityMps;
  return Math.atan2(-v.z, v.x);
}

function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** Rolling at 3 m/s (forward, or backwards = fakie), `code` held for 1 s. */
async function steer(
  stance: Stance,
  code: "KeyQ" | "KeyE",
  fakie: boolean,
): Promise<{ turnRad: number; h: ScenarioHarness; v0: number; t0: number }> {
  const h = await Harness.create({ stance });
  open.push(h);
  h.run(0.3);
  h.launch(fakie ? -3 : 3);
  h.run(0.3);
  const t0 = h.timeS;
  const before = travelRad(h);
  const last = h.records.at(-1);
  const v0 = last === undefined ? 0 : horizontalSpeed(last);
  h.press({ code, atS: 0, holdS: 1 });
  h.run(1);
  return { turnRad: wrap(travelRad(h) - before), h, v0, t0 };
}

describe("12g. Q / E steer on the ground", () => {
  for (const stance of STANCES) {
    for (const fakie of [false, true]) {
      const label = `${stance}${fakie ? ", fakie" : ""}`;
      it(
        `${label}: Q turns the travel left (CCW from above) ≥ 30°, E right; speed never rises; the deck leans`,
        async () => {
          const q = await steer(stance, "KeyQ", fakie);
          expect(q.turnRad).toBeGreaterThan(30 * DEG);
          const e = await steer(stance, "KeyE", fakie);
          expect(e.turnRad).toBeLessThan(-30 * DEG);
          for (const run of [q, e]) {
            const records = run.h.since(run.t0);
            for (const r of records) expect(horizontalSpeed(r)).toBeLessThan(run.v0 + 0.05);
            expect(Math.max(...records.map((r) => Math.abs(r.leanRad)))).toBeGreaterThan(0.03);
            expect(run.h.eventsOf("RiderBailed")).toEqual([]);
          }
        },
        T,
      );
    }
  }

  it(
    "not while loaded (Q / E wind up) and not in a manual",
    async () => {
      const h = await Harness.create({ stance: "regular" });
      open.push(h);
      h.run(0.3);
      h.launch(3);
      h.run(0.3);
      const before = travelRad(h);
      // ↓ alone (a tail manual) with Q held: no steer.
      h.press({ code: "ArrowDown", atS: 0, holdS: 0.6 }, { code: "KeyQ", atS: 0.05, holdS: 0.5 });
      h.run(0.6);
      expect(Math.abs(wrap(travelRad(h) - before))).toBeLessThan(5 * DEG);
      h.run(0.5);
      // ↓ + S (loaded) with Q held: a wind-up, no steer.
      const before2 = travelRad(h);
      h.press(
        { code: "ArrowDown", atS: 0, holdS: 1.2 },
        { code: "KeyS", atS: 0.02, holdS: 1.2 },
        { code: "KeyQ", atS: 0.1, holdS: 1 },
      );
      h.run(1.1);
      expect(h.rider.windUpRad).toBeGreaterThan(0.3);
      expect(Math.abs(wrap(travelRad(h) - before2))).toBeLessThan(5 * DEG);
    },
    T,
  );
});
