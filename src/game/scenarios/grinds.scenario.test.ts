import { afterEach, describe, expect, it } from "vitest";
import type { KeyPress } from "../../contexts/input";
import { Level, levelGrindEdges } from "../../contexts/world";
import { STREET_CONFIG } from "../../maps/street/street.config";
import { createStreetCourseLevel } from "../../maps/street/street-course";
import type { GrindEnded, GrindStarted } from "../../shared";
import { Transform, Vec3 } from "../../shared";
import { stairsTailslideHardflip } from "../montage/clips/stairs";
import type { ScenarioHarness, StepRecord } from "./scenario-harness";
import { ScenarioHarness as Harness } from "./scenario-harness";
import { airSummary, awayFrom, loadAndPop } from "./scenario-helpers";

/*
 * GRINDS AND SLIDES (MECHANICS.md M4 "Acceptance scenarios", full loop, real Rapier, the
 * Street Course, `?map=street`). G1–G7: G1/G2/G5/G6 on the flat bar (0.3 m, square), G3 on
 * the long ledge (0.4 m), G4 on the 7-stair's +Z hubba (0.28 m), G7 on the east quarter
 * pipe's coping. G4 is the montage clip: its key timeline is written out below as data
 * (`G4_KEYS`, from the clip start) and is the same as the `stairs-tailslide-hardflip`
 * montage clip. (They ran on the removed park until the game shell: GAME.md.)
 */

const open: ScenarioHarness[] = [];
afterEach(() => {
  for (const h of open.splice(0)) h.dispose();
});

const T = 30_000;
const STREET = createStreetCourseLevel();
const EDGES = levelGrindEdges(STREET.obstacles);
const S = STREET_CONFIG;
const BAR = S.flatBar;
const LEDGE = S.longLedge;
/** Where the flat bar and the long ledge start (their near ends, x). */
const BAR_START_X = BAR.xM - BAR.lengthM / 2;
const LEDGE_START_X = LEDGE.xM - LEDGE.lengthM / 2;

/** The course with the board spawned at ground point (x, y, z), heading `headingRad`. */
async function streetAt(
  x: number,
  y: number,
  z: number,
  headingRad = 0,
  settleS = 0.3,
): Promise<ScenarioHarness> {
  const level = Level.create({
    id: STREET.id,
    name: STREET.name,
    obstacles: STREET.obstacles,
    spawn: { positionM: Vec3.create(x, y, z), headingRad },
  });
  const h = await Harness.create({ level });
  open.push(h);
  if (settleS > 0) h.run(settleS);
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

function started(h: ScenarioHarness): GrindStarted[] {
  return h.eventsOf("GrindStarted");
}

function ended(h: ScenarioHarness): GrindEnded[] {
  return h.eventsOf("GrindEnded");
}

function landed(h: ScenarioHarness): string[] {
  return h.eventsOf("TrickLanded").map((e) => e.name);
}

function bails(h: ScenarioHarness): string[] {
  return [
    ...h.eventsOf("RiderBailed").map((e) => `rider: ${e.reason}`),
    ...h.eventsOf("TrickBailed").map((e) => `trick: ${e.name ?? "?"} (${e.reason})`),
  ];
}

/** Steps locked on an edge. */
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

/**
 * Ollie onto the flat bar from 4 m before it, 0.15 m to its side, rolling at `speedMps`
 * slightly toward it (heading 0.03 rad), full load; `down` holds ↓ from just after the pop
 * (a 5-0). The pop is `popBeforeM` before the bar's start (it locks for pops ≈ 0.6–1.8 m
 * before it at 4 m/s).
 */
async function ollieOntoRail(
  down: boolean,
  speedMps = 4,
  popBeforeM = 1.2,
): Promise<ScenarioHarness> {
  const popAtXM = BAR_START_X - popBeforeM;
  const h = await streetAt(BAR_START_X - 4, 0, BAR.zM + 0.15, 0.03);
  h.launch(speedMps);
  runUntilX(h, popAtXM, 0.34);
  loadAndPop(h, 0.32);
  h.foot("front", awayFrom("tail"), 0.37, 0.15);
  if (down) h.foot("back", "down", 0.42, 1.2);
  h.run(3);
  return h;
}

/**
 * A slide on the long ledge, from its −Z side (`offsetM` outside its near edge): ollie, a
 * body quarter turn (`spin`), `press` held from the air.
 */
async function slideOntoLedge(
  offsetM: number,
  spin: "KeyQ" | "KeyE",
  press: "down" | "up" | null,
): Promise<ScenarioHarness> {
  const nearEdgeZ = LEDGE.zM - LEDGE.depthM / 2;
  const h = await streetAt(LEDGE_START_X - 5, 0, nearEdgeZ - offsetM, 0);
  h.launch(4);
  runUntilX(h, LEDGE_START_X - 1.4, 0.34);
  loadAndPop(h, 0.32);
  // The level key is W: a noseslide holds W from the level on.
  if (press !== "up") h.foot("front", "up", 0.37, 0.12);
  h.press({ code: spin, atS: 0.34, holdS: 0.14 });
  if (press !== null) h.foot(press === "down" ? "back" : "front", press, 0.42, 1.5);
  // Space once the quarter turn has eased out (the catch damps a spin, never stops it dead).
  h.press({ code: "Space", atS: 0.62, holdS: 0.1 });
  h.run(3);
  return h;
}

/**
 * G4, the stairs line, as a key timeline from the clip start (regular stance), timed the
 * way a person would (ADR 0012: the middle of each window, full load, 0.12 s taps; the
 * human-jitter test G4H plays it perturbed). The board starts on the 7-stair's landing at
 * (−11.5, 1.05, 1.63) — 5 m behind the top nosing and 0.37 m inside the +Z hubba's steel edge
 * (z = 2) — facing +X at 3.5 m/s:
 * - 0.3 ↓ + 0.32 S: load; release ↓ at 0.75: the pop (full load) at x ≈ −8.9 (the line
 *   lands for pops ≈ 0.16 s either side);
 * - 0.8 W + A: kickflip with the level (its height bonus clears the 0.28 m hubba);
 * - 1.0 ↓ held until 1.78: the tail press that picks the TAILSLIDE at the lock;
 * - 1.0 Q for 0.14 s: a frontside quarter turn, so the tail swings over the hubba;
 * - 1.25 Space: the catch; the lock-on is at ≈ 1.37 s on the hubba's flat top;
 * - 1.53 S, then ↓ released at 1.78: the pop out (load ↓ + S, release ↓), a third of the
 *   way down the slope (a longer hubba than the park's: the slide is ≈ 0.4 s);
 * - 1.82 W + A + → (0.12 s): hardflip (kickflip + frontside shove) with the level; the body
 *   turns back a quarter on its own to line up with the travel;
 * - 2.31 Space: the catch (≈ 2.13–2.37 s land); it lands past the stairs.
 */
const G4_SPAWN = {
  xM: S.bigStairs.xM - 5,
  yM: S.bigStairs.stepCount * S.bigStairs.riseM,
  zM: S.bigStairs.zM + S.bigStairs.widthM / 2 - 0.37,
  headingRad: 0,
  speedMps: 3.5,
} as const;
/** When the pop out's load starts (S) and when ↓ is released (the pop out), s. */
const G4_POP_OUT_LOAD_S = 1.53;
const G4_POP_OUT_S = 1.78;
const G4_KEYS: readonly KeyPress[] = [
  { code: "ArrowDown", atS: 0.3, holdS: 0.45 },
  { code: "KeyS", atS: 0.32, holdS: 0.5 },
  { code: "KeyW", atS: 0.8, holdS: 0.1 },
  { code: "KeyA", atS: 0.8, holdS: 0.12 },
  { code: "ArrowDown", atS: 1.0, holdS: 0.78 },
  { code: "KeyQ", atS: 1.0, holdS: 0.14 },
  { code: "Space", atS: 1.25, holdS: 0.1 },
  { code: "KeyS", atS: 1.53, holdS: 0.29 },
  { code: "KeyW", atS: 1.82, holdS: 0.1 },
  { code: "KeyA", atS: 1.82, holdS: 0.12 },
  { code: "ArrowRight", atS: 1.82, holdS: 0.12 },
  { code: "Space", atS: 2.31, holdS: 0.1 },
];
const G4_NAME = "Kickflip → FS Tailslide → Hardflip out";

async function playG4(keys: readonly KeyPress[] = G4_KEYS, runS = 4.2): Promise<ScenarioHarness> {
  const h = await streetAt(G4_SPAWN.xM, G4_SPAWN.yM, G4_SPAWN.zM, G4_SPAWN.headingRad, 0);
  h.launch(G4_SPAWN.speedMps);
  h.press(...keys);
  h.run(runS);
  return h;
}

describe("grinds and slides (M4)", () => {
  it(
    "G1: ollie onto the flat bar, nothing held: a 50-50 for ≥ 0.5 s, rolls off the end, lands clean",
    async () => {
      const h = await ollieOntoRail(false);
      const [start, ...moreStarts] = started(h);
      expect(moreStarts).toEqual([]);
      expect(start?.grind).toBe("fiftyFifty");
      expect(start?.obstacleId).toBe("flat-bar");
      expect(start?.name).toMatch(/^(FS|BS) 50-50$/);
      const [end] = ended(h);
      expect(end?.exit).toBe("rollOff");
      expect(end?.durationS).toBeGreaterThanOrEqual(0.5);
      expect(landed(h)).toEqual([start?.name]);
      expect(bails(h)).toEqual([]);
      expect(h.board.wheelsDown).toBe(4);
      // It rode on top of the bar.
      for (const r of lockedSteps(h).slice(12)) {
        expect(Math.abs(r.board.transform.positionM.z - BAR.zM)).toBeLessThan(0.02);
      }
      expectSane(h);
    },
    T,
  );

  it(
    "G2: the same with ↓ held: a 5-0 (nose up), lands clean",
    async () => {
      const h = await ollieOntoRail(true);
      const [start] = started(h);
      expect(start?.grind).toBe("fiveO");
      expect(start?.name).toMatch(/^(FS|BS) 5-0$/);
      expect(ended(h)[0]?.exit).toBe("rollOff");
      const mid = lockedSteps(h)[40];
      expect(mid).toBeDefined();
      if (mid !== undefined) expect(h.pitchRad(mid.board)).toBeGreaterThan(0.1);
      expect(landed(h)).toEqual([start?.name]);
      expect(bails(h)).toEqual([]);
      expectSane(h);
    },
    T,
  );

  for (const [label, offsetM, spin, press, kind] of [
    ["Boardslide", 0.1, "KeyQ", null, "boardslide"],
    ["Tailslide", 0.35, "KeyQ", "down", "tailslide"],
    ["Noseslide", 0.35, "KeyE", "up", "noseslide"],
  ] as const) {
    it(
      `G3: a quarter turn in the air onto the long ledge${press === null ? "" : `, ${press === "down" ? "↓" : "W"} held`}: ${label}`,
      async () => {
        const h = await slideOntoLedge(offsetM, spin, press);
        const [start] = started(h);
        expect(start?.grind).toBe(kind);
        expect(start?.obstacleId).toBe("long-ledge");
        expect(start?.name).toMatch(new RegExp(`^(FS|BS) ${label}$`));
        expect(lockedSteps(h).length / 120).toBeGreaterThan(0.5);
        expectSane(h);
      },
      T,
    );
  }

  it(
    `G4: the stairs line — kickflip onto the 7-stair hubba, ↓ held (tailslide), hardflip out: "${G4_NAME}"`,
    async () => {
      const h = await playG4();
      expect(started(h).map((e) => e.name)).toEqual(["FS Tailslide"]);
      expect(started(h)[0]?.obstacleId).toBe("big-stairs");
      const [end] = ended(h);
      expect(end?.exit).toBe("popOut");
      expect(end?.durationS).toBeGreaterThan(0.1);
      expect(landed(h)).toEqual([G4_NAME]);
      expect(bails(h)).toEqual([]);
      expect(h.board.wheelsDown).toBe(4);
      expect(h.board.transform.positionM.y).toBeLessThan(0.1);
      expectSane(h);
    },
    T,
  );

  it("G4 is the montage clip: same spawn, same key timeline", () => {
    const byTime = (a: KeyPress, b: KeyPress) => a.atS - b.atS || a.code.localeCompare(b.code);
    const round = (k: KeyPress) => ({
      code: k.code,
      atS: +k.atS.toFixed(4),
      holdS: +k.holdS.toFixed(4),
    });
    expect(stairsTailslideHardflip.spawn).toEqual(G4_SPAWN);
    expect([...stairsTailslideHardflip.keys].sort(byTime).map(round)).toEqual(
      [...G4_KEYS].sort(byTime).map(round),
    );
    expect(stairsTailslideHardflip.expect.tricks).toEqual([G4_NAME]);
  });

  it(
    "G4 timing: the line still lands with the last catch 0.03 s early or late",
    async () => {
      const last = G4_KEYS.length - 1;
      for (const shift of [-0.03, 0.03]) {
        const keys = G4_KEYS.map((k, i) => (i === last ? { ...k, atS: k.atS + shift } : k));
        const h = await playG4(keys);
        expect(landed(h)).toEqual([G4_NAME]);
      }
    },
    T,
  );

  it(
    "G4 swipe out: → pre-positioned during the pop out's load, then ← (edge to edge) → a 360 shove out",
    async () => {
      // G4 up to the pop out, where the hardflip's W + A + → becomes the 360's swipe: →
      // held with the load (S) through the pop (↓ released), then ← across.
      const h = await playG4(
        [
          ...G4_KEYS.filter((k) => k.atS < G4_POP_OUT_S),
          {
            code: "ArrowRight",
            atS: G4_POP_OUT_LOAD_S,
            holdS: G4_POP_OUT_S + 0.04 - G4_POP_OUT_LOAD_S,
          },
          { code: "ArrowLeft", atS: G4_POP_OUT_S + 0.04, holdS: 0.14 },
        ],
        3,
      );
      expect(ended(h)[0]?.exit).toBe("popOut");
      // The swipe out is read as two units: a 360, named in the line. (The air after the
      // pop out is short, and the body's own turn back to the travel eats into the spin,
      // so it comes down ≈ 0.4 rad short of 360° and is not landed: see the report in
      // ADR 0010.) A single-unit swipe out lands: G4's hardflip.
      const outs = [
        ...h.eventsOf("TrickLanded").map((e) => e.name),
        ...h.eventsOf("TrickBailed").map((e) => e.name ?? ""),
      ];
      expect(outs).toHaveLength(1);
      expect(outs[0]).toMatch(/→ (FS )?360 Shove-it out$/);
      expectSane(h);
    },
    T,
  );

  it(
    "G5: no input on the rail: the balance is eventually lost, the board falls off — a bail, no explosion",
    async () => {
      const h = await ollieOntoRail(false, 2.5, 0.7);
      h.run(4);
      expect(started(h)[0]?.grind).toBe("fiftyFifty");
      expect(ended(h)[0]?.exit).toBe("fellOff");
      expect(h.eventsOf("RiderBailed").map((e) => e.reason)).toContain("lostBalance");
      const balances = lockedSteps(h).map((r) => Math.abs(r.rider.grind?.balance ?? 0));
      expect(Math.max(...balances)).toBeGreaterThan(0.9);
      expectSane(h);
    },
    T,
  );

  it(
    "G5b: leaning against the balance (both feet the same way) keeps the grind on",
    async () => {
      const h = await streetAt(BAR_START_X - 4, 0, BAR.zM + 0.15, 0.03);
      h.launch(2.5);
      runUntilX(h, BAR_START_X - 0.7, 0.34);
      loadAndPop(h, 0.32);
      h.foot("front", awayFrom("tail"), 0.37, 0.15);
      for (let i = 0; i < 180 && h.rider.grind === null; i += 1) h.run(1 / 120);
      expect(h.rider.grind).not.toBeNull();
      // Lean against the drift: + = toward the toe side, which is D / → in regular.
      let held: string[] = [];
      for (let i = 0; i < 240 && h.rider.grind !== null; i += 1) {
        const b = h.rider.grind?.balance ?? 0;
        const want = b > 0.1 ? ["KeyA", "ArrowLeft"] : b < -0.1 ? ["KeyD", "ArrowRight"] : [];
        if (want.join() !== held.join()) {
          for (const k of held) h.keyUp(k);
          for (const k of want) h.keyDown(k);
          held = want;
        }
        h.run(1 / 120);
      }
      for (const k of held) h.keyUp(k);
      expect(ended(h).map((e) => e.exit)).not.toContain("fellOff");
    },
    T,
  );

  it(
    "G6: no thrust — along the edge the speed only drops on the flat bar; on the hubba only gravity adds",
    async () => {
      const along = (r: StepRecord, u: Vec3): number => Vec3.dot(r.board.linearVelocityMps, u);
      const rail = EDGES.find((e) => e.id === "flat-bar:bar");
      const hubba = EDGES.find((e) => e.id === "big-stairs:hubba");
      if (rail === undefined || hubba === undefined) throw new Error("no edges");
      const flat = await ollieOntoRail(false);
      const u = Vec3.normalize(Vec3.sub(rail.endM, rail.startM));
      const locked = lockedSteps(flat).slice(12); // after the lock has settled
      expect(locked.length).toBeGreaterThan(40);
      for (let i = 1; i < locked.length; i += 1) {
        const a = locked[i - 1];
        const b = locked[i];
        if (a === undefined || b === undefined) continue;
        expect(along(b, u) - along(a, u)).toBeLessThanOrEqual(1e-3);
      }
      // The G4 tailslide without the pop out: it slides on down the hubba's slope.
      const g4 = await playG4(G4_KEYS.filter((k) => k.atS < G4_POP_OUT_LOAD_S));
      const d = Vec3.normalize(Vec3.sub(hubba.endM, hubba.startM));
      const gravityPerStep = 9.81 * -d.y * (1 / 120);
      const onSlope = lockedSteps(g4).filter(
        (r) => r.board.transform.positionM.x > S.bigStairs.xM + 0.25,
      );
      expect(onSlope.length).toBeGreaterThan(8);
      for (let i = 1; i < onSlope.length; i += 1) {
        const a = onSlope[i - 1];
        const b = onSlope[i];
        if (a === undefined || b === undefined) continue;
        expect(along(b, d) - along(a, d)).toBeLessThanOrEqual(gravityPerStep + 1e-3);
      }
    },
    T,
  );

  it(
    "G7: a 50-50 stall on the quarter pipe's coping, then a pop out back into the transition",
    async () => {
      const coping = EDGES.find((e) => e.id === "qp-east:coping");
      if (coping === undefined) throw new Error("no coping");
      // Dropped onto the coping along it, trucks over it: it locks and stalls.
      const h = await streetAt(coping.startM.x, coping.startM.y + 0.034, 0, Math.PI / 2);
      h.run(1.2);
      expect(h.rider.grind?.kind).toBe("fiftyFifty");
      expect(h.rider.grind?.obstacleId).toBe("qp-east");
      for (const r of lockedSteps(h).slice(-60)) {
        expect(Vec3.length(r.board.linearVelocityMps)).toBeLessThan(0.1);
      }
      // Pop out: load ↓ + S, release ↓, W levels, Space catches.
      const t0 = h.timeS;
      loadAndPop(h, 0.2);
      h.foot("front", "up", 0.25, 0.1);
      h.press({ code: "Space", atS: 0.5, holdS: 0.1 });
      h.run(2);
      expect(ended(h)[0]?.exit).toBe("popOut");
      expect(airSummary(h, t0).popped).toBe(true);
      // Back into the transition (toward −X and down), not onto the deck.
      expect(h.board.transform.positionM.x).toBeLessThan(coping.startM.x - 1);
      expect(h.board.linearVelocityMps.x).toBeLessThan(-2);
      expect(landed(h)).toEqual([started(h)[0]?.name]);
      expect(bails(h)).toEqual([]);
      expectSane(h);
    },
    T,
  );
});

/**
 * A grind along a one-sided edge rolled off its end, `down` = ↓ held (a 5-0). From 0.15 m
 * beside the edge (on the side the board rides from), heading 0.03 rad toward it, 4.5 m/s,
 * a full load `popBeforeM` before the edge's start.
 */
async function grindToTheEnd(
  spawn: { x: number; y: number; z: number },
  popAtXM: number,
  down: boolean,
): Promise<ScenarioHarness> {
  const h = await streetAt(spawn.x, spawn.y, spawn.z, -0.03);
  h.launch(4.5);
  runUntilX(h, popAtXM, 0.34);
  loadAndPop(h, 0.32);
  h.foot("front", awayFrom("tail"), 0.37, 0.15);
  if (down) h.foot("back", "down", 0.42, 2);
  h.run(5);
  return h;
}

/** Rolled off the end and landed clean: one lock, `rollOff`, no bail, four wheels, level. */
function expectRolledOffClean(h: ScenarioHarness, kind: "fiftyFifty" | "fiveO", id: string): void {
  const [start, ...more] = started(h);
  expect(more).toEqual([]);
  expect(start?.grind).toBe(kind);
  expect(start?.obstacleId).toBe(id);
  const [end] = ended(h);
  expect(end?.exit).toBe("rollOff");
  expect(bails(h)).toEqual([]);
  expect(landed(h)).toEqual([start?.name]);
  // Off the end it leaves level across (no roll: it would tip onto its side before) and
  // lands on four wheels. Along, it may still carry the slope's pitch (the hubba).
  const off = h.records.filter((r) => r.timeS >= (end?.timeS ?? 0) && !r.board.grounded);
  expect(off.length).toBeGreaterThan(0);
  for (const r of off) {
    const across = Transform.toWorldDirection(r.board.transform, Vec3.UNIT_Z);
    expect(Math.abs(across.y)).toBeLessThan(0.1);
  }
  expect(h.board.wheelsDown).toBe(4);
  expect(h.tiltRad()).toBeLessThan(0.05);
  expect(h.rider.front.contact).toBe("attached");
  expect(h.rider.back.contact).toBe("attached");
  expectSane(h);
}

describe("rolling off the end of a one-sided edge lands on four wheels (ADR 0009)", () => {
  const nearEdgeZ = LEDGE.zM - LEDGE.depthM / 2;
  const ledgeSpawn = { x: LEDGE_START_X - 5, y: 0, z: nearEdgeZ - 0.15 };
  const hubbaSpawn = {
    x: S.bigStairs.xM - 5,
    y: S.bigStairs.stepCount * S.bigStairs.riseM,
    z: S.bigStairs.zM + S.bigStairs.widthM / 2 - 0.15,
  };
  for (const down of [false, true]) {
    const kind = down ? "fiveO" : "fiftyFifty";
    const name = down ? "5-0" : "50-50";
    it(
      `a ${name} along the long ledge rolls off its end and lands clean`,
      async () => {
        const h = await grindToTheEnd(ledgeSpawn, LEDGE_START_X - 1.4, down);
        expectRolledOffClean(h, kind, "long-ledge");
        expect(h.board.transform.positionM.x).toBeGreaterThan(LEDGE_START_X + LEDGE.lengthM + 1);
      },
      T,
    );
    it(
      `a ${name} down the 7-stair's +Z hubba rolls off its end and lands clean`,
      async () => {
        const h = await grindToTheEnd(hubbaSpawn, S.bigStairs.xM - 2.4, down);
        expectRolledOffClean(h, kind, "big-stairs");
      },
      T,
    );
  }
});
