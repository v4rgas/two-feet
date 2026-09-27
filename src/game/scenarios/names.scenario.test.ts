import { afterEach, describe, expect, it } from "vitest";
import { RIDER_CONFIG } from "../../contexts/rider";
import type { Kick } from "../../shared";
import type { ScenarioHarness } from "./scenario-harness";
import {
  airSummary,
  awayFrom,
  catchAt,
  guideFoot,
  heel,
  loadAndPop,
  playCombo,
  popFoot,
  rolling,
  STANCES,
  spaceWhenDone,
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

/** Pop from `kick`, the pop foot sweeps to `side`, Space once the board has turned 180°. */
async function shove(
  kick: Kick,
  stance: (typeof STANCES)[number],
  side: "heel" | "toe",
): Promise<string[]> {
  const h = await track(rolling(1.3, { stance }));
  const t0 = h.timeS;
  loadAndPop(h, 0.2, kick);
  h.foot(popFoot(kick), side === "heel" ? heel(stance) : toe(stance), 0.25, 0.1);
  h.run(0.3);
  spaceWhenDone(h, t0, 0, Math.PI);
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

    it(
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

  it(
    'double kickflip (D held through the load, swipe D → A) → "Double Kickflip"',
    async () => {
      const h = await track(rolling(1.3));
      const t0 = h.timeS;
      const popAtS = playCombo(h, { kick: "tail", flick: "heel", sweep: null, flickUnits: 2 });
      h.run(popAtS + 0.1);
      spaceWhenDone(h, t0, 2 * TAU, 0);
      h.run(1.5);
      expect(names(h, t0)).toEqual(["Double Kickflip"]);
    },
    T,
  );

  // 360 shove / 360 Flip / Laser Flip names are asserted per case in matrix.scenario.test.ts.

  /**
   * Q / E held from the load (wind-up), released when the easing-out body spin will stop
   * at π, with `extra` inputs 0.05 s after the pop; Space once turned and upright.
   */
  async function body180(
    stance: (typeof STANCES)[number],
    code: "KeyQ" | "KeyE",
    kick: Kick,
    extra: (h: ScenarioHarness) => void,
  ): Promise<string[]> {
    const h = await track(rolling(1.3, { stance }));
    const t0 = h.timeS;
    const accel = RIDER_CONFIG.tricks.bodySpinAccelRadps2;
    h.keyDown(code);
    loadAndPop(h, 0.25, kick);
    h.foot(guideFoot(kick), awayFrom(kick), 0.3, 0.15);
    extra(h);
    let turned = 0;
    let prev = h.rider.headingRad;
    const turn = () => {
      turned += Math.atan2(
        Math.sin(h.rider.headingRad - prev),
        Math.cos(h.rider.headingRad - prev),
      );
      prev = h.rider.headingRad;
    };
    for (let i = 0; i < 150; i += 1) {
      h.run(1 / 120);
      turn();
      const rate = h.rider.bodySpinRateRadps;
      if (!h.board.grounded && Math.abs(turned) + (rate * rate) / (2 * accel) >= Math.PI) break;
    }
    h.keyUp(code);
    for (let i = 0; i < 100 && !h.board.grounded; i += 1) {
      const rolled = Math.abs(airSummary(h, t0).rollRad);
      const flipDone = rolled < 1 || rolled > TAU - 0.45;
      if (Math.abs(turned) >= Math.PI - 0.25 && flipDone && h.tiltRad() <= 0.5) break;
      h.run(1 / 120);
      turn();
    }
    catchAt(h, 0);
    h.run(1.5);
    return names(h, t0);
  }

  it(
    'body 180 (E: clockwise) → "BS 180" in regular, "FS 180" in goofy',
    async () => {
      expect(await body180("regular", "KeyE", "tail", () => {})).toEqual(["BS 180"]);
      expect(await body180("goofy", "KeyE", "tail", () => {})).toEqual(["FS 180"]);
    },
    T,
  );

  it(
    'BS 180 (E in regular) + kickflip (A) → "BS 180 Kickflip"',
    async () => {
      const kickflip = (h: ScenarioHarness) => h.foot("front", heel(h.stance), 0.3, 0.08);
      expect(await body180("regular", "KeyE", "tail", kickflip)).toEqual(["BS 180 Kickflip"]);
    },
    T,
  );

  it(
    'nollie + FS 180 (Q in regular) + heelflip (→) → "Nollie FS 180 Heelflip"',
    async () => {
      const heelflip = (h: ScenarioHarness) => h.foot("back", toe(h.stance), 0.3, 0.08);
      expect(await body180("regular", "KeyQ", "nose", heelflip)).toEqual([
        "Nollie FS 180 Heelflip",
      ]);
    },
    T,
  );

  it(
    'flick + heel-side sweep → "Varial Kickflip"',
    async () => {
      const h = await track(rolling(1.3));
      const t0 = h.timeS;
      playCombo(h, {
        kick: "tail",
        flick: "heel",
        sweep: "heel",
      });
      h.run(0.3);
      spaceWhenDone(h, t0, TAU, Math.PI);
      h.run(1.5);
      expect(names(h, t0)).toEqual(["Varial Kickflip"]);
    },
    T,
  );
});
