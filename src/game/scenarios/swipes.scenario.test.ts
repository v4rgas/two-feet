import { afterEach, describe, expect, it } from "vitest";
import type { Kick } from "../../shared";
import type { ScenarioHarness } from "./scenario-harness";
import {
  airSummary,
  awayFrom,
  edgeKey,
  FULL_POP_S,
  feetOn,
  guideFoot,
  loadAndPop,
  popFoot,
  rolling,
  STANCES,
  spaceWhenDone,
  swipe,
  toward,
} from "./scenario-helpers";

/*
 * SWIPE SIZE (MECHANICS.md "Swipe size"): a trick's size is how far the foot travels
 * sideways, measured on the smoothed stick. A tap from the middle is one unit (a flip, a
 * 180 shove); a swipe from the opposite edge (pre-positioned during the load) is two (a
 * double flip, a 360 shove). Letting go of a key and a held position are never swipes.
 * Regular-stance keys in the names; every case runs in both stances, and from both kicks
 * (nollie: the roles swap — the front foot pops and sweeps, the back foot flicks).
 */

const open: ScenarioHarness[] = [];
afterEach(() => {
  for (const h of open.splice(0)) h.dispose();
});

const T = 20_000;
const TAU = 2 * Math.PI;
const KICKS: readonly Kick[] = ["tail", "nose"];

async function start(stance: (typeof STANCES)[number]): Promise<ScenarioHarness> {
  const h = await rolling(1.3, { stance });
  open.push(h);
  return h;
}

/** The names that landed after `t0`, and bails as "bail: …". */
function names(h: ScenarioHarness, t0: number): string[] {
  return h.events.flatMap((e) =>
    e.timeS < t0
      ? []
      : e.type === "TrickLanded"
        ? [e.name]
        : e.type === "TrickBailed"
          ? [`bail: ${e.name ?? "?"} (${e.reason})`]
          : [],
  );
}

function nollie(kick: Kick, name: string): string {
  if (kick === "tail") return name;
  return name === "Ollie" ? "Nollie" : `Nollie ${name}`;
}

/** A full load and pop at `FULL_POP_S` from now with the level key 0.05 s later. */
function fullPop(h: ScenarioHarness, kick: Kick): number {
  loadAndPop(h, FULL_POP_S, kick);
  h.foot(guideFoot(kick), awayFrom(kick), FULL_POP_S + 0.05, 0.1);
  return FULL_POP_S;
}

/** Runs past the swipes, catches once rotated (roll, yaw targets), lands. */
function finish(h: ScenarioHarness, t0: number, popAtS: number, roll: number, yaw: number): void {
  h.run(popAtS + 0.15);
  spaceWhenDone(h, t0, roll, yaw);
  h.run(1.5);
}

describe("swipe size: what is not a swipe", () => {
  for (const stance of STANCES) {
    for (const kick of KICKS) {
      const guide = guideFoot(kick);
      const label = `${stance} ${kick === "tail" ? "ollie" : "nollie"}`;

      it(
        `${label}: guide foot held on the toe edge (D) before the load, released after the pop alone → no flip`,
        async () => {
          const h = await start(stance);
          const t0 = h.timeS;
          // D held from 0.3 s before the load until 0.05 s after the pop.
          h.foot(guide, edgeKey(h, "toe"), 0, 0.6);
          h.run(0.3);
          const popAtS = fullPop(h, kick);
          h.run(popAtS + 0.1);
          catchWhenLevel(h);
          h.run(1.5);
          expect(Math.abs(airSummary(h, t0).rollRad)).toBeLessThan(0.3);
          expect(names(h, t0)).toEqual([nollie(kick, "Ollie")]);
        },
        T,
      );

      it(
        `${label}: S + D held from the load, D released with no A → no flip (a held position is no swipe)`,
        async () => {
          const h = await start(stance);
          const t0 = h.timeS;
          const popAtS = fullPop(h, kick);
          h.foot(guide, edgeKey(h, "toe"), 0.06, popAtS + 0.05 - 0.06);
          h.run(popAtS + 0.1);
          catchWhenLevel(h);
          h.run(1.5);
          const air = airSummary(h, t0);
          expect(air.popped).toBe(true);
          expect(Math.abs(air.rollRad)).toBeLessThan(0.3);
          expect(names(h, t0)).toEqual([nollie(kick, "Ollie")]);
        },
        T,
      );

      it(
        `${label}: pop foot held toward the toe side (→) through the load and the pop, released → no shove, the load and pop still work`,
        async () => {
          const h = await start(stance);
          const t0 = h.timeS;
          const popAtS = fullPop(h, kick);
          // → goes down with ↓ + S (a 360's pre-position) and is held until after the pop.
          h.foot(popFoot(kick), edgeKey(h, "toe"), 0.06, popAtS + 0.05 - 0.06);
          h.run(popAtS + 0.1);
          catchWhenLevel(h);
          h.run(1.5);
          const air = airSummary(h, t0);
          const popped = h.eventsOf("BoardPopped").filter((e) => e.timeS >= t0);
          expect(popped.map((e) => e.kick)).toEqual([kick]);
          expect(air.riseM).toBeGreaterThan(0.3);
          expect(Math.abs(air.yawRad)).toBeLessThan(0.3);
          expect(names(h, t0)).toEqual([nollie(kick, "Ollie")]);
        },
        T,
      );
    }
  }

  it(
    "carving stays off while loaded: both feet pre-positioned toward the toe edge (D + →) do not lean the board",
    async () => {
      const h = await start("regular");
      const t0 = h.timeS;
      loadAndPop(h, FULL_POP_S, "tail");
      h.foot("front", edgeKey(h, "toe"), 0.06, FULL_POP_S);
      h.foot("back", edgeKey(h, "toe"), 0.06, FULL_POP_S);
      h.run(FULL_POP_S - 0.01);
      // Once both keys are down (and the load is on), the board rolls flat.
      const loaded = h.since(t0 + 0.15);
      expect(loaded.length).toBeGreaterThan(10);
      for (const r of loaded) expect(Math.abs(r.leanRad)).toBeLessThan(0.02);
      // The same keys while NOT loaded carve (the check above is not vacuous).
      const c = await start("regular");
      c.foot("front", edgeKey(c, "toe"), 0, 0.4);
      c.foot("back", edgeKey(c, "toe"), 0, 0.4);
      c.run(0.35);
      expect(Math.abs(c.records.at(-1)?.leanRad ?? 0)).toBeGreaterThan(0.02);
    },
    T,
  );
});

describe("swipe size: one unit or two", () => {
  for (const stance of STANCES) {
    for (const kick of KICKS) {
      const guide = guideFoot(kick);
      const pop = popFoot(kick);
      const label = `${stance} ${kick === "tail" ? "ollie" : "nollie"}`;

      it(
        `${label}: tap A (guide foot to the heel edge from the middle) → single kickflip`,
        async () => {
          const h = await start(stance);
          const t0 = h.timeS;
          const popAtS = fullPop(h, kick);
          swipe(h, guide, "heel", popAtS + 0.05, 1);
          finish(h, t0, popAtS, TAU, 0);
          expect(Math.abs(Math.abs(airSummary(h, t0).rollRad) - TAU)).toBeLessThan(0.4);
          expect(names(h, t0)).toEqual([nollie(kick, "Kickflip")]);
          expect(feetOn(h)).toBe(true);
        },
        T,
      );

      it(
        `${label}: S + D during the load, then D → A (edge to edge) → double kickflip`,
        async () => {
          const h = await start(stance);
          const t0 = h.timeS;
          const popAtS = fullPop(h, kick);
          swipe(h, guide, "heel", popAtS + 0.05, 2, 0.06);
          finish(h, t0, popAtS, 2 * TAU, 0);
          expect(Math.abs(Math.abs(airSummary(h, t0).rollRad) - 2 * TAU)).toBeLessThan(0.4);
          expect(names(h, t0)).toEqual([nollie(kick, "Double Kickflip")]);
          expect(feetOn(h)).toBe(true);
        },
        T,
      );

      it(
        `${label}: tap ← (pop foot to the heel side from the middle) → 180 shove`,
        async () => {
          const h = await start(stance);
          const t0 = h.timeS;
          const popAtS = fullPop(h, kick);
          swipe(h, pop, "heel", popAtS + 0.05, 1);
          finish(h, t0, popAtS, 0, Math.PI);
          expect(Math.abs(Math.abs(airSummary(h, t0).yawRad) - Math.PI)).toBeLessThan(0.4);
          // BS / FS follow the tail: the nollie's heel-side sweep of the nose is FS.
          const bs = kick === "tail";
          expect(names(h, t0)).toEqual([nollie(kick, `${bs ? "BS" : "FS"} Pop Shove-it`)]);
        },
        T,
      );

      it(
        `${label}: ${toward(kick) === "down" ? "↓" : "W"} + → during the load, pop with → held, then ← → 360 shove`,
        async () => {
          const h = await start(stance);
          const t0 = h.timeS;
          const popAtS = fullPop(h, kick);
          swipe(h, pop, "heel", popAtS + 0.05, 2, 0.06);
          finish(h, t0, popAtS, 0, TAU);
          expect(Math.abs(Math.abs(airSummary(h, t0).yawRad) - TAU)).toBeLessThan(0.4);
          const bs = kick === "tail";
          expect(names(h, t0)).toEqual([nollie(kick, bs ? "360 Shove-it" : "FS 360 Shove-it")]);
        },
        T,
      );
    }
  }
});

describe("a 360's diagonal load (↓ + → / ↓ + ←) pops only when the pop key is released", () => {
  for (const stance of STANCES) {
    for (const kick of KICKS) {
      for (const pre of ["toe", "heel"] as const) {
        const to = pre === "toe" ? "heel" : "toe";
        // BS / FS follow the tail: from the nose the heel-side sweep is FS.
        const bs = (kick === "tail") === (to === "heel");
        const name = nollie(kick, bs ? "360 Shove-it" : "FS 360 Shove-it");
        const label = `${stance} ${kick === "tail" ? "ollie" : "nollie"}, pre-positioned ${pre}`;

        it(
          `${label}: the load held 0.8 s with the pop foot on the diagonal never pops; releasing the kick key pops; the swipe across is a ${name}`,
          async () => {
            const h = await start(stance);
            const t0 = h.timeS;
            const popAtS = 0.8;
            loadAndPop(h, popAtS, kick);
            h.foot(guideFoot(kick), awayFrom(kick), popAtS + 0.05, 0.1);
            // The side key goes down 0.1 s into the load and stays down past the pop.
            swipe(h, popFoot(kick), to, popAtS + 0.05, 2, 0.1);
            h.run(popAtS - 0.01);
            expect(h.eventsOf("BoardPopped")).toEqual([]);
            h.run(0.08);
            const popped = h.eventsOf("BoardPopped");
            expect(popped.map((e) => e.kick)).toEqual([kick]);
            expect((popped[0]?.timeS ?? 0) - t0).toBeGreaterThanOrEqual(popAtS);
            finish(h, t0, 0, 0, TAU);
            expect(Math.abs(Math.abs(airSummary(h, t0).yawRad) - TAU)).toBeLessThan(0.4);
            expect(names(h, t0)).toEqual([name]);
          },
          T,
        );
      }
    }
  }
});

/** Space once the board is near level (an ollie's catch). */
function catchWhenLevel(h: ScenarioHarness): void {
  for (let i = 0; i < 60 && !h.board.grounded && h.tiltRad() > 0.15; i += 1) h.run(1 / 120);
  h.press({ code: "Space", atS: 0, holdS: 0.1 });
}
