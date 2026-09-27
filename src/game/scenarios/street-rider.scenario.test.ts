import { afterEach, describe, expect, it } from "vitest";
import { Level } from "../../contexts/world";
import { STREET_CONFIG } from "../../maps/street/street.config";
import { createStreetCourseLevel } from "../../maps/street/street-course";
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
 * RIDER ON THE STREET COURSE'S TRANSITIONS AND DROPS (M3, full loop, real Rapier, `?map=street`),
 * ported from the removed park (GAME.md): rolling up the bank-to-ledge's bank and the east
 * quarter pipe and back down, carving into the quarter pipe, an ollie off the euro gap's
 * drop (the park's kicker ollie: the street has no kicker) and a kickflip down the 7-stair.
 * (The park's ollie down its stairs is `street.scenario.test.ts`'s ollie down the 7-stair.)
 * None may bail. These are the basis for the montage.
 */

const open: ScenarioHarness[] = [];
afterEach(() => {
  for (const h of open.splice(0)) h.dispose();
});

const T = 20_000;
const STREET = createStreetCourseLevel();
const S = STREET_CONFIG;
const QP_TOE_X = S.quarterPipe.toeXM;
const GAP = S.gapPlatform;
const STAIRS_FOOT_X = S.bigStairs.xM + (S.bigStairs.stepCount - 1) * S.bigStairs.runM;

/** The course with the board spawned at (x, y, z), heading `headingRad` (0 = +X). */
async function streetAt(x: number, y: number, z: number, headingRad = 0): Promise<ScenarioHarness> {
  const level = Level.create({
    id: STREET.id,
    name: STREET.name,
    obstacles: STREET.obstacles,
    spawn: { positionM: Vec3.create(x, y, z), headingRad },
  });
  const h = await Harness.create({ level });
  open.push(h);
  h.run(0.3);
  return h;
}

/** The map's spawn (the 7-stair's landing). */
async function streetSpawn(): Promise<ScenarioHarness> {
  const h = await Harness.create({ level: STREET });
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

describe("rider on the street course's transitions and drops", () => {
  it(
    "rides up the bank-to-ledge's 25° bank at 3.3 m/s and rolls back down (fakie), no bail",
    async () => {
      // 3.3 m/s stops just short of the ledge block on top of the 0.6 m bank.
      const h = await streetAt(S.bankLedge.xM - 4, 0, S.bankLedge.zM + 1.5);
      const t0 = h.timeS;
      h.launch(3.3);
      h.run(4);
      const ys = h.since(t0).map((r) => r.board.transform.positionM.y);
      expect(Math.max(...ys)).toBeGreaterThan(0.35);
      expect(h.board.linearVelocityMps.x).toBeLessThan(-1);
      expect(bails(h)).toEqual([]);
      expect(feetOn(h)).toBe(true);
    },
    T,
  );

  it(
    "climbs the east quarter pipe at 4 m/s, stalls and comes back fakie, no bail",
    async () => {
      const h = await streetAt(QP_TOE_X - 2, 0, 1);
      const t0 = h.timeS;
      h.launch(4);
      h.run(4);
      const records = h.since(t0);
      const ys = records.map((r) => r.board.transform.positionM.y);
      expect(Math.max(...ys)).toBeGreaterThan(0.5);
      // Came back down the transition rolling fakie, out across the course.
      expect(Math.min(...records.map((r) => r.board.linearVelocityMps.x))).toBeLessThan(-2);
      expect(bails(h)).toEqual([]);
      expect(feetOn(h)).toBe(true);
    },
    T,
  );

  it(
    "ollies off the euro gap's 0.6 m drop and lands on the flat, clean",
    async () => {
      const h = await streetAt(GAP.xM - 5, GAP.heightM, GAP.zM);
      const t0 = h.timeS;
      h.launch(4.5);
      ollieAt(h, GAP.xM - 0.3);
      h.run(2);
      expect(h.eventsOf("BoardPopped").filter((e) => e.timeS >= t0)).toHaveLength(1);
      expect(h.eventsOf("TrickLanded").map((e) => e.name)).toEqual(["Ollie"]);
      expect(bails(h)).toEqual([]);
      expect(h.board.wheelsDown).toBe(4);
      expect(h.board.transform.positionM.x).toBeGreaterThan(GAP.xM + 3);
      expect(h.board.transform.positionM.y).toBeLessThan(0.1);
      expect(feetOn(h)).toBe(true);
    },
    T,
  );

  it(
    "kickflips down the 7-stair from the spawn (airtime predicted to the real landing) and lands clean",
    async () => {
      const h = await streetSpawn();
      const t0 = h.timeS;
      h.launch(4.5);
      for (let i = 0; i < 1200; i += 1) {
        const x = h.board.transform.positionM.x;
        if (x + h.board.linearVelocityMps.x * 0.22 >= S.bigStairs.xM - 0.15) break;
        h.run(1 / 120);
      }
      const tPop = h.timeS;
      loadAndPop(h, 0.2);
      h.foot("front", heel(h.stance), 0.25, 0.08);
      h.run(0.3);
      spaceWhenDone(h, tPop, 2 * Math.PI, 0);
      // Down and rolling out, before the roll-out carries it up the funbox's bank.
      h.run(1.2);
      const air = airSummary(h, tPop);
      expect(Math.abs(Math.abs(air.rollRad) - 2 * Math.PI)).toBeLessThan(0.4);
      expect(bails(h)).toEqual([]);
      expect(h.board.wheelsDown).toBe(4);
      expect(h.board.transform.positionM.x).toBeGreaterThan(STAIRS_FOOT_X + 1);
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
      `carves (${edge} edge) into the east quarter pipe at ${headingRad} rad and back out, no bail`,
      async () => {
        const h = await streetAt(QP_TOE_X - 3, 0, 1, headingRad);
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
