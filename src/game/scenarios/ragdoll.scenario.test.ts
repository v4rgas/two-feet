import { afterEach, describe, expect, it } from "vitest";
import { createSkateparkLevel, Level } from "../../contexts/world";
import type { RiderBailed } from "../../shared";
import { Vec3 } from "../../shared";
import { GAME_CONFIG } from "../game.config";
import type { ScenarioHarness, StepRecord } from "./scenario-harness";
import { ScenarioHarness as Harness } from "./scenario-harness";
import {
  airSummary,
  awayFrom,
  catchAt,
  FULL_POP_S,
  guideFoot,
  loadAndPop,
  rolling,
  swipe,
} from "./scenario-helpers";

/*
 * 12h. RAGDOLL BAIL (MECHANICS.md "Bail: the board goes ragdoll"): force a bail, then hammer
 * Space, A, ↓, Q / E (and the rest) during it. From the step the bail is decided until the
 * reset the rider applies zero forces and zero impulses, and the board's motion is the same,
 * bit for bit, as the same run with no input during the bail. The reset comes
 * `bailResetDelayS` after the bail or when the board rests, whichever is later, capped at
 * `bailResetMaxS`. (First run at the pro and normal assist levels; now the one mode.)
 */

const open: ScenarioHarness[] = [];
afterEach(() => {
  for (const h of open.splice(0)) h.dispose();
});

const T = 60_000;
const STEP_S = GAME_CONFIG.loop.fixedStepS;
/** Every key the rider reads (regular stance), mashed during the bail. */
const MASH = [
  "Space",
  "KeyA",
  "ArrowDown",
  "KeyQ",
  "Space",
  "KeyE",
  "KeyS",
  "KeyW",
  "ArrowRight",
  "Space",
  "KeyD",
  "ArrowLeft",
  "ArrowUp",
];
/** The mash stops before the earliest reset (the keys are all up by then). */
const MASH_S = GAME_CONFIG.bailResetDelayS - 0.2;

/** A way to bail: sets the harness up and plays its keys; the bail comes on its own. */
interface BailCase {
  readonly name: string;
  readonly reason: RiderBailed["reason"];
  readonly play: () => Promise<ScenarioHarness>;
}

/** An uncaught kickflip on a small pop: the board comes down grip tape first. */
async function uncaughtUpsideDown(): Promise<ScenarioHarness> {
  const h = await rolling(0.6);
  open.push(h);
  loadAndPop(h, 0.22);
  swipe(h, guideFoot("tail"), "heel", 0.37, 1);
  return h;
}

/** A shove caught ≈ 0.4 rad past 180° (scenario 9a): caught, and still off-angle. */
async function caughtOffAngle(): Promise<ScenarioHarness> {
  const h = await rolling(1.3);
  open.push(h);
  const t0 = h.timeS;
  loadAndPop(h, FULL_POP_S, "tail");
  h.foot(guideFoot("tail"), awayFrom("tail"), FULL_POP_S + 0.05, 0.1);
  swipe(h, "back", "heel", FULL_POP_S + 0.05, 1);
  for (let i = 0; i < 180; i += 1) {
    h.run(STEP_S);
    if (!h.board.grounded && Math.abs(airSummary(h, t0).yawRad) >= Math.PI + 0.4) break;
  }
  catchAt(h, 0);
  return h;
}

/** Ollie onto the park's flat rail with no balance input (G5): it falls off. */
async function grindFallOff(): Promise<ScenarioHarness> {
  const park = createSkateparkLevel();
  const level = Level.create({
    id: park.id,
    name: park.name,
    obstacles: park.obstacles,
    spawn: { positionM: Vec3.create(12, 0, -1.65), headingRad: 0.03 },
  });
  const h = await Harness.create({ level });
  open.push(h);
  h.run(0.3);
  h.launch(2.5);
  for (let i = 0; i < 2400; i += 1) {
    const x = h.board.transform.positionM.x;
    if (x + h.board.linearVelocityMps.x * 0.34 >= 16.3) break;
    h.run(STEP_S);
  }
  loadAndPop(h, 0.32);
  h.foot("front", awayFrom("tail"), 0.37, 0.15);
  return h;
}

const CASES: readonly BailCase[] = [
  { name: "an uncaught upside-down landing", reason: "upsideDown", play: uncaughtUpsideDown },
  { name: "an off-angle caught landing", reason: "offAngle", play: caughtOffAngle },
  { name: "a grind fall-off", reason: "lostBalance", play: grindFallOff },
];

interface BailRun {
  readonly h: ScenarioHarness;
  readonly bail: RiderBailed;
  /** Index of the record of the step that decided the bail. */
  readonly bailIndex: number;
  /** Index of the first record whose step's forces were computed after the bail. */
  readonly fromIndex: number;
  /** Index of the reset's record (the first one not bailed after the bail). */
  readonly resetIndex: number;
}

/** Plays `c` until the bail, mashes every key during it (if `mash`), runs past the reset. */
async function bailRun(c: BailCase, mash: boolean): Promise<BailRun> {
  const h = await c.play();
  for (let i = 0; i < 8 * 120 && h.eventsOf("RiderBailed").length === 0; i += 1) h.run(STEP_S);
  const bail = h.eventsOf("RiderBailed")[0];
  if (bail === undefined) throw new Error(`${c.name}: no bail`);
  // Decided in the step that produced this record: a landing is judged after its physics
  // step (the next step is the first without forces); a fall off inside the rider's step.
  const bailIndex = h.records.length - 1;
  const fromIndex = c.reason === "lostBalance" ? bailIndex : bailIndex + 1;
  if (mash) {
    for (let t = 0, k = 0; t < MASH_S - 0.06; t += 0.025, k += 1) {
      h.press({ code: MASH[k % MASH.length] ?? "Space", atS: t, holdS: 0.05 });
    }
  }
  let resetIndex = -1;
  for (let i = 0; i < 4 * 120 && resetIndex < 0; i += 1) {
    h.run(STEP_S);
    if (!h.rider.bailed) resetIndex = h.records.length - 1;
  }
  h.run(0.3);
  return { h, bail, bailIndex, fromIndex, resetIndex };
}

function motion(r: StepRecord) {
  const b = r.board;
  return [b.transform.positionM, b.transform.rotation, b.linearVelocityMps, b.angularVelocityRadps];
}

describe("12h. ragdoll bail: the rider lets go completely until the reset", () => {
  for (const c of CASES) {
    it(
      `${c.name}: mashing every key applies nothing, and the board moves exactly as with no input`,
      async () => {
        const quiet = await bailRun(c, false);
        const mashed = await bailRun(c, true);
        expect(mashed.bail.reason).toBe(c.reason);
        expect(mashed.bail.timeS).toBe(quiet.bail.timeS);
        expect(mashed.resetIndex).toBeGreaterThan(mashed.fromIndex);

        // Zero forces / impulses on every step from the bail until the reset; the feet off.
        const during = mashed.h.records.slice(mashed.fromIndex, mashed.resetIndex);
        expect(during.length).toBeGreaterThan(0);
        for (const r of during) {
          expect(r.forces, `rider forces at ${r.timeS.toFixed(3)} s`).toEqual([]);
          expect(r.rider.bailed).toBe(true);
          expect(r.rider.front.contact).toBe("airborne");
          expect(r.rider.back.contact).toBe("airborne");
        }

        // The reset: after the delay, at the latest after the cap.
        // (The reset's own record carries the spawn snapshot, so count steps.)
        const resetS = (mashed.resetIndex - mashed.bailIndex) * STEP_S;
        expect(resetS).toBeGreaterThanOrEqual(GAME_CONFIG.bailResetDelayS - 1e-6);
        expect(resetS).toBeLessThanOrEqual(GAME_CONFIG.bailResetMaxS + STEP_S + 1e-6);

        // Deterministic: the same board motion, bit for bit, through the reset and after.
        expect(mashed.resetIndex).toBe(quiet.resetIndex);
        expect(mashed.h.records.length).toBe(quiet.h.records.length);
        mashed.h.records.forEach((r, i) => {
          const q = quiet.h.records[i];
          if (q === undefined) throw new Error("missing record");
          expect(motion(r), `board at ${r.timeS.toFixed(3)} s`).toEqual(motion(q));
        });
      },
      T,
    );
  }
});
