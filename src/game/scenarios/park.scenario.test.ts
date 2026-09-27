import { afterEach, describe, expect, it } from "vitest";
import { createSkateparkLevel, Level } from "../../contexts/world";
import { Vec3 } from "../../shared";
import type { ScenarioHarness } from "./scenario-harness";
import { ScenarioHarness as Harness } from "./scenario-harness";
import {
  airSummary,
  awayFrom,
  catchAt,
  feetOn,
  heel,
  loadAndPop,
  spaceWhenDone,
  toe,
} from "./scenario-helpers";

/*
 * RIDER ON THE PARK (M3, full loop, real Rapier, the `?level=park` geometry): rolling up
 * a bank and a quarter pipe and back down, an ollie off the kicker and down the 5-stair.
 * None may bail. These are the basis for the montage.
 */

const open: ScenarioHarness[] = [];
afterEach(() => {
  for (const h of open.splice(0)) h.dispose();
});

const T = 20_000;
const PARK = createSkateparkLevel();

/** The park with the board spawned at (x, y, z), heading `headingRad` (0 = +X). */
async function parkAt(x: number, y: number, z: number, headingRad = 0): Promise<ScenarioHarness> {
  const level = Level.create({
    id: PARK.id,
    name: PARK.name,
    obstacles: PARK.obstacles,
    spawn: { positionM: Vec3.create(x, y, z), headingRad },
  });
  const h = await Harness.create({ level });
  open.push(h);
  h.run(0.3);
  return h;
}

/** Park spawn (top of the stairs). */
async function parkSpawn(): Promise<ScenarioHarness> {
  const h = await Harness.create({ level: PARK });
  open.push(h);
  h.run(0.3);
  return h;
}

function bails(h: ScenarioHarness): string[] {
  return h.eventsOf("RiderBailed").map((e) => e.reason);
}

/** Loads so the pop fires when the board reaches `popAtXM` (ollie, W, Space in the air). */
function ollieAt(h: ScenarioHarness, popAtXM: number): void {
  for (let i = 0; i < 1200; i += 1) {
    const x = h.board.transform.positionM.x;
    const vx = h.board.linearVelocityMps.x;
    if (x + vx * 0.22 >= popAtXM) break;
    h.run(1 / 120);
  }
  loadAndPop(h, 0.2);
  h.foot("front", awayFrom("tail"), 0.25, 0.15);
  catchAt(h, 0.5);
}

describe("rider on the park", () => {
  it(
    "rides up the bank at 4 m/s and rolls back down (fakie), no bail",
    async () => {
      const h = await parkAt(21, 0, 0);
      const t0 = h.timeS;
      h.launch(4);
      h.run(4);
      const ys = h.since(t0).map((r) => r.board.transform.positionM.y);
      expect(Math.max(...ys)).toBeGreaterThan(0.4);
      expect(h.board.linearVelocityMps.x).toBeLessThan(-1);
      expect(bails(h)).toEqual([]);
      expect(feetOn(h)).toBe(true);
    },
    T,
  );

  it(
    "climbs the quarter pipe at 4 m/s, stalls and comes back fakie, no bail",
    async () => {
      const h = await parkAt(10, 0, -12);
      const t0 = h.timeS;
      h.launch(4);
      h.run(4);
      const records = h.since(t0);
      const ys = records.map((r) => r.board.transform.positionM.y);
      expect(Math.max(...ys)).toBeGreaterThan(0.5);
      // Came back down the transition rolling fakie (then on up the other quarter pipe).
      expect(Math.min(...records.map((r) => r.board.linearVelocityMps.x))).toBeLessThan(-2);
      expect(bails(h)).toEqual([]);
      expect(feetOn(h)).toBe(true);
    },
    T,
  );

  it(
    "ollies off the kicker's lip and lands on the flat, clean",
    async () => {
      const h = await parkAt(7, 0, 0);
      const t0 = h.timeS;
      h.launch(4.5);
      ollieAt(h, 13.3);
      h.run(2);
      expect(h.eventsOf("BoardPopped").filter((e) => e.timeS >= t0)).toHaveLength(1);
      expect(bails(h)).toEqual([]);
      expect(h.board.wheelsDown).toBe(4);
      expect(h.board.transform.positionM.x).toBeGreaterThan(15);
      expect(feetOn(h)).toBe(true);
    },
    T,
  );

  it(
    "ollies down the 5-stair with a Space catch and lands clean",
    async () => {
      const h = await parkSpawn();
      const t0 = h.timeS;
      h.launch(4.5);
      ollieAt(h, -0.15);
      h.run(2);
      expect(h.eventsOf("BoardPopped").filter((e) => e.timeS >= t0)).toHaveLength(1);
      expect(bails(h)).toEqual([]);
      expect(h.board.wheelsDown).toBe(4);
      expect(h.board.transform.positionM.x).toBeGreaterThan(2);
      expect(h.board.transform.positionM.y).toBeLessThan(0.2);
      expect(feetOn(h)).toBe(true);
    },
    T,
  );

  it(
    "kickflips down the 5-stair (airtime predicted to the real landing) and lands clean",
    async () => {
      const h = await parkSpawn();
      const t0 = h.timeS;
      h.launch(4.5);
      for (let i = 0; i < 1200; i += 1) {
        const x = h.board.transform.positionM.x;
        if (x + h.board.linearVelocityMps.x * 0.22 >= -0.15) break;
        h.run(1 / 120);
      }
      const tPop = h.timeS;
      loadAndPop(h, 0.2);
      h.foot("front", heel(h.stance), 0.25, 0.08);
      h.run(0.3);
      spaceWhenDone(h, tPop, 2 * Math.PI, 0);
      h.run(2);
      const air = airSummary(h, tPop);
      expect(Math.abs(Math.abs(air.rollRad) - 2 * Math.PI)).toBeLessThan(0.4);
      expect(bails(h)).toEqual([]);
      expect(h.board.wheelsDown).toBe(4);
      expect(h.board.transform.positionM.y).toBeLessThan(0.2);
      expect(
        h
          .eventsOf("TrickLanded")
          .filter((e) => e.timeS >= t0)
          .map((e) => e.name),
      ).toEqual(["Kickflip"]);
    },
    T,
  );

  for (const [edge, headingRad] of [
    ["toe", 0.4],
    ["heel", -0.4],
    ["toe", 0],
  ] as const) {
    it(
      `carves (${edge} edge) into the quarter pipe at ${headingRad} rad and back out, no bail`,
      async () => {
        const h = await parkAt(9, 0, -12, headingRad);
        h.launch(4.5);
        const dir = edge === "toe" ? toe(h.stance) : heel(h.stance);
        h.foot("front", dir, 0.1, 1.5);
        h.foot("back", dir, 0.1, 1.5);
        h.run(3);
        expect(bails(h)).toEqual([]);
        expect(feetOn(h)).toBe(true);
      },
      T,
    );
  }
});
