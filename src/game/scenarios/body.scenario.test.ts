import { afterEach, describe, expect, it } from "vitest";
import { RIDER_CONFIG } from "../../contexts/rider";
import { Vec3 } from "../../shared";
import type { ScenarioHarness } from "./scenario-harness";
import {
  airSummary,
  awayFrom,
  catchAt,
  feetOn,
  heel,
  horizontalSpeed,
  loadAndPop,
  rolling,
  STANCES,
} from "./scenario-helpers";

/*
 * MECHANICS.md "Body spin (Q / E)", scenarios 12a–12d: the wind-up, the air spin that eases
 * in and out, the board following the body through the feet (unless a flip or shove is
 * running), and landings forward / fakie / sideways. Q / E are released the way a player
 * does: when the spin, easing out, will stop at the wanted angle.
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
const { bodySpinAccelRadps2 } = RIDER_CONFIG.tricks;

function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** Unwrapped rider heading change since `fromS`, rad. */
function bodyTurnRad(h: ScenarioHarness, fromS: number): number {
  let turned = 0;
  const rs = h.since(fromS);
  for (let i = 1; i < rs.length; i += 1) {
    const a = rs[i - 1];
    const b = rs[i];
    if (a !== undefined && b !== undefined) turned += wrap(b.rider.headingRad - a.rider.headingRad);
  }
  return turned;
}

/**
 * Holds `code` from now (wind-up while loading), pops with a level, and releases it when
 * the easing-out spin will stop at `targetRad`. Returns the time the key went down.
 */
function spinPop(h: ScenarioHarness, code: "KeyQ" | "KeyE", targetRad: number): number {
  const t0 = h.timeS;
  h.keyDown(code);
  loadAndPop(h, 0.25);
  h.foot("front", awayFrom("tail"), 0.3, 0.15);
  for (let i = 0; i < 150; i += 1) {
    h.run(1 / 120);
    const rate = h.rider.bodySpinRateRadps;
    const stopsAt = Math.abs(bodyTurnRad(h, t0)) + (rate * rate) / (2 * bodySpinAccelRadps2);
    if (!h.board.grounded && stopsAt >= targetRad) break;
  }
  h.keyUp(code);
  return t0;
}

/** Space once the body has (nearly) turned `targetRad` and the board looks upright. */
function catchWhenTurned(h: ScenarioHarness, t0: number, targetRad: number): void {
  for (let i = 0; i < 100 && !h.board.grounded; i += 1) {
    if (Math.abs(bodyTurnRad(h, t0)) >= targetRad - 0.25 && h.tiltRad() <= 0.5) break;
    h.run(1 / 120);
  }
  catchAt(h, 0);
}

/** + when the board rolls toward the rider's front, − when it rolls fakie. */
function forwardness(h: ScenarioHarness): number {
  const v = h.board.linearVelocityMps;
  const r = h.rider.headingRad;
  return v.x * Math.cos(r) - v.z * Math.sin(r);
}

function trickNames(h: ScenarioHarness, fromS: number): string[] {
  return h
    .eventsOf("TrickLanded")
    .filter((e) => e.timeS >= fromS)
    .map((e) => e.name);
}

describe("12. body spin (Q / E)", () => {
  for (const stance of STANCES) {
    it(
      `12a ${stance}: body 180 (E wound up and held) lands rolling fakie, rider turned π, no speed gained`,
      async () => {
        const h = await track(rolling(1.3, { stance }));
        const v0 = h.forwardSpeedMps();
        const heading0 = h.rider.headingRad;
        const t0 = spinPop(h, "KeyE", Math.PI);
        catchWhenTurned(h, t0, Math.PI);
        h.run(1.5);
        expect(airSummary(h, t0).bailed).toBe(false);
        expect(h.board.wheelsDown).toBe(4);
        expect(feetOn(h)).toBe(true);
        expect(Math.abs(Math.abs(wrap(h.rider.headingRad - heading0)) - Math.PI)).toBeLessThan(
          0.35,
        );
        expect(forwardness(h)).toBeLessThan(-1); // rolling fakie
        for (const r of h.since(t0)) {
          if (Vec3.length(r.board.angularVelocityRadps) > 2) continue;
          expect(horizontalSpeed(r)).toBeLessThan(v0 + 0.3);
        }
        const names = trickNames(h, t0);
        expect(names).toHaveLength(1);
        expect(names[0]).toMatch(/180/);
      },
      T,
    );
  }

  it(
    "12a: the wind-up is a visible shoulder turn while loaded and starts the spin at the pop",
    async () => {
      const h = await track(rolling(1.3));
      h.keyDown("KeyE");
      h.foot("back", "down", 0, 0.3);
      h.foot("front", "down", 0.02, 0.35);
      h.run(0.28);
      expect(h.rider.windUpRad).toBeLessThan(-0.3); // E: clockwise from above
      h.run(0.1);
      // Popped: the wind-up became a spin (clockwise = negative), already turning.
      expect(h.board.grounded).toBe(false);
      expect(h.rider.bodySpinRateRadps).toBeLessThan(-1);
      expect(h.rider.windUpRad).toBe(0);
      h.keyUp("KeyE");
    },
    T,
  );

  it(
    "12b: body 360 (Q) lands rolling forward, rider back to the start heading",
    async () => {
      const h = await track(rolling(1.3));
      const heading0 = h.rider.headingRad;
      const t0 = spinPop(h, "KeyQ", 2 * Math.PI);
      catchWhenTurned(h, t0, 2 * Math.PI);
      h.run(1.5);
      expect(airSummary(h, t0).bailed).toBe(false);
      expect(Math.abs(bodyTurnRad(h, t0) - 2 * Math.PI)).toBeLessThan(0.4);
      expect(Math.abs(wrap(h.rider.headingRad - heading0))).toBeLessThan(0.35);
      expect(forwardness(h)).toBeGreaterThan(1);
      expect(h.board.wheelsDown).toBe(4);
      expect(trickNames(h, t0)).toHaveLength(1);
    },
    T,
  );

  it(
    "12c: line-up — E to about 90°, no catch, flat ground: a sideways bail, no explosion",
    async () => {
      const h = await track(rolling(1.3));
      const t0 = spinPop(h, "KeyE", Math.PI / 2);
      h.run(2);
      expect(airSummary(h, t0).bailed).toBe(true);
      for (const r of h.since(t0)) {
        expect(r.board.transform.positionM.y).toBeGreaterThan(0);
        expect(Vec3.length(r.board.linearVelocityMps)).toBeLessThan(8);
      }
    },
    T,
  );

  it(
    "12d: 180 kickflip — E wound up and held, A: board and body both turn π (board ≈ body), clean",
    async () => {
      const h = await track(rolling(1.3));
      const board0 = h.headingRad();
      const t0 = h.timeS;
      h.keyDown("KeyE");
      loadAndPop(h, 0.25);
      h.foot("front", heel(h.stance), 0.3, 0.08);
      for (let i = 0; i < 150; i += 1) {
        h.run(1 / 120);
        const rate = h.rider.bodySpinRateRadps;
        const stopsAt = Math.abs(bodyTurnRad(h, t0)) + (rate * rate) / (2 * bodySpinAccelRadps2);
        if (!h.board.grounded && stopsAt >= Math.PI) break;
      }
      h.keyUp("KeyE");
      for (let i = 0; i < 100 && !h.board.grounded; i += 1) {
        const rolled = Math.abs(airSummary(h, t0).rollRad) > 2 * Math.PI - 0.45;
        if (rolled && Math.abs(bodyTurnRad(h, t0)) >= Math.PI - 0.25 && h.tiltRad() <= 0.5) break;
        h.run(1 / 120);
      }
      catchAt(h, 0);
      h.run(1.5);
      const air = airSummary(h, t0);
      expect(air.bailed).toBe(false);
      expect(Math.abs(Math.abs(air.rollRad) - 2 * Math.PI)).toBeLessThan(0.4);
      // Both turned about π: the board's yaw relative to the body is about 0.
      expect(Math.abs(Math.abs(bodyTurnRad(h, t0)) - Math.PI)).toBeLessThan(0.35);
      expect(Math.abs(Math.abs(wrap(h.headingRad() - board0)) - Math.PI)).toBeLessThan(0.35);
      expect(forwardness(h)).toBeLessThan(-1); // rolling fakie
      expect(trickNames(h, t0)).toEqual(["BS 180 Kickflip"]);
    },
    T,
  );
});
