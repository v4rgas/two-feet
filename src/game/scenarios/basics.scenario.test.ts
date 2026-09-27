import { afterEach, describe, expect, it } from "vitest";
import { BoardSpec } from "../../contexts/board";
import { INPUT_CONFIG } from "../../contexts/input";
import { RIDER_CONFIG } from "../../contexts/rider";
import { Transform } from "../../shared";
import type { ScenarioHarness } from "./scenario-harness";
import { feetOn, horizontalSpeed, rolling } from "./scenario-helpers";

/*
 * FULL-LOOP SCENARIOS — riding basics (push, carve, idle, tail hold, no free thrust).
 * Real Rapier + board + keyboard adapter + input + rider + loop, scripted keys.
 */

const open: ScenarioHarness[] = [];
async function track(p: Promise<ScenarioHarness>): Promise<ScenarioHarness> {
  const h = await p;
  open.push(h);
  return h;
}
afterEach(() => {
  for (const h of open.splice(0)) h.dispose();
});

const T = 20_000;

describe("push", () => {
  it(
    "Space rolls the board straight ahead, feet stay attached",
    async () => {
      const h = await track(rolling(1.3));
      expect(h.forwardSpeedMps()).toBeGreaterThan(3);
      expect(Math.abs(h.headingRad())).toBeLessThan(0.02);
      expect(Math.abs(h.board.transform.positionM.z)).toBeLessThan(0.02);
      expect(h.board.wheelsDown).toBe(4);
      expect(feetOn(h)).toBe(true);
      expect(h.eventsOf("FootDetached")).toHaveLength(0);
    },
    T,
  );
});

describe("carve", () => {
  for (const [key, sign] of [
    ["right", -1],
    ["left", 1],
  ] as const) {
    it(
      `both feet ${key} while rolling turns the heading ${sign < 0 ? "clockwise" : "counter-clockwise"}`,
      async () => {
        const h = await track(rolling(1.3));
        h.foot("front", key, 0, 1.2).foot("back", key, 0, 1.2).run(1.2);
        // +x (right key, toward +Z) leans onto the +Z wheels: clockwise seen from above (ADR 0003).
        expect(sign * h.headingRad()).toBeGreaterThan(0.3);
        expect(h.eventsOf("RiderBailed")).toHaveLength(0);
        expect(feetOn(h)).toBe(true);
        expect(h.board.wheelsDown).toBe(4);
      },
      T,
    );
  }
});

describe("10. idle", () => {
  it(
    "board and feet stay still for 10 s: no drift, no bail",
    async () => {
      const h = await track(rolling(0));
      const start = h.board.transform.positionM;
      const feetStart = h.rider.front.positionWorldM;
      h.run(10);
      const end = h.board.transform.positionM;
      expect(Math.hypot(end.x - start.x, end.z - start.z)).toBeLessThan(0.005);
      expect(Math.abs(end.y - start.y)).toBeLessThan(0.002);
      const feetEnd = h.rider.front.positionWorldM;
      expect(Math.hypot(feetEnd.x - feetStart.x, feetEnd.y - feetStart.y)).toBeLessThan(0.005);
      expect(h.events.filter((e) => e.type !== "SurfaceContactStarted")).toHaveLength(0);
      expect(feetOn(h)).toBe(true);
    },
    T,
  );
});

describe("7. tail press (↓ alone)", () => {
  for (const pushS of [0, 1.3]) {
    it(
      `${pushS > 0 ? "rolling" : "standing"}: 3 s of ↓ holds ≈ manualPitchRad, tail above −2 mm, no jitter, release does not pop`,
      async () => {
        const h = await track(rolling(pushS));
        const t0 = h.timeS;
        h.foot("back", "down", 0, 3).run(3.6);
        const spec = h.sim.spec;
        const held = h.since(t0 + 0.6).filter((r) => r.timeS <= t0 + 3);
        const tailY = h
          .since(t0)
          .map((r) => Transform.toWorldPoint(r.board.transform, BoardSpec.tailTipLocal(spec)).y);
        expect(Math.min(...tailY)).toBeGreaterThan(-0.002);
        const pitches = held.map((r) => h.pitchRad(r.board));
        const mean = pitches.reduce((a, p) => a + p, 0) / pitches.length;
        expect(Math.abs(mean - RIDER_CONFIG.tricks.manualPitchRad)).toBeLessThan(0.05);
        const jumps = pitches.slice(1).map((p, i) => Math.abs(p - (pitches[i] ?? p)));
        expect(Math.max(...jumps)).toBeLessThan(0.01);
        expect(h.eventsOf("BoardPopped")).toHaveLength(0);
        expect(h.eventsOf("RiderBailed")).toHaveLength(0);
        expect(h.board.wheelsDown).toBe(4);
      },
      T,
    );
  }
});

describe("11. nose press (W alone)", () => {
  it(
    "3 s of W holds ≈ −manualPitchRad, nose above −2 mm, release does not pop",
    async () => {
      const h = await track(rolling(1.3));
      const t0 = h.timeS;
      h.foot("front", "up", 0, 3).run(3.6);
      const spec = h.sim.spec;
      const held = h.since(t0 + 0.6).filter((r) => r.timeS <= t0 + 3);
      const noseY = h
        .since(t0)
        .map((r) => Transform.toWorldPoint(r.board.transform, BoardSpec.noseTipLocal(spec)).y);
      expect(Math.min(...noseY)).toBeGreaterThan(-0.002);
      const mean = held.reduce((a, r) => a + h.pitchRad(r.board), 0) / held.length;
      expect(Math.abs(mean + RIDER_CONFIG.tricks.manualPitchRad)).toBeLessThan(0.05);
      expect(h.eventsOf("BoardPopped")).toHaveLength(0);
      expect(h.eventsOf("RiderBailed")).toHaveLength(0);
      expect(h.board.wheelsDown).toBe(4);
    },
    T,
  );
});

describe("8. no free thrust: feet alone never speed the board up", () => {
  const dirs = ["up", "down", "left", "right"] as const;
  const combos: [string, string][] = [];
  const left = INPUT_CONFIG.keys.left;
  const right = INPUT_CONFIG.keys.right;
  for (const a of dirs) combos.push([left[a], ""], [right[a], ""]);
  for (const a of dirs) for (const b of dirs) combos.push([left[a], right[b]]);
  for (const [a, b] of [
    [left.up, left.left],
    [right.down, right.right],
  ] as const) {
    combos.push([a, b]);
  }

  for (const pushS of [0, 1.1]) {
    it(`${pushS > 0 ? "from ~3 m/s" : "from rest"}: every single key and pair held 5 s stays within +0.3 m/s`, async () => {
      for (const [a, b] of combos) {
        const h = await rolling(pushS);
        open.push(h);
        const last = h.records.at(-1);
        const startSpeed = last === undefined ? 0 : horizontalSpeed(last);
        const t0 = h.timeS;
        h.press({ code: a, atS: 0, holdS: 5 });
        if (b !== "") h.press({ code: b, atS: 0, holdS: 5 });
        h.run(5);
        const maxSpeed = Math.max(...h.since(t0).map(horizontalSpeed));
        expect(maxSpeed, `${a}+${b}`).toBeLessThan(startSpeed + 0.3);
      }
    }, 120_000);
  }
});
