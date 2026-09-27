import { describe, expect, it } from "vitest";
import { Vec3 } from "../../../shared";
import { RIDER_CONFIG } from "../rider.config";
import type { FootForce } from "./foot-force";
import type { BoardKinematics, FootForceOutput } from "./foot-force-model";
import { Rider } from "./rider";
import type { RiderState } from "./rider-state";
import { board, controls, DECK, DT, MASS, type Sticks } from "./test-fixtures";
import { TrickController } from "./trick-controller";

const T = RIDER_CONFIG.tricks;

function setup() {
  const model = new TrickController(DECK, RIDER_CONFIG);
  const rider = new Rider(DECK, RIDER_CONFIG, board());
  let state: RiderState = rider.state;
  const step = (
    sticks: Sticks,
    b: BoardKinematics = board(),
    s: RiderState = state,
  ): FootForceOutput =>
    model.computeForces({ controls: controls(sticks), rider: s, board: b, mass: MASS, dtS: DT });
  return {
    model,
    rider,
    step,
    lift: () => {
      rider.liftFeet();
      state = rider.state;
    },
  };
}

function steps(
  step: (s: Sticks, b?: BoardKinematics) => FootForceOutput,
  sticks: Sticks,
  n: number,
  b?: BoardKinematics,
) {
  let last: FootForceOutput = { forces: [], popped: null, caught: false };
  for (let i = 0; i < n; i += 1) last = step(sticks, b);
  return last;
}

/** Sum of the horizontal parts of every linear force/impulse except the push. */
function horizontalThrust(forces: readonly FootForce[]): number {
  let sum = Vec3.ZERO;
  for (const f of forces) {
    if (f.label === "push") continue;
    if (f.kind === "force") sum = Vec3.add(sum, f.forceN);
    if (f.kind === "impulse") sum = Vec3.add(sum, f.impulseNs);
  }
  return Math.hypot(sum.x, sum.z);
}

/** Hold ↓ + D, release ↓ with D still held (the ollie set-up); returns the pop step. */
function ollie(
  step: (s: Sticks, b?: BoardKinematics) => FootForceOutput,
  loadSteps = 12,
): FootForceOutput {
  steps(step, { by: -1, fx: 1 }, loadSteps);
  return step({ fx: 1 });
}

describe("TrickController — rolling", () => {
  it("stands with the weight straight down on the centre line", () => {
    const { step } = setup();
    const press = step({}).forces.filter((f) => f.label === "press");
    expect(press).toHaveLength(2);
    for (const f of press) {
      if (f.kind !== "force") throw new Error("press is a force");
      expect(f.forceN.x).toBe(0);
      expect(f.forceN.z).toBe(0);
      expect(f.forceN.y).toBeCloseTo(-RIDER_CONFIG.stance.standingPressN);
      expect(f.pointWorldM.z).toBeCloseTo(0, 9);
    }
  });

  it("carving moves the weight toward the leaning edge (inside the wheels)", () => {
    const { step } = setup();
    const press = step({ fx: 1, bx: 1 }).forces.filter((f) => f.label === "press");
    for (const f of press) {
      if (f.kind !== "force") throw new Error("press is a force");
      expect(f.pointWorldM.z).toBeCloseTo(RIDER_CONFIG.stance.pressMaxAcrossM, 6);
    }
  });

  it("feet never thrust: no horizontal force for any stick combination on the ground", () => {
    for (const fx of [-1, 0, 1])
      for (const fy of [-1, 0, 1])
        for (const bx of [-1, 0, 1])
          for (const by of [-1, 0, 1]) {
            const { step } = setup();
            for (let i = 0; i < 20; i += 1) {
              expect(horizontalThrust(step({ fx, fy, bx, by }).forces)).toBeLessThan(1e-9);
            }
          }
  });

  it("pushes along the heading only on the ground, with a cooldown", () => {
    const { step } = setup();
    const first = step({ feetDown: true }).forces.filter((f) => f.label === "push");
    expect(first).toHaveLength(1);
    expect(step({ feetDown: true }).forces.some((f) => f.label === "push")).toBe(false);
    const air = setup();
    expect(
      air
        .step({ feetDown: true }, board({ grounded: false }))
        .forces.some((f) => f.label === "push"),
    ).toBe(false);
  });
});

describe("TrickController — press, load, arm, pop", () => {
  it("↓ alone is a tail press (torque only) and never pops", () => {
    const { step } = setup();
    const out = steps(step, { by: -1 }, 30);
    expect(out.forces.some((f) => f.label === "manual" && f.kind === "torque")).toBe(true);
    expect(step({ by: 0 }).popped).toBeNull();
  });

  it("hold ↓ + D, release ↓ pops: vertical impulse through the COM and a nose-up snap", () => {
    const { step } = setup();
    const out = ollie(step);
    expect(out.popped).toBe("tail");
    const up = out.forces.find((f) => f.label === "pop" && f.kind === "impulse");
    if (up?.kind !== "impulse") throw new Error("no pop impulse");
    expect(up.impulseNs.x).toBe(0);
    expect(up.impulseNs.z).toBe(0);
    expect(up.pointWorldM).toEqual(MASS.centerOfMassWorldM);
    const loadFraction = (12 * DT - T.loadMinS) / (T.loadMaxS - T.loadMinS);
    const h = T.popMinHeightM + (T.popMaxHeightM - T.popMinHeightM) * loadFraction;
    expect(up.impulseNs.y).toBeCloseTo(MASS.massKg * Math.sqrt(2 * T.gravityMps2 * h), 1);
    const snap = out.forces.find((f) => f.label === "pop" && f.kind === "angularImpulse");
    if (snap?.kind !== "angularImpulse") throw new Error("no snap");
    // About board +Z (nose up), nothing else.
    expect(snap.impulseNms.z).toBeGreaterThan(0);
    expect(Math.abs(snap.impulseNms.x) + Math.abs(snap.impulseNms.y)).toBeLessThan(1e-9);
  });

  it("letting go of D first still pops on ↓; a too-short load does not", () => {
    const early = setup();
    steps(early.step, { by: -1, fx: 1 }, 12);
    steps(early.step, { by: -1 }, 20);
    expect(early.step({}).popped).toBe("tail");
    const short = setup();
    steps(short.step, { by: -1, fx: 1 }, 2);
    expect(short.step({}).popped).toBeNull();
  });

  it("no pop off the wheels", () => {
    const { step } = setup();
    steps(step, { by: -1, fx: 1 }, 12, board({ grounded: false }));
    expect(step({}, board({ grounded: false })).popped).toBeNull();
  });

  it("nollie: hold W + →, release W pops the nose with a tail-up snap", () => {
    const { step } = setup();
    steps(step, { fy: 1, bx: 1 }, 12);
    const out = step({ bx: 1 });
    expect(out.popped).toBe("nose");
    const snap = out.forces.find((f) => f.label === "pop" && f.kind === "angularImpulse");
    if (snap?.kind !== "angularImpulse") throw new Error("no snap");
    expect(snap.impulseNms.z).toBeLessThan(0);
  });
});

describe("TrickController — in the air", () => {
  const inAir = (extra: { pitchRad?: number; rollRad?: number } = {}) =>
    board({ grounded: false, y: 0.25, linearVelocityMps: Vec3.create(0, 1.5, 0), ...extra });
  const air = inAir();

  it("W in the level window starts the level PD and adds height", () => {
    const { step, lift } = setup();
    ollie(step);
    lift();
    const out = step({ fy: 1 }, inAir({ pitchRad: 0.3 }));
    expect(out.forces.some((f) => f.label === "level" && f.kind === "impulse")).toBe(true);
    const torque = out.forces.find((f) => f.label === "level" && f.kind === "torque");
    if (torque?.kind !== "torque") throw new Error("no level torque");
    expect(torque.torqueNm.z).toBeLessThan(0); // nose down
  });

  it("kickflip rolls −toe side: negative about the nose in regular, positive in goofy", () => {
    for (const [stance, heel, sign] of [
      ["regular", -1, -1],
      ["goofy", 1, 1],
    ] as const) {
      const { step, lift } = setup();
      ollie((s, b) => step({ ...s, stance, fx: (s.fx ?? 0) * (stance === "goofy" ? -1 : 1) }, b));
      lift();
      const out = step({ fx: heel, stance }, air);
      const flick = out.forces.find((f) => f.label === "flick" && f.kind === "angularImpulse");
      if (flick?.kind !== "angularImpulse") throw new Error(`no flick (${stance})`);
      expect(Math.sign(flick.impulseNms.x)).toBe(sign);
    }
  });

  it("backside and frontside shoves spin opposite ways, yaw only", () => {
    const yaw = (bx: number) => {
      const { step, lift } = setup();
      ollie(step);
      lift();
      const shove = step({ bx }, air).forces.find(
        (f) => f.label === "shove" && f.kind === "angularImpulse",
      );
      if (shove?.kind !== "angularImpulse") throw new Error("no shove");
      expect(Math.abs(shove.impulseNms.x) + Math.abs(shove.impulseNms.z)).toBeLessThan(1e-9);
      return shove.impulseNms.y;
    };
    expect(Math.sign(yaw(-1))).toBe(-Math.sign(yaw(1)));
  });

  it("catch: feet down inside the cone catches; outside it misses and is locked out", () => {
    const inside = setup();
    ollie(inside.step);
    inside.lift();
    expect(inside.step({ feetDown: true }, air).caught).toBe(true);

    const outside = setup();
    ollie(outside.step);
    outside.lift();
    const upsideDown = inAir({ rollRad: 2.5 });
    expect(outside.step({ feetDown: true }, upsideDown).caught).toBe(false);
    outside.step({}, air);
    expect(outside.step({ feetDown: true }, air).caught).toBe(false); // locked out
    steps(outside.step, {}, Math.ceil(T.catchRetryS / DT), air);
    expect(outside.step({ feetDown: true }, air).caught).toBe(true);
  });

  it("releasing the keys does not catch unless autoCatchOnRelease", () => {
    const { step, lift } = setup();
    ollie(step);
    lift();
    step({ fy: 1 }, air);
    expect(step({}, air).caught).toBe(false);
  });
});
