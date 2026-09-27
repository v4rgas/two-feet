import { afterEach, describe, expect, it } from "vitest";
import { deckTopPointLocal, RIDER_CONFIG } from "../../contexts/rider";
import { Transform, Vec3 } from "../../shared";
import type { ScenarioHarness } from "./scenario-harness";
import {
  airSummary,
  awayFrom,
  catchAt,
  feetOn,
  guideFoot,
  heel,
  loadAndPop,
  popFoot,
  rolling,
  STANCES,
  toe,
} from "./scenario-helpers";

/*
 * MECHANICS.md acceptance scenarios 1–6 and 9 (headless, real Rapier, full loop, keys
 * through the real keyboard adapter). Timings are the spec's; the catch is Space.
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

/** Runs until the shove has turned the board about 180°, then presses Space (catch). */
function spaceWhenReversed(h: ScenarioHarness, t0: number): void {
  for (let i = 0; i < 120; i += 1) {
    if (Math.abs(Math.abs(airSummary(h, t0).yawRad) - Math.PI) <= 0.3) break;
    h.run(1 / 120);
  }
  catchAt(h, 0);
}

describe("1. ollie", () => {
  for (const stance of STANCES) {
    for (const pushS of [1.3, 0]) {
      it(
        `${stance}, ${pushS > 0 ? "rolling" : "standstill"}: ↓+set, release ↓, W, Space → clean, ≥ 0.25 m, speed kept`,
        async () => {
          const h = await track(rolling(pushS, { stance }));
          const v0 = h.forwardSpeedMps();
          const t0 = h.timeS;
          loadAndPop(h, 0.2);
          h.foot("front", "up", 0.25, 0.15);
          catchAt(h, 0.45);
          h.run(1.5);
          const air = airSummary(h, t0);
          expect(air.popped).toBe(true);
          expect(air.riseM).toBeGreaterThanOrEqual(0.25);
          expect(air.maxClearanceM).toBeGreaterThanOrEqual(0.15);
          expect(air.bailed).toBe(false);
          expect(air.landingUpDot ?? 0).toBeGreaterThan(Math.cos(0.3));
          expect(h.board.wheelsDown).toBe(4);
          expect(feetOn(h)).toBe(true);
          if (pushS > 0) expect(h.forwardSpeedMps()).toBeGreaterThan(0.9 * v0 - 0.15);
          // No stall: back on four wheels, still rolling forward.
          if (pushS > 0) expect(h.forwardSpeedMps()).toBeGreaterThan(1);
        },
        T,
      );
    }
  }
});

describe("load and pop", () => {
  it(
    "releasing S before ↓ still pops (the order of letting go does not matter)",
    async () => {
      const h = await track(rolling(1.3));
      const t0 = h.timeS;
      h.foot("back", "down", 0, 0.22);
      h.foot("front", "down", 0.02, 0.15);
      h.foot("front", "up", 0.27, 0.15);
      catchAt(h, 0.47);
      h.run(1.5);
      expect(h.eventsOf("BoardPopped")).toHaveLength(1);
      expect(airSummary(h, t0).bailed).toBe(false);
    },
    T,
  );

  it(
    "↓ alone held, then released: a tail press, no pop",
    async () => {
      const h = await track(rolling(1.3));
      h.foot("back", "down", 0, 0.6);
      h.run(1.2);
      expect(h.eventsOf("BoardPopped")).toHaveLength(0);
      expect(h.eventsOf("RiderBailed")).toHaveLength(0);
    },
    T,
  );
});

describe("ollie goes straight (↓ + set never leans or steers)", () => {
  for (const stance of STANCES) {
    it(
      `${stance} at ~3 m/s: heading < 2°, sideways drift < 3 cm, |roll| < 3° in the air, 4 wheels`,
      async () => {
        const h = await track(rolling(1.1, { stance }));
        const t0 = h.timeS;
        const start = h.board.transform.positionM;
        const heading0 = h.headingRad();
        // ↓ down, S 0.02 s later, both held 0.2 s, release ↓ (S still held), W 0.05 s later.
        loadAndPop(h, 0.22);
        h.foot("front", "up", 0.27, 0.15);
        catchAt(h, 0.47);
        h.run(1.2);
        const deg = Math.PI / 180;
        for (const r of h.since(t0)) {
          expect(Math.abs(h.headingRad(r.board) - heading0)).toBeLessThan(2 * deg);
          expect(Math.abs(r.board.transform.positionM.z - start.z)).toBeLessThan(0.03);
          if (!r.board.grounded) {
            const side = Transform.toWorldDirection(r.board.transform, Vec3.UNIT_Z);
            expect(Math.abs(Math.asin(side.y))).toBeLessThan(3 * deg);
          }
        }
        expect(airSummary(h, t0).airtimeS).toBeGreaterThan(0.3);
        expect(h.board.wheelsDown).toBe(4);
      },
      T,
    );
  }
});

describe("2. sloppy ollie (no W)", () => {
  it(
    "lands nose-high or bails, never explodes or sinks",
    async () => {
      const h = await track(rolling(1.3));
      const t0 = h.timeS;
      loadAndPop(h, 0.2);
      catchAt(h, 0.45);
      h.run(2.5);
      const air = airSummary(h, t0);
      expect(air.popped).toBe(true);
      const clean = !air.bailed && (air.landingUpDot ?? 1) > Math.cos(0.3);
      expect(air.maxPitchRad > 0.5 || air.bailed || !clean).toBe(true);
      for (const r of h.since(t0)) {
        expect(r.board.transform.positionM.y).toBeGreaterThan(0);
        expect(Math.hypot(r.board.linearVelocityMps.x, r.board.linearVelocityMps.y)).toBeLessThan(
          12,
        );
      }
    },
    T,
  );
});

describe("3–4. kickflip", () => {
  for (const stance of STANCES) {
    it(
      `${stance}: flick 0.05 s after the pop, Space near 2π → one full roll, clean`,
      async () => {
        const h = await track(rolling(1.3, { stance }));
        const t0 = h.timeS;
        loadAndPop(h, 0.2);
        h.foot("front", heel(stance), 0.25, 0.1);
        h.run(0.3);
        // Space once the roll is near a full turn.
        spaceWhenUpright(h, t0);
        h.run(1.5);
        const air = airSummary(h, t0);
        expect(Math.abs(Math.abs(air.rollRad) - TAU)).toBeLessThan(0.3);
        // Kickflip direction: roll −toeSide about the nose (ADR 0005).
        expect(Math.sign(air.rollRad)).toBe(stance === "regular" ? -1 : 1);
        expect(air.bailed).toBe(false);
        expect(h.board.wheelsDown).toBe(4);
        expect(feetOn(h)).toBe(true);
      },
      T,
    );
  }

  it(
    "late flick (0.3 s after the pop) under-rotates or bails, never crashes",
    async () => {
      const h = await track(rolling(1.3));
      const t0 = h.timeS;
      loadAndPop(h, 0.2);
      h.foot("front", heel(h.stance), 0.5, 0.1);
      catchAt(h, 0.75);
      h.run(2.5);
      const air = airSummary(h, t0);
      expect(Math.abs(air.rollRad) < TAU - 0.3 || air.bailed).toBe(true);
      for (const r of h.since(t0)) expect(r.board.transform.positionM.y).toBeGreaterThan(0);
    },
    T,
  );
});

describe("12e–12f. heelflip, nollie heelflip, nollie kickflip", () => {
  /** Flip from `kick` with the guide foot toward `edge`, optionally with the level key. */
  async function flipRun(
    stance: (typeof STANCES)[number],
    kick: "tail" | "nose",
    edge: "toe" | "heel",
    withLevel: boolean,
  ) {
    const h = await track(rolling(1.3, { stance }));
    const t0 = h.timeS;
    loadAndPop(h, 0.2, kick);
    const guide = guideFoot(kick);
    h.foot(guide, edge === "toe" ? toe(stance) : heel(stance), 0.25, 0.1);
    if (withLevel) h.foot(guide, awayFrom(kick), 0.25, 0.1);
    h.run(0.3);
    spaceWhenUpright(h, t0);
    h.run(1.5);
    return { h, air: airSummary(h, t0) };
  }

  for (const stance of STANCES) {
    const kickflipSign = stance === "regular" ? -1 : 1;
    for (const withLevel of [false, true]) {
      it(
        `${stance} heelflip (${withLevel ? "level + " : ""}guide foot → toe edge): one full roll opposite to the kickflip, clean`,
        async () => {
          const { h, air } = await flipRun(stance, "tail", "toe", withLevel);
          expect(Math.abs(Math.abs(air.rollRad) - TAU)).toBeLessThan(0.3);
          expect(Math.sign(air.rollRad)).toBe(-kickflipSign);
          expect(air.bailed).toBe(false);
          expect(h.board.wheelsDown).toBe(4);
          expect(feetOn(h)).toBe(true);
        },
        T,
      );
    }
    for (const edge of ["toe", "heel"] as const) {
      it(
        `${stance} nollie ${edge === "toe" ? "heelflip" : "kickflip"} (back foot → ${edge} edge): one full roll, clean`,
        async () => {
          const { h, air } = await flipRun(stance, "nose", edge, false);
          expect(h.eventsOf("BoardPopped").map((e) => e.kick)).toEqual(["nose"]);
          expect(Math.abs(Math.abs(air.rollRad) - TAU)).toBeLessThan(0.3);
          expect(Math.sign(air.rollRad)).toBe(edge === "toe" ? -kickflipSign : kickflipSign);
          expect(air.bailed).toBe(false);
          expect(feetOn(h)).toBe(true);
        },
        T,
      );
    }
  }
});

describe("5–6. shove-it and varial", () => {
  for (const [dir, label] of [
    ["heel", "backside"],
    ["toe", "frontside"],
  ] as const) {
    it(
      `${label}: back foot ${dir} 0.05 s after the pop → yaw π, clean`,
      async () => {
        const h = await track(rolling(1.3));
        const t0 = h.timeS;
        loadAndPop(h, 0.2);
        h.foot("back", dir === "heel" ? heel(h.stance) : toe(h.stance), 0.25, 0.1);
        catchAt(h, 0.55);
        h.run(1.5);
        const air = airSummary(h, t0);
        expect(Math.abs(Math.abs(air.yawRad) - Math.PI)).toBeLessThan(0.3);
        expect(air.bailed).toBe(false);
        expect(h.board.wheelsDown).toBe(4);
        expect(feetOn(h)).toBe(true);
      },
      T,
    );
  }

  it(
    "backside and frontside spin opposite ways",
    async () => {
      const yaws: number[] = [];
      for (const dir of ["heel", "toe"] as const) {
        const h = await track(rolling(1.3));
        const t0 = h.timeS;
        loadAndPop(h, 0.2);
        h.foot("back", dir === "heel" ? heel(h.stance) : toe(h.stance), 0.25, 0.1);
        h.run(0.5);
        yaws.push(airSummary(h, t0).yawRad);
      }
      expect(Math.sign(yaws[0] ?? 0)).toBe(-Math.sign(yaws[1] ?? 0));
    },
    T,
  );

  it(
    "varial kickflip: flick and shove together → roll ≈ 2π and yaw ≈ π",
    async () => {
      const h = await track(rolling(1.3));
      const t0 = h.timeS;
      loadAndPop(h, 0.2);
      h.foot("front", heel(h.stance), 0.25, 0.1);
      h.foot("back", heel(h.stance), 0.25, 0.1);
      h.run(0.3);
      spaceWhenUpright(h, t0);
      h.run(1.5);
      const air = airSummary(h, t0);
      expect(Math.abs(Math.abs(air.rollRad) - TAU)).toBeLessThan(0.4);
      expect(Math.abs(Math.abs(air.yawRad) - Math.PI)).toBeLessThan(0.4);
    },
    T,
  );
});

describe("9. catch cone", () => {
  it(
    "Space mid-flip (upside down) does not catch; again near upright after catchRetryS does",
    async () => {
      const h = await track(rolling(1.3));
      const t0 = h.timeS;
      loadAndPop(h, 0.2);
      h.foot("front", heel(h.stance), 0.25, 0.1);
      h.run(0.3);
      // Wait until the board is upside down, press Space.
      for (let i = 0; i < 60 && h.tiltRad() < 2.4; i += 1) h.run(1 / 120);
      expect(h.tiltRad()).toBeGreaterThan(2);
      catchAt(h, 0);
      h.run(0.05);
      expect(feetOn(h)).toBe(false);
      // Near upright again (and past the lockout): Space catches.
      h.run(RIDER_CONFIG.tricks.catchRetryS - 0.03);
      for (let i = 0; i < 60 && h.tiltRad() > UPRIGHT_RAD; i += 1) h.run(1 / 120);
      expect(h.board.grounded).toBe(false);
      catchAt(h, 0);
      h.run(0.05);
      expect(feetOn(h)).toBe(true);
      h.run(1.2);
      expect(airSummary(h, t0).bailed).toBe(false);
    },
    T,
  );
});

describe("5. shove-it scoop", () => {
  it(
    "mid-spin the scooped tail dips ≥ 0.2 rad; level again (±0.1) before the catch",
    async () => {
      const h = await track(rolling(1.3));
      const t0 = h.timeS;
      loadAndPop(h, 0.2);
      h.foot("back", heel(h.stance), 0.25, 0.1);
      h.run(0.55);
      const records = h.since(t0);
      const shoveAt = records.find((r) => r.forces.some((f) => f.label === "shove"));
      expect(shoveAt).toBeDefined();
      const startHeading = h.headingRad(shoveAt?.board ?? h.board);
      // Mid-spin: board turned ~90°. Elevation of the scooped end (the original tail).
      const mid = records.find(
        (r) => Math.abs(Math.sin(h.headingRad(r.board) - startHeading)) > 0.95,
      );
      expect(mid).toBeDefined();
      if (mid !== undefined && shoveAt !== undefined) {
        const endSign = Math.sign(Math.cos(h.headingRad(shoveAt.board))) * -1; // tail = board −X
        const tailElevation = -Math.asin(
          Transform.toWorldDirection(mid.board.transform, Vec3.UNIT_X).y,
        );
        expect(endSign).not.toBe(0);
        expect(tailElevation).toBeLessThan(-0.2);
      }
      // Just before the catch (Space at 0.55 s): level again.
      expect(Math.abs(h.pitchRad())).toBeLessThan(0.1);
      catchAt(h, 0);
      h.run(1.2);
      expect(airSummary(h, t0).bailed).toBe(false);
      expect(h.board.wheelsDown).toBe(4);
    },
    T,
  );
});

describe("10. nollie (mirrored from the nose)", () => {
  for (const stance of STANCES) {
    it(
      `${stance} nollie: W + ↑, release W, ↓ levels, Space → clean, ≥ 0.25 m, tail rises`,
      async () => {
        const h = await track(rolling(1.3, { stance }));
        const t0 = h.timeS;
        loadAndPop(h, 0.2, "nose");
        h.foot(guideFoot("nose"), awayFrom("nose"), 0.25, 0.15);
        catchAt(h, 0.45);
        h.run(1.5);
        const air = airSummary(h, t0);
        const popped = h.eventsOf("BoardPopped");
        expect(popped.map((e) => e.kick)).toEqual(["nose"]);
        expect(popped[0]?.foot).toBe("front");
        expect(air.riseM).toBeGreaterThanOrEqual(0.25);
        // Mirrored pitch: the tail comes up, the nose goes down.
        const minPitch = Math.min(...h.since(t0).map((r) => h.pitchRad(r.board)));
        expect(minPitch).toBeLessThan(-0.1);
        expect(air.bailed).toBe(false);
        expect(h.board.wheelsDown).toBe(4);
        expect(feetOn(h)).toBe(true);
      },
      T,
    );
  }

  it(
    "nollie kickflip: guide (back) foot to the heel edge → one full roll, same direction",
    async () => {
      const h = await track(rolling(1.3));
      const t0 = h.timeS;
      loadAndPop(h, 0.2, "nose");
      h.foot(guideFoot("nose"), heel(h.stance), 0.25, 0.1);
      spaceWhenUpright(h, t0);
      h.run(1.5);
      const air = airSummary(h, t0);
      expect(Math.abs(Math.abs(air.rollRad) - TAU)).toBeLessThan(0.3);
      expect(Math.sign(air.rollRad)).toBe(-1);
      expect(air.bailed).toBe(false);
      expect(feetOn(h)).toBe(true);
    },
    T,
  );

  it(
    "nollie shove-it: pop (front) foot to the heel side → yaw π, clean",
    async () => {
      const h = await track(rolling(1.3));
      const t0 = h.timeS;
      loadAndPop(h, 0.2, "nose");
      h.foot(popFoot("nose"), heel(h.stance), 0.25, 0.1);
      catchAt(h, 0.55);
      h.run(1.5);
      const air = airSummary(h, t0);
      expect(Math.abs(Math.abs(air.yawRad) - Math.PI)).toBeLessThan(0.3);
      expect(air.bailed).toBe(false);
      expect(feetOn(h)).toBe(true);
    },
    T,
  );
});

describe("feet never teleport (catch, lift, slides)", () => {
  /** Largest per-step move of either drawn foot in the rider frame, m. */
  function maxFootStepM(h: ScenarioHarness, fromS: number): number {
    let max = 0;
    const rs = h.since(fromS);
    for (let i = 1; i < rs.length; i += 1) {
      const a = rs[i - 1];
      const b = rs[i];
      if (a === undefined || b === undefined) continue;
      for (const id of ["front", "back"] as const) {
        max = Math.max(max, Vec3.distance(a.rider[id].positionRiderM, b.rider[id].positionRiderM));
      }
    }
    return max;
  }

  for (const stance of STANCES) {
    it(
      `${stance} ollie with a Space catch: each foot moves ≤ 1.5 cm per 1/120 s step, and ends on the grip`,
      async () => {
        const h = await track(rolling(1.3, { stance }));
        const t0 = h.timeS;
        loadAndPop(h, 0.2);
        h.foot("front", "up", 0.25, 0.15);
        catchAt(h, 0.45);
        h.run(1.5);
        expect(airSummary(h, t0).bailed).toBe(false);
        expect(maxFootStepM(h, t0)).toBeLessThanOrEqual(0.015);
        for (const id of ["front", "back"] as const) {
          const foot = h.rider[id];
          const { alongM, acrossM } = foot.deckPosition;
          const grip = Transform.toWorldPoint(
            h.board.transform,
            deckTopPointLocal(h.sim.spec, alongM, acrossM),
          );
          expect(Vec3.distance(foot.positionWorldM, grip)).toBeLessThan(0.005);
        }
      },
      T,
    );
  }

  it(
    "kickflip with a Space catch: no foot jump either",
    async () => {
      const h = await track(rolling(1.3));
      const t0 = h.timeS;
      loadAndPop(h, 0.2);
      h.foot("front", heel(h.stance), 0.25, 0.1);
      h.run(0.3);
      spaceWhenUpright(h, t0);
      h.run(1.5);
      expect(maxFootStepM(h, t0)).toBeLessThanOrEqual(0.015);
    },
    T,
  );
});

describe("shove-its never move the rider", () => {
  for (const [dir, label] of [
    ["heel", "backside"],
    ["toe", "frontside"],
  ] as const) {
    it(
      `${label} at ~3 m/s: rider heading < 3°, torso off its path < 3 cm, board reversed under still feet`,
      async () => {
        const h = await track(rolling(1.1));
        const t0 = h.timeS;
        const heading0 = h.rider.headingRad;
        const torso0 = h.rider.torsoPositionWorldM;
        loadAndPop(h);
        h.foot("back", dir === "heel" ? heel(h.stance) : toe(h.stance), 0.27, 0.1);
        h.run(0.3);
        spaceWhenReversed(h, t0);
        h.run(1.5);
        const deg = Math.PI / 180;
        for (const r of h.since(t0)) {
          expect(Math.abs(r.rider.headingRad - heading0)).toBeLessThan(3 * deg);
          expect(Math.abs(r.rider.torsoPositionWorldM.z - torso0.z)).toBeLessThan(0.03);
        }
        const air = airSummary(h, t0);
        expect(Math.abs(Math.abs(air.yawRad) - Math.PI)).toBeLessThan(0.3);
        expect(air.bailed).toBe(false);
        expect(h.board.wheelsDown).toBe(4);
        expect(feetOn(h)).toBe(true);
        // Still rolling the same way (no redirect by the wheel grip).
        const v = h.board.linearVelocityMps;
        expect(Math.abs(Math.atan2(-v.z, v.x) - heading0)).toBeLessThan(3 * deg);
        // The board is reversed under the rider: the front foot now stands on the old tail.
        expect(h.rider.front.deckPosition.alongM).toBeLessThan(0);
      },
      T,
    );
  }

  it(
    "an uncaught shove that lands sideways bails instead of turning the rider",
    async () => {
      const h = await track(rolling(1.1));
      const t0 = h.timeS;
      const heading0 = h.rider.headingRad;
      loadAndPop(h);
      h.foot("back", heel(h.stance), 0.27, 0.1);
      h.run(2);
      expect(airSummary(h, t0).bailed).toBe(true);
      const bailAt = h.eventsOf("RiderBailed")[0]?.timeS ?? Number.POSITIVE_INFINITY;
      for (const r of h.since(t0)) {
        if (r.timeS <= bailAt) {
          expect(Math.abs(r.rider.headingRad - heading0)).toBeLessThan(3 * (Math.PI / 180));
        }
      }
    },
    T,
  );
});
