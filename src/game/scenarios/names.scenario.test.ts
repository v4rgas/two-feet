import { afterEach, describe, expect, it } from "vitest";
import type { Kick } from "../../shared";
import type { ScenarioHarness } from "./scenario-harness";
import {
  airSummary,
  awayFrom,
  catchAt,
  guideFoot,
  heel,
  loadAndPop,
  popFoot,
  rolling,
  STANCES,
  toe,
} from "./scenario-helpers";

/*
 * END-TO-END TRICK NAMES (tricks context, ADR 0007): the real keyboard adapter, input,
 * rider trick controller, Rapier board and the real recognizer wired by `compose.ts`.
 * Each case asserts the `TrickLanded` name. Cases that need controller features the
 * trick controller does not have yet are `it.skip` with the missing feature named.
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
const TAU = 2 * Math.PI;
/** A player hits Space when the board looks upright: tilt within this, rad. */
const UPRIGHT_RAD = 0.6;

/** Runs until the flip is nearly done and the board looks upright, then presses Space. */
function spaceWhenUpright(h: ScenarioHarness, t0: number): void {
  for (let i = 0; i < 120; i += 1) {
    const roll = Math.abs(airSummary(h, t0).rollRad);
    if (roll > TAU - 1 && h.tiltRad() <= UPRIGHT_RAD) break;
    h.run(1 / 120);
  }
  catchAt(h, 0);
}

/** Names of every trick outcome since `fromS` ("bail: <name>" for a `TrickBailed`). */
function names(h: ScenarioHarness, fromS: number): string[] {
  return h.events
    .filter((e) => e.timeS >= fromS - 1e-9)
    .flatMap((e) =>
      e.type === "TrickLanded"
        ? [e.name]
        : e.type === "TrickBailed"
          ? [`bail: ${e.name ?? "?"} (${e.reason})`]
          : [],
    );
}

/** Pop from `kick`, level with the guide foot, catch: an ollie or a nollie. */
async function ollie(kick: Kick, stance: (typeof STANCES)[number]): Promise<string[]> {
  const h = await track(rolling(1.3, { stance }));
  const t0 = h.timeS;
  loadAndPop(h, 0.2, kick);
  h.foot(guideFoot(kick), awayFrom(kick), 0.25, 0.15);
  catchAt(h, 0.45);
  h.run(1.5);
  return names(h, t0);
}

/** Pop from `kick`, the guide foot flicks to `edge`, Space once upright. */
async function flip(
  kick: Kick,
  stance: (typeof STANCES)[number],
  edge: "heel" | "toe",
): Promise<string[]> {
  const h = await track(rolling(1.3, { stance }));
  const t0 = h.timeS;
  loadAndPop(h, 0.2, kick);
  h.foot(guideFoot(kick), edge === "heel" ? heel(stance) : toe(stance), 0.25, 0.1);
  h.run(0.3);
  spaceWhenUpright(h, t0);
  h.run(1.5);
  return names(h, t0);
}

/** Pop from `kick`, the pop foot sweeps to `side`, catch near the end of the air. */
async function shove(
  kick: Kick,
  stance: (typeof STANCES)[number],
  side: "heel" | "toe",
): Promise<string[]> {
  const h = await track(rolling(1.3, { stance }));
  const t0 = h.timeS;
  loadAndPop(h, 0.2, kick);
  h.foot(popFoot(kick), side === "heel" ? heel(stance) : toe(stance), 0.25, 0.1);
  catchAt(h, 0.55);
  h.run(1.5);
  return names(h, t0);
}

describe("trick names, end to end", () => {
  for (const stance of STANCES) {
    it(
      `${stance}: ollie → "Ollie"`,
      async () => {
        expect(await ollie("tail", stance)).toEqual(["Ollie"]);
      },
      T,
    );

    it(
      `${stance}: nollie → "Nollie"`,
      async () => {
        expect(await ollie("nose", stance)).toEqual(["Nollie"]);
      },
      T,
    );

    it(
      `${stance}: kickflip → "Kickflip"`,
      async () => {
        expect(await flip("tail", stance, "heel")).toEqual(["Kickflip"]);
      },
      T,
    );

    it(
      `${stance}: nollie kickflip → "Nollie Kickflip"`,
      async () => {
        expect(await flip("nose", stance, "heel")).toEqual(["Nollie Kickflip"]);
      },
      T,
    );

    it(
      `${stance}: back foot to the heel side → "BS Pop Shove-it"`,
      async () => {
        expect(await shove("tail", stance, "heel")).toEqual(["BS Pop Shove-it"]);
      },
      T,
    );

    it(
      `${stance}: back foot to the toe side → "FS Pop Shove-it"`,
      async () => {
        expect(await shove("tail", stance, "toe")).toEqual(["FS Pop Shove-it"]);
      },
      T,
    );

    // Needs the heelflip (guide foot to the toe edge); the base controller only flips on
    // the heel edge (MECHANICS 12e / 12f, in progress on main).
    it.skip(
      `${stance}: heelflip → "Heelflip"; nollie heelflip → "Nollie Heelflip"`,
      async () => {
        expect(await flip("tail", stance, "toe")).toEqual(["Heelflip"]);
        expect(await flip("nose", stance, "toe")).toEqual(["Nollie Heelflip"]);
      },
      T,
    );

    // The name follows the TAIL's swing (MECHANICS "Shove direction naming"): the nollie
    // pop foot sweeping the NOSE toward the toe side swings the tail to the heel side =
    // backside. NOTE: MECHANICS' nollie key table labels the heel-side sweep (`A` in
    // regular) "BS"; by the tail rule, and with the base controller, it spins frontside.
    // If the nollie shove keys change on main, this pins which way the names go.
    it(
      `${stance}: nollie shoves are named by the tail's swing`,
      async () => {
        expect(await shove("nose", stance, "toe")).toEqual(["Nollie BS Pop Shove-it"]);
        expect(await shove("nose", stance, "heel")).toEqual(["Nollie FS Pop Shove-it"]);
      },
      T,
    );
  }

  // Needs the flick hold ≥ doubleFlickHoldS → 4π (MECHANICS "Trick matrix"), not in the
  // base controller.
  it.skip('double kickflip → "Double Kickflip"', () => {});

  // Needs the sweep hold ≥ shove360HoldS → 2π (MECHANICS "Trick matrix").
  it.skip('360 shove → "360 Shove-it"; with a flick → "360 Flip"', () => {});

  // Needs the Q / E body spin (MECHANICS "Body spin"); the base rider heading is frozen
  // in the air, so the body channel always reads 0.
  it.skip('body 180 → "BS 180" / "FS 180"; nollie + FS 180 + heelflip → "Nollie FS 180 Heelflip"', () => {});

  // The varial kickflip scenario is skipped in tricks.scenario.test.ts (yaw overshoot).
  it.skip('flick + heel-side sweep → "Varial Kickflip"', () => {});
});
