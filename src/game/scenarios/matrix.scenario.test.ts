import { afterEach, describe, expect, it } from "vitest";
import type { Kick } from "../../shared";
import { Vec3 } from "../../shared";
import type { ScenarioHarness } from "./scenario-harness";
import {
  airSummary,
  feetOn,
  horizontalSpeed,
  playCombo,
  rolling,
  STANCES,
  spaceWhenDone,
} from "./scenario-helpers";

/*
 * MECHANICS.md "Trick matrix": flip {none, kick, heel, double kick, double heel} × shove
 * {none, BS, FS, BS 360, FS 360}, from both kicks, in both stances. Each case: load, pop,
 * the inputs 0.05 s after the pop (with the level key), Space once the board looks done
 * (upright and turned), then a clean landing with the targeted roll and yaw and no thrust.
 * The flip and shove are independent channels: nothing here is special-cased.
 */

const open: ScenarioHarness[] = [];
afterEach(() => {
  for (const h of open.splice(0)) h.dispose();
});

const T = 20_000;
const TAU = 2 * Math.PI;
/** A tap; held past `doubleFlickHoldS` / `shove360HoldS` (0.12 s) it doubles. */
const TAP_S = 0.08;
const HOLD_S = 0.2;

interface FlipCase {
  readonly name: string;
  readonly edge: "heel" | "toe" | null;
  readonly turns: 0 | 1 | 2;
}
interface ShoveCase {
  readonly name: string;
  readonly side: "heel" | "toe" | null;
  readonly turns: 0 | 1 | 2;
}

const FLIPS: readonly FlipCase[] = [
  { name: "no flip", edge: null, turns: 0 },
  { name: "kickflip", edge: "heel", turns: 1 },
  { name: "heelflip", edge: "toe", turns: 1 },
  { name: "double kickflip", edge: "heel", turns: 2 },
  { name: "double heelflip", edge: "toe", turns: 2 },
];
const SHOVES: readonly ShoveCase[] = [
  { name: "no shove", side: null, turns: 0 },
  { name: "BS shove", side: "heel", turns: 1 },
  { name: "FS shove", side: "toe", turns: 1 },
  { name: "BS 360 shove", side: "heel", turns: 2 },
  { name: "FS 360 shove", side: "toe", turns: 2 },
];
const KICKS: readonly Kick[] = ["tail", "nose"];

/** The recognizer's name for a case (MECHANICS "Names", tricks.config.ts). */
function expectedName(kick: Kick, flip: FlipCase, shove: ShoveCase): string {
  const flipName =
    flip.edge === null
      ? ""
      : `${flip.turns === 2 ? "Double " : ""}${flip.edge === "heel" ? "Kickflip" : "Heelflip"}`;
  // BS / FS follow the tail: a nollie's heel-side sweep swings the tail frontside.
  const bs = shove.side === null ? null : (shove.side === "heel") === (kick === "tail");
  const shoveId = bs === null ? "none" : `${bs ? "bs" : "fs"}${shove.turns === 2 ? "360" : ""}`;
  const shoveName: Record<string, string> = {
    none: "",
    bs: "BS Shove-it",
    fs: "FS Shove-it",
    bs360: "360 Shove-it",
    fs360: "FS 360 Shove-it",
  };
  const named: Record<string, string> = {
    "|none": "Ollie",
    "|bs": "BS Pop Shove-it",
    "|fs": "FS Pop Shove-it",
    "|bs360": "360 Shove-it",
    "|fs360": "FS 360 Shove-it",
    "Kickflip|bs": "Varial Kickflip",
    "Kickflip|fs": "Hardflip",
    "Kickflip|bs360": "360 Flip",
    "Heelflip|bs": "Inward Heelflip",
    "Heelflip|fs": "Varial Heelflip",
    "Heelflip|fs360": "Laser Flip",
  };
  const base =
    named[`${flipName}|${shoveId}`] ??
    [flipName, shoveName[shoveId] ?? ""].filter((n) => n !== "").join(" + ");
  if (kick === "tail") return base;
  return base === "Ollie" ? "Nollie" : `Nollie ${base}`;
}

describe("trick matrix: flip × shove × kick × stance", () => {
  for (const stance of STANCES) {
    for (const kick of KICKS) {
      for (const flip of FLIPS) {
        for (const shove of SHOVES) {
          it(
            `${stance} ${kick === "nose" ? "nollie" : "ollie"}: ${flip.name} + ${shove.name}`,
            async () => {
              const h = await rolling(1.3, { stance });
              open.push(h);
              const v0 = h.forwardSpeedMps();
              const t0 = h.timeS;
              playCombo(h, {
                kick,
                flick: flip.edge,
                sweep: shove.side,
                flickHoldS: flip.turns === 2 ? HOLD_S : TAP_S,
                sweepHoldS: shove.turns === 2 ? HOLD_S : TAP_S,
              });
              const rollTarget = flip.turns * TAU;
              const yawTarget = shove.turns * Math.PI;
              h.run(0.3);
              spaceWhenDone(h, t0, rollTarget, yawTarget);
              h.run(1.5);
              const air = airSummary(h, t0);
              expect(air.popped).toBe(true);
              expect(Math.abs(Math.abs(air.rollRad) - rollTarget)).toBeLessThan(0.4);
              expect(Math.abs(Math.abs(air.yawRad) - yawTarget)).toBeLessThan(0.4);
              if (flip.edge !== null) {
                // Kickflip rolls −toe side (negative in regular), heelflip the other way.
                const kickflipSign = stance === "regular" ? -1 : 1;
                const sign = flip.edge === "heel" ? kickflipSign : -kickflipSign;
                expect(Math.sign(air.rollRad)).toBe(sign);
              }
              expect(air.bailed).toBe(false);
              expect(h.board.wheelsDown).toBe(4);
              expect(feetOn(h)).toBe(true);
              // No thrust. The snapshot velocity is the board frame origin's, which differs
              // from the centre of mass's by ω × offset while spinning, so check it where
              // the board is not spinning (rolling, before and after the trick).
              for (const r of h.since(t0)) {
                if (Vec3.length(r.board.angularVelocityRadps) > 2) continue;
                expect(horizontalSpeed(r)).toBeLessThan(v0 + 0.3);
              }
              const landed = h.eventsOf("TrickLanded").filter((e) => e.timeS >= t0);
              expect(landed.map((e) => e.name)).toEqual([expectedName(kick, flip, shove)]);
            },
            T,
          );
        }
      }
    }
  }
});
