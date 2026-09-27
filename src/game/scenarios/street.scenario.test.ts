import { afterEach, describe, expect, it } from "vitest";
import {
  createStreetCourseLevel,
  Level,
  levelGrindEdges,
  WORLD_CONFIG,
} from "../../contexts/world";
import { Vec3 } from "../../shared";
import type { ScenarioHarness, StepRecord } from "./scenario-harness";
import { ScenarioHarness as Harness } from "./scenario-harness";
import { awayFrom, catchAt, feetOn, loadAndPop } from "./scenario-helpers";

/*
 * RIDER ON THE STREET COURSE (full loop, real Rapier, the `?level=street` geometry), with
 * the existing gesture timelines and adapted spawns: an ollie down the 7-stair with a
 * Space catch (the park's stairs ollie), an ollie to 50-50 on the funbox's flat rail (G1),
 * a 50-50 down the kinked rail whose lock carries on across the kink, an ollie from the
 * 7-stair's landing onto its centre handrail (a 50-50 down it), and a manual across a
 * manual pad (↓ held, no pop). None may bail.
 */

const open: ScenarioHarness[] = [];
afterEach(() => {
  for (const h of open.splice(0)) h.dispose();
});

const T = 30_000;
const STREET = createStreetCourseLevel();
const S = WORLD_CONFIG.street;

/** The course with the board spawned at ground point (x, y, z), heading `headingRad`. */
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

function bails(h: ScenarioHarness): string[] {
  return [
    ...h.eventsOf("RiderBailed").map((e) => `rider: ${e.reason}`),
    ...h.eventsOf("TrickBailed").map((e) => `trick: ${e.name ?? "?"} (${e.reason})`),
  ];
}

/** Runs until the board will reach `xM` in `leadS` at its current speed. */
function runUntilX(h: ScenarioHarness, xM: number, leadS: number): void {
  for (let i = 0; i < 2400; i += 1) {
    const x = h.board.transform.positionM.x;
    if (x + h.board.linearVelocityMps.x * leadS >= xM) return;
    h.run(1 / 120);
  }
}

function lockedSteps(h: ScenarioHarness): StepRecord[] {
  return h.records.filter((r) => r.rider.grind !== null);
}

/** No explosion: speeds and spin stay physical all along. */
function expectSane(h: ScenarioHarness): void {
  for (const r of h.records) {
    expect(Vec3.length(r.board.linearVelocityMps)).toBeLessThan(9);
    expect(Vec3.length(r.board.angularVelocityRadps)).toBeLessThan(70);
  }
}

describe("rider on the street course", () => {
  it(
    "ollies down the 7-stair from the spawn with a Space catch and lands clean",
    async () => {
      const h = await Harness.create({ level: STREET });
      open.push(h);
      h.run(0.3);
      const t0 = h.timeS;
      h.launch(4.5);
      const nosingX = S.bigStairs.xM;
      runUntilX(h, nosingX - 0.15, 0.22);
      loadAndPop(h, 0.2);
      h.foot("front", awayFrom("tail"), 0.25, 0.15);
      catchAt(h, 0.5);
      h.run(2.5);
      expect(h.eventsOf("BoardPopped").filter((e) => e.timeS >= t0)).toHaveLength(1);
      expect(h.eventsOf("TrickLanded").map((e) => e.name)).toEqual(["Ollie"]);
      expect(bails(h)).toEqual([]);
      expect(h.board.wheelsDown).toBe(4);
      const footX = nosingX + S.bigStairs.stepCount * S.bigStairs.runM;
      expect(h.board.transform.positionM.x).toBeGreaterThan(footX + 1);
      expect(h.board.transform.positionM.y).toBeLessThan(0.2);
      expect(feetOn(h)).toBe(true);
      expectSane(h);
    },
    T,
  );

  it(
    "rolls up the funbox's bank and ollies onto its flat rail, nothing held: a 50-50, rolls off the end, lands clean",
    async () => {
      // G1's approach: 0.15 m beside the rail, heading 0.03 rad toward it, full load.
      const railZ = S.funbox.zM + S.funbox.topRail.zM;
      const h = await streetAt(0, 0, railZ + 0.15, 0.03);
      h.launch(5);
      const railStartX = S.funbox.xM - S.funbox.topRail.lengthM / 2;
      runUntilX(h, railStartX - 1.0, 0.34);
      loadAndPop(h, 0.32);
      h.foot("front", awayFrom("tail"), 0.37, 0.15);
      h.run(3);
      const [start, ...more] = h.eventsOf("GrindStarted");
      expect(more).toEqual([]);
      expect(start?.grind).toBe("fiftyFifty");
      expect(start?.obstacleId).toBe("funbox");
      expect(start?.name).toMatch(/^(FS|BS) 50-50$/);
      const [end] = h.eventsOf("GrindEnded");
      expect(end?.exit).toBe("rollOff");
      expect(end?.durationS).toBeGreaterThan(0.5);
      // It rode on top of the bar, over the funbox's top.
      for (const r of lockedSteps(h).slice(12)) {
        expect(Math.abs(r.board.transform.positionM.z - railZ)).toBeLessThan(0.02);
      }
      expect(h.eventsOf("TrickLanded").map((e) => e.name)).toEqual([start?.name]);
      expect(bails(h)).toEqual([]);
      expect(h.board.wheelsDown).toBe(4);
      expectSane(h);
    },
    T,
  );

  it(
    "50-50 onto the kinked rail's top flat: the one lock carries on across the kink onto the run down",
    async () => {
      const railZ = S.smallStairs.zM;
      const platformY = S.smallStairs.stepCount * S.smallStairs.riseM;
      const kinkX = S.smallStairs.xM;
      const railStartX = kinkX - S.kinkedRail.flatTopM;
      const h = await streetAt(kinkX - 6.1, platformY, railZ + 0.15, 0.03);
      h.launch(4);
      runUntilX(h, railStartX - 1.5, 0.34);
      loadAndPop(h, 0.32);
      h.foot("front", awayFrom("tail"), 0.37, 0.15);
      // Until the board is well down the run. (At the second kink, onto the bottom flat, a
      // rigid board locked by its midpoint wedges between the two runs: a rider hand-off.)
      const downX = kinkX + 0.45;
      for (let i = 0; i < 360 && h.board.transform.positionM.x < downX; i += 1) h.run(1 / 120);
      const [start, ...more] = h.eventsOf("GrindStarted");
      expect(more).toEqual([]);
      expect(start?.obstacleId).toBe("kinked-rail");
      expect(start?.grind).toBe("fiftyFifty");
      expect(h.eventsOf("GrindEnded")).toEqual([]); // still the same lock
      const locked = lockedSteps(h).map((r) => r.board.transform.positionM.x);
      expect(Math.min(...locked)).toBeLessThan(kinkX - 1); // on the top flat …
      expect(Math.max(...locked)).toBeGreaterThanOrEqual(downX); // … and down the run
      // Down the run the board follows the rail's slope (nose down).
      const slope = Math.atan2(S.smallStairs.riseM, S.smallStairs.runM);
      expect(h.pitchRad()).toBeLessThan(-0.6 * slope);
      expect(bails(h)).toEqual([]);
      expectSane(h);
    },
    T,
  );

  it(
    "ollies from the 7-stair's landing onto the centre handrail: a 50-50 down it, rolls off the end, lands clean at the bottom",
    async () => {
      const rail = levelGrindEdges(STREET.obstacles).find((e) => e.id === "big-stairs:handrail");
      if (rail === undefined) throw new Error("no handrail");
      const landingY = S.bigStairs.stepCount * S.bigStairs.riseM;
      // The bar's top end is ≈ 0.35 m above the landing: an ollie clears it. The bar then
      // drops at the stairs' 24° — faster than a board coming down from its pop — so the
      // board meets it part way down. At 2.75 m/s it locks at full speed for pops 0.5–0.85 m
      // before the bar's top end (this is the middle). Earlier pops come down on the very
      // top end, where the lock stalls the tail truck at the bar's end (ADR 0012) before
      // gravity takes it down; later ones hit the end of the bar.
      const h = await streetAt(S.bigStairs.xM - 4.5, landingY, rail.startM.z + 0.15, 0.03);
      h.launch(2.75);
      runUntilX(h, rail.startM.x - 0.68, 0.34);
      loadAndPop(h, 0.32);
      h.foot("front", awayFrom("tail"), 0.37, 0.15);
      h.run(3.5);
      const [start, ...more] = h.eventsOf("GrindStarted");
      expect(more).toEqual([]);
      expect(start?.obstacleId).toBe("big-stairs");
      expect(start?.grind).toBe("fiftyFifty");
      expect(start?.name).toMatch(/^(FS|BS) 50-50$/);
      const [end] = h.eventsOf("GrindEnded");
      expect(end?.exit).toBe("rollOff");
      expect(end?.durationS).toBeGreaterThan(0.3);
      const locked = lockedSteps(h);
      // It locks on the upper half of the bar and rides it on top, nose down its slope, and
      // never stalls (gravity down the slope, no thrust: ≤ the free-fall gain).
      const midX = (rail.startM.x + rail.endM.x) / 2;
      expect(locked[0]?.board.transform.positionM.x).toBeLessThan(midX);
      const slope = Math.atan2(S.bigStairs.riseM, S.bigStairs.runM);
      for (const r of locked.slice(12)) {
        expect(Math.abs(r.board.transform.positionM.z - rail.startM.z)).toBeLessThan(0.03);
        expect(h.pitchRad(r.board)).toBeLessThan(-0.6 * slope);
        expect(Vec3.length(r.board.linearVelocityMps)).toBeGreaterThan(2);
      }
      const first = locked[0];
      const last = locked.at(-1);
      if (first === undefined || last === undefined) throw new Error("never locked");
      const dropM = first.board.transform.positionM.y - last.board.transform.positionM.y;
      const vIn = Vec3.length(first.board.linearVelocityMps);
      expect(Vec3.length(last.board.linearVelocityMps)).toBeLessThanOrEqual(
        Math.sqrt(vIn * vIn + 2 * 9.81 * dropM) + 0.05,
      );
      // Clean at the bottom: one landing, the 50-50's name, on four wheels past the foot.
      expect(h.eventsOf("TrickLanded").map((e) => e.name)).toEqual([start?.name]);
      expect(bails(h)).toEqual([]);
      expect(h.board.wheelsDown).toBe(4);
      const footX = S.bigStairs.xM + S.bigStairs.stepCount * S.bigStairs.runM;
      expect(h.board.transform.positionM.x).toBeGreaterThan(footX + 1);
      expect(h.board.transform.positionM.y).toBeLessThan(0.2);
      expect(feetOn(h)).toBe(true);
      expectSane(h);
    },
    T,
  );

  it(
    "manuals across the low manual pad (↓ held, no pop) and rolls off its end without a bail",
    async () => {
      const [pad] = S.manualPads;
      if (pad === undefined) throw new Error("no manual pad");
      const startX = pad.xM - pad.lengthM / 2 + 0.5;
      const h = await streetAt(startX, pad.heightM, pad.zM, 0);
      const t0 = h.timeS;
      h.launch(3.5);
      h.foot("back", "down", 0, 1.3);
      h.run(0.6);
      // Mid-pad: in the manual (nose up), on the pad.
      expect(h.pitchRad()).toBeGreaterThan(0.08);
      expect(h.board.transform.positionM.y).toBeGreaterThan(pad.heightM);
      h.run(2.4);
      expect(h.eventsOf("BoardPopped").filter((e) => e.timeS >= t0)).toEqual([]);
      expect(bails(h)).toEqual([]);
      // Off the end, rolling on the ground on four wheels, feet on.
      expect(h.board.transform.positionM.x).toBeGreaterThan(pad.xM + pad.lengthM / 2 + 1);
      expect(h.board.transform.positionM.y).toBeLessThan(0.1);
      expect(h.board.wheelsDown).toBe(4);
      expect(feetOn(h)).toBe(true);
      expectSane(h);
    },
    T,
  );
});
