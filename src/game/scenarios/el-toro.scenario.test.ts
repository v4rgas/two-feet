import { afterEach, describe, expect, it } from "vitest";
import type { BoardSnapshot } from "../../contexts/board";
import { BOARD_CONFIG, BoardSpec } from "../../contexts/board";
import { BoardHarness, STEP_S } from "../../contexts/board/infrastructure/board-harness";
import { handrailZM, Level, obstacleCollider, obstacleGrindEdges } from "../../contexts/world";
import { createElToroLevel, EL_TORO, elToroPlazaHeightM } from "../../maps/el-toro/el-toro";
import type { DomainEvent } from "../../shared";
import { Quat, Transform, Vec3 } from "../../shared";
import type { StepRecord } from "./scenario-harness";
import { ScenarioHarness } from "./scenario-harness";
import {
  airSummary,
  awayFrom,
  catchAt,
  feetOn,
  horizontalSpeed,
  loadAndPop,
  playCombo,
} from "./scenario-helpers";

/*
 * EL TORO (`?map=el-toro`): the 20-stair, a 3.3 m drop over 6 m. Real Rapier, the map's
 * own geometry (the same convex pieces the renderer draws).
 *
 * BOARD ONLY: a level board at the top of a full pop, 5 or 7 m/s, falls ≈ 3.8 m and hits
 * the flat at ≈ 8.6 m/s: it must not tunnel (CCD is on; the wheels are 27 mm balls moving
 * 7 cm a step), must not bounce, must be on four wheels within a few steps, and must roll
 * away straight at its speed. A board dropped across the handrail at speed hits the bar.
 *
 * FULL LOOP: an ollie from the spawn (real pushes), a kickflip with a well-timed Space, and
 * a 50-50 down the handrail from the top all land. A hard landing never bails by impact
 * alone (MECHANICS.md "Land"): only the tilt / yaw / upside-down rules decide.
 */

const T = 60_000;
const LEVEL = createElToroLevel();
const S = EL_TORO.stairs;
const PLAZA_Y = elToroPlazaHeightM();
const FOOT_X = S.xM + S.stepCount * S.runM;
const SPEC = BoardSpec.create(BOARD_CONFIG.spec);
const REST_M = BoardSpec.restHeightM(SPEC);

// ── board only ──────────────────────────────────────────────────────────────

const boards: BoardHarness[] = [];
const riders: ScenarioHarness[] = [];
afterEach(() => {
  for (const h of boards.splice(0)) h.dispose();
  for (const h of riders.splice(0)) h.dispose();
});

interface Drop {
  readonly snaps: BoardSnapshot[];
  readonly events: DomainEvent[];
}

/** A level board in the air at (x, y, z) with velocity `v`, on El Toro, for `durationS`. */
async function drop(
  positionM: Vec3,
  velocityMps: Vec3,
  durationS: number,
  headingRad = 0,
): Promise<Drop> {
  const colliders = LEVEL.obstacles
    .filter((o) => o.id !== "ground")
    .map((o) => obstacleCollider(o));
  const spawn = Transform.create(positionM, Quat.fromAxisAngle(Vec3.UNIT_Y, headingRad));
  const h = await BoardHarness.create({ obstacles: colliders, spawn });
  boards.push(h);
  h.body.resetTo(spawn, velocityMps);
  const events: DomainEvent[] = [];
  h.bus.subscribeAll((e) => events.push(e));
  const snaps: BoardSnapshot[] = [];
  for (let i = 0; i < Math.round(durationS / STEP_S); i += 1) {
    h.step();
    snaps.push(h.system.snapshot);
  }
  return { snaps, events };
}

function landedEvents(d: Drop): Extract<DomainEvent, { type: "BoardLanded" }>[] {
  return d.events.filter(
    (e): e is Extract<DomainEvent, { type: "BoardLanded" }> => e.type === "BoardLanded",
  );
}

function headingOf(s: BoardSnapshot): number {
  const f = Transform.toWorldDirection(s.transform, Vec3.UNIT_X);
  return Math.atan2(-f.z, f.x);
}

describe("El Toro, board only: a 3.8 m fall onto the flat", () => {
  for (const [speed, startX] of [
    // Where a full pop's apex is when the board just clears the foot at that speed.
    [5, 2.6],
    [7, 0.5],
  ] as const) {
    it(
      `at ${speed} m/s: no tunneling, no bounce, four wheels within 3 steps, rolls away straight`,
      async () => {
        const top = PLAZA_Y + REST_M + 0.45;
        const d = await drop(Vec3.create(startX, top, 0), Vec3.create(speed, 0, 0), 2.5);
        const [land, ...more] = landedEvents(d);
        expect(more).toEqual([]); // one landing: no bounce
        expect(d.events.filter((e) => e.type === "BoardLeftGround")).toEqual([]);
        if (land === undefined) throw new Error("never landed");
        expect(land.airtimeS).toBeGreaterThan(0.85);
        expect(land.upDot).toBeGreaterThan(0.999);
        const i = d.snaps.findIndex((s) => s.tick >= land.tick);
        const at = d.snaps[i];
        if (at === undefined) throw new Error("no landing step");
        // On the flat, past the foot of the stairs, falling ≈ 8.6 m/s just before.
        expect(at.transform.positionM.x).toBeGreaterThan(FOOT_X + 0.5);
        expect(d.snaps[i - 1]?.linearVelocityMps.y ?? 0).toBeLessThan(-8);
        // No tunneling: the board origin never sinks more than a centimetre below its rest
        // height (the contact's softness), and it is back at rest height right after.
        for (const s of d.snaps) expect(s.transform.positionM.y).toBeGreaterThan(REST_M - 0.01);
        const after = d.snaps.slice(i);
        // Settled: four wheels down from within 3 steps of the touchdown, and it stays so.
        for (const s of after.slice(3)) expect(s.wheelsDown).toBe(4);
        // No explosive bounce: it never rises off the ground again.
        for (const s of after.slice(3)) {
          expect(s.linearVelocityMps.y).toBeLessThan(0.1);
          expect(Vec3.length(s.angularVelocityRadps)).toBeLessThan(0.5);
        }
        // Rolls away straight at its speed (rolling resistance only).
        const end = after[after.length - 1];
        if (end === undefined) throw new Error("no steps");
        expect(Math.abs(headingOf(end))).toBeLessThan(0.01);
        expect(Math.abs(end.transform.positionM.z)).toBeLessThan(0.05);
        const v1 = Math.hypot(
          after[12]?.linearVelocityMps.x ?? 0,
          after[12]?.linearVelocityMps.z ?? 0,
        );
        expect(v1).toBeGreaterThan(0.97 * speed);
        expect(end.transform.positionM.y).toBeCloseTo(REST_M, 3);
      },
      T,
    );
  }

  it(
    "a board dropped across the handrail at 7 m/s hits the bar (CCD): no passing through it",
    async () => {
      const stairs = LEVEL.obstacles.find((o) => o.id === "stairs");
      if (stairs === undefined || stairs.shape.kind !== "stairs") throw new Error("no stairs");
      const rail = obstacleGrindEdges(stairs).find((e) => e.id === "stairs:handrail");
      if (rail === undefined) throw new Error("no handrail");
      // Across the bar (a boardslide's pose), over the middle of the set, 1 m above it.
      const x = 3;
      const t = (x - rail.startM.x) / (rail.endM.x - rail.startM.x);
      const barTopY = rail.startM.y + t * (rail.endM.y - rail.startM.y);
      const z = handrailZM(stairs.shape);
      const d = await drop(Vec3.create(x, barTopY + 1, z), Vec3.create(0, -7, 0), 0.3, Math.PI / 2);
      const hit = d.events.find(
        (e) => e.type === "SurfaceContactStarted" && e.surface === "grindable",
      );
      expect(hit).toBeDefined();
      // Ballistically it would be 1.1 m under the bar by now; it stopped on (or glanced off) it.
      const within = d.snaps.filter(
        (s) =>
          Math.abs(s.transform.positionM.z - z) < 0.1 &&
          Math.abs(s.transform.positionM.x - x) < 0.1,
      );
      expect(within.length).toBeGreaterThan(10); // it stays on the bar a while
      for (const s of within) expect(s.transform.positionM.y).toBeGreaterThan(barTopY - 0.02);
    },
    T,
  );
});

// ── full loop (rider) ───────────────────────────────────────────────────────

async function riderAt(x: number, z: number, headingRad = 0): Promise<ScenarioHarness> {
  const level = Level.create({
    ...LEVEL,
    spawn: { positionM: Vec3.create(x, PLAZA_Y, z), headingRad },
  });
  const h = await ScenarioHarness.create({ level });
  riders.push(h);
  h.run(0.3);
  return h;
}

/** Runs until the board will reach `xM` in `leadS` at its current speed. */
function runUntilX(h: ScenarioHarness, xM: number, leadS: number): void {
  for (let i = 0; i < 2400; i += 1) {
    const x = h.board.transform.positionM.x;
    if (x + h.board.linearVelocityMps.x * leadS >= xM) return;
    h.run(1 / 120);
  }
}

function bails(h: ScenarioHarness): string[] {
  return [
    ...h.eventsOf("RiderBailed").map((e) => `rider: ${e.reason}`),
    ...h.eventsOf("TrickBailed").map((e) => `trick: ${e.name ?? "?"} (${e.reason})`),
  ];
}

/** The long landing (the drop): its record index, and the records just before / 0.1 s after. */
function bigLanding(
  h: ScenarioHarness,
  t0: number,
): {
  event: Extract<DomainEvent, { type: "BoardLanded" }>;
  before: StepRecord;
  after: StepRecord;
} {
  const event = h
    .eventsOf("BoardLanded")
    .filter((e) => e.timeS >= t0)
    .sort((a, b) => b.airtimeS - a.airtimeS)[0];
  if (event === undefined) throw new Error("no landing");
  const before = h.records.filter((r) => r.timeS < event.timeS - 1e-9).at(-1);
  const after = h.records.find((r) => r.timeS >= event.timeS + 0.1 - 1e-9);
  if (before === undefined || after === undefined) throw new Error("no records");
  return { event, before, after };
}

/**
 * A clean, sane landing off the drop: on the flat past the foot, four wheels, feet on,
 * level, rolling away straight at (almost) its speed. The rider's feet stay finite and on
 * the deck, and no rider impulse near the touchdown exceeds a catch's (no weird kick).
 */
function expectCleanDrop(h: ScenarioHarness, t0: number): void {
  const { event, before, after } = bigLanding(h, t0);
  expect(event.airtimeS).toBeGreaterThan(1);
  expect(event.upDot).toBeGreaterThan(0.95);
  expect(before.board.linearVelocityMps.y).toBeLessThan(-7.5); // a real 3.3 m drop
  expect(after.board.transform.positionM.x).toBeGreaterThan(FOOT_X + 0.5);
  expect(horizontalSpeed(after)).toBeGreaterThan(0.95 * horizontalSpeed(before));
  for (const r of h.records.filter((r) => r.timeS >= event.timeS - 0.05)) {
    for (const f of r.forces) {
      if (f.kind === "impulse") expect(Vec3.length(f.impulseNs)).toBeLessThan(3);
    }
    for (const id of ["front", "back"] as const) {
      const p = r.rider[id].positionWorldM;
      expect(Number.isFinite(p.x + p.y + p.z)).toBe(true);
    }
  }
  h.run(1);
  expect(bails(h)).toEqual([]);
  expect(h.board.wheelsDown).toBe(4);
  expect(feetOn(h)).toBe(true);
  expect(h.board.transform.positionM.y).toBeLessThan(0.1);
  expect(Math.abs(h.headingRad())).toBeLessThan(0.05);
  // The feet stand on the grip: within a few cm above the deck's top.
  for (const id of ["front", "back"] as const) {
    const foot = h.rider[id].positionWorldM;
    expect(foot.y - h.board.transform.positionM.y).toBeGreaterThan(0);
    expect(foot.y - h.board.transform.positionM.y).toBeLessThan(0.1);
  }
}

describe("El Toro, full loop: the 20-stair lands", () => {
  it(
    "pushes up from the spawn (real Space pushes), ollies at the lip with a Space catch, and lands clean",
    async () => {
      const h = await ScenarioHarness.create({ level: LEVEL });
      riders.push(h);
      h.run(0.3);
      const t0 = h.timeS;
      for (let i = 0; i < 6; i += 1) h.press({ code: "Space", atS: 0.65 * i, holdS: 0.1 });
      runUntilX(h, S.xM - 0.2, 0.22);
      const speed = h.forwardSpeedMps();
      expect(speed).toBeGreaterThan(6); // the 14 m run-up is enough
      loadAndPop(h, 0.2);
      h.foot("front", awayFrom("tail"), 0.25, 0.15);
      catchAt(h, 0.7);
      h.run(1.6);
      expect(h.eventsOf("BoardPopped").filter((e) => e.timeS >= t0)).toHaveLength(1);
      expect(h.eventsOf("TrickLanded").map((e) => e.name)).toEqual(["Ollie"]);
      expectCleanDrop(h, t0);
    },
    T,
  );

  it(
    "kickflips down it (6.5 m/s): Space at the end of the flip's turn catches it; it lands clean",
    async () => {
      const h = await riderAt(S.xM - 8, 0);
      const t0 = h.timeS;
      h.launch(6.5);
      runUntilX(h, S.xM - 0.15, 0.25);
      const popS = playCombo(h, { kick: "tail", flick: "heel", sweep: null });
      catchAt(h, popS + 0.45);
      h.run(1.8);
      expect(h.eventsOf("TrickLanded").map((e) => e.name)).toEqual(["Kickflip"]);
      expect(airSummary(h, t0).rollRad).toBeCloseTo(-2 * Math.PI, 1);
      expectCleanDrop(h, t0);
    },
    T,
  );

  it(
    "the kickflip keeps its flat-ground rhythm: Space held back until the end of the long air is too late (the uncaught flip keeps turning) and bails",
    async () => {
      const h = await riderAt(S.xM - 8, 0);
      h.launch(6.5);
      runUntilX(h, S.xM - 0.15, 0.25);
      const popS = playCombo(h, { kick: "tail", flick: "heel", sweep: null });
      catchAt(h, popS + 0.9);
      h.run(2.5);
      expect(h.eventsOf("TrickLanded")).toEqual([]);
      expect(h.eventsOf("RiderBailed").length).toBeGreaterThan(0);
    },
    T,
  );

  it(
    "a hard landing never bails by impact alone: an ollie that is never caught lands level, feet back on",
    async () => {
      const h = await riderAt(S.xM - 8, 0);
      const t0 = h.timeS;
      h.launch(7);
      runUntilX(h, S.xM - 0.15, 0.22);
      loadAndPop(h, 0.2);
      h.foot("front", awayFrom("tail"), 0.25, 0.15);
      h.run(1.8);
      expect(h.eventsOf("TrickLanded").map((e) => e.name)).toEqual(["Ollie"]);
      expectCleanDrop(h, t0);
    },
    T,
  );

  it(
    "50-50 down the handrail from the top: locks at the top, grinds all the way down, rolls off the end and lands",
    async () => {
      const railZ = -S.widthM / 2 - S.handrail.offsetM;
      // Beside the rail (0.15 m), heading 0.03 rad toward it, 4 m/s, a full load.
      const h = await riderAt(S.xM - 8, railZ + 0.15, 0.03);
      const t0 = h.timeS;
      h.launch(4);
      runUntilX(h, S.xM - 1.6, 0.32);
      loadAndPop(h, 0.32);
      h.foot("front", awayFrom("tail"), 0.37, 0.15);
      const lockedX: number[] = [];
      for (let i = 0; i < 480; i += 1) {
        h.run(1 / 120);
        if (h.rider.grind !== null) lockedX.push(h.board.transform.positionM.x);
      }
      const [start, ...more] = h.eventsOf("GrindStarted");
      expect(more).toEqual([]);
      expect(start?.grind).toBe("fiftyFifty");
      expect(start?.obstacleId).toBe("stairs");
      expect(start?.name).toMatch(/^(FS|BS) 50-50$/);
      // One lock from near the top nosing to past the foot.
      expect(Math.min(...lockedX)).toBeLessThan(S.xM + 1);
      expect(Math.max(...lockedX)).toBeGreaterThan(FOOT_X);
      const [end] = h.eventsOf("GrindEnded");
      expect(end?.exit).toBe("rollOff");
      expect(end?.durationS).toBeGreaterThan(1.5);
      expect(h.eventsOf("TrickLanded").map((e) => e.name)).toEqual([start?.name]);
      expect(bails(h)).toEqual([]);
      expect(h.board.wheelsDown).toBe(4);
      expect(feetOn(h)).toBe(true);
      expect(h.board.transform.positionM.x).toBeGreaterThan(FOOT_X + 2);
      expect(h.board.transform.positionM.y).toBeLessThan(0.1);
      expect(airSummary(h, t0).bailed).toBe(false);
    },
    T,
  );

  it(
    "physics + loop step time stays within the 2 ms budget on El Toro (REQUIREMENTS §1.9)",
    async () => {
      const h = await riderAt(S.xM - 8, 0);
      h.launch(6.5);
      runUntilX(h, S.xM - 0.15, 0.25);
      const popS = playCombo(h, { kick: "tail", flick: "heel", sweep: null });
      catchAt(h, popS + 0.45);
      const steps = 240; // the air, the landing and the roll-away
      const t = performance.now();
      h.run(steps / 120);
      const msPerStep = (performance.now() - t) / steps;
      expect(msPerStep).toBeLessThan(2);
    },
    T,
  );
});
