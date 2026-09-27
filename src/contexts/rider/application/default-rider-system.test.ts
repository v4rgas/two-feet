import { describe, expect, it } from "vitest";
import type { DomainEvent, Stance } from "../../../shared";
import { InMemoryEventBus, Quat, Transform, Vec2, Vec3 } from "../../../shared";
import type { BoardSnapshot, RecordedApplication } from "../../board";
import { BOARD_CONFIG, BoardSpec, FakeRigidBodyHandle, NO_CONTACT } from "../../board";
import type { IntentFrame } from "../../input";
import { INPUT_CONFIG, SpringVirtualStick, StickValue } from "../../input";
import { isOverTail } from "../domain/deck-surface";
import { toeSideSign } from "../domain/foot-placement";
import { GestureFootForceModel } from "../domain/gesture-foot-force-model";
import { Rider } from "../domain/rider";
import { RIDER_CONFIG } from "../rider.config";
import { DefaultRiderSystem } from "./default-rider-system";

const DT = 1 / 120;
const SPEC = BoardSpec.create(BOARD_CONFIG.spec);
const POSE = Transform.create(Vec3.create(0, BoardSpec.restHeightM(SPEC), 0), Quat.IDENTITY);

const ALL_WHEELS = {
  noseLeftWheel: true,
  noseRightWheel: true,
  tailLeftWheel: true,
  tailRightWheel: true,
};

function snapshot(
  opts: { grounded?: boolean; angular?: Vec3; linear?: Vec3; transform?: Transform } = {},
): BoardSnapshot {
  const grounded = opts.grounded ?? true;
  return {
    tick: 0,
    timeS: 0,
    transform: opts.transform ?? POSE,
    linearVelocityMps: opts.linear ?? Vec3.ZERO,
    angularVelocityRadps: opts.angular ?? Vec3.ZERO,
    contacts: grounded ? { ...NO_CONTACT, wheels: ALL_WHEELS } : NO_CONTACT,
    wheelsDown: grounded ? 4 : 0,
    grounded,
    airtimeS: 0,
    contactPoints: [],
  };
}

const GROUND = snapshot();
const AIR = snapshot({ grounded: false });

interface StickInput {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

function intents(front: StickInput = {}, back: StickInput = {}, push = false): IntentFrame {
  const foot = (id: "front" | "back", s: StickInput) => ({
    foot: id,
    stick: StickValue.create(s.x ?? 0, s.y ?? 0),
    stickVelocityPerS: Vec2.create(s.vx ?? 0, s.vy ?? 0),
  });
  return { front: foot("front", front), back: foot("back", back), push };
}

function setup(start: BoardSnapshot = GROUND) {
  const body = new FakeRigidBodyHandle();
  body.transform = start.transform;
  const bus = new InMemoryEventBus();
  const events: DomainEvent[] = [];
  bus.subscribeAll((e) => events.push(e));
  const system = new DefaultRiderSystem({
    body,
    bus,
    deck: SPEC,
    config: RIDER_CONFIG,
    board: start,
  });
  /** One loop step (rider parts only), then flush. */
  const step = (frame: IntentFrame, board: BoardSnapshot = GROUND) => {
    system.applyIntents(frame, board, DT);
    system.postPhysics(board, DT);
    bus.flush();
  };
  return { body, bus, events, system, step };
}

const impulses = (applied: readonly RecordedApplication[]) =>
  applied.filter((a) => a.kind === "impulse");

/** Torque about the board origin (the fake's centre of mass) of a force/impulse. */
function torqueOf(point: Vec3, vector: Vec3): Vec3 {
  return Vec3.cross(Vec3.sub(point, POSE.positionM), vector);
}

/** Back foot: hold the tail down long enough to charge, then snap back to neutral. */
function chargeAndRelease(
  step: (f: IntentFrame, b?: BoardSnapshot) => void,
  board: BoardSnapshot,
  releaseBack: StickInput = {},
): void {
  for (let i = 0; i < 20; i += 1) step(intents({}, { y: -1 }), board);
  step(intents({}, { y: -0.5 }), board);
  step(intents({}, { ...releaseBack, y: 0 }), board);
}

describe("DefaultRiderSystem — press and pop", () => {
  it("holding the back stick down over the tail presses the tail with footPressN", () => {
    const { system, step } = setup();
    for (let i = 0; i < 20; i += 1) step(intents({}, { y: -1 }));
    const press = system.lastForces.find((f) => f.foot === "back" && f.label === "press");
    expect(press?.kind).toBe("force");
    if (press?.kind !== "force") return;
    expect(press.forceN.y).toBeCloseTo(-RIDER_CONFIG.forces.footPressN, 6);
    expect(press.pointWorldM.x).toBeLessThan(-BoardSpec.flatLengthM(SPEC) / 2 + 0.03);
  });

  it("press → quick release emits ONE downward impulse at the tail tip + BoardPopped", () => {
    const { body, events, step } = setup();
    chargeAndRelease(step, GROUND);
    for (let i = 0; i < 10; i += 1) step(intents());

    const pops = impulses(body.applied);
    expect(pops).toHaveLength(1);
    const pop = pops[0];
    if (pop?.kind !== "impulse") throw new Error("expected an impulse");
    const tailTip = Transform.toWorldPoint(POSE, BoardSpec.tailTipLocal(SPEC));
    expect(Vec3.equals(pop.pointWorldM, tailTip, 1e-9)).toBe(true);
    expect(Vec3.equals(pop.impulseNs, Vec3.create(0, -RIDER_CONFIG.forces.popImpulseNs, 0))).toBe(
      true,
    );

    const popped = events.filter((e) => e.type === "BoardPopped");
    expect(popped).toHaveLength(1);
    expect(popped[0]).toMatchObject({
      type: "BoardPopped",
      foot: "back",
      impulseNs: RIDER_CONFIG.forces.popImpulseNs,
      tick: 1,
    });
  });

  it("does not pop when the board is airborne", () => {
    const { body, events, step } = setup(AIR);
    chargeAndRelease(step, AIR);
    expect(impulses(body.applied)).toHaveLength(0);
    expect(events.filter((e) => e.type === "BoardPopped")).toHaveLength(0);
  });

  it("does not pop on a slow release or a too-short hold", () => {
    const slow = setup();
    for (let i = 0; i < 20; i += 1) slow.step(intents({}, { y: -1 }));
    for (let i = 0; i < 30; i += 1) slow.step(intents({}, { y: -0.45 }));
    slow.step(intents());
    expect(impulses(slow.body.applied)).toHaveLength(0);

    const tap = setup();
    for (let i = 0; i < 20; i += 1) tap.step(intents({}, { y: -0.5 })); // walk onto the tail
    tap.step(intents({}, { y: -1 })); // 1 step < popMinHoldS
    tap.step(intents());
    expect(impulses(tap.body.applied)).toHaveLength(0);
  });

  it("does not pop when the back foot is not over the tail", () => {
    // Drive the model directly with the back foot pinned at its rest spot (on the flat).
    const model = new GestureFootForceModel(SPEC, RIDER_CONFIG);
    const rider = new Rider(SPEC, RIDER_CONFIG, GROUND).state;
    expect(isOverTail(SPEC, rider.back.deckPosition, RIDER_CONFIG.feet.tailZoneMarginM)).toBe(
      false,
    );
    const forces = [];
    for (let i = 0; i < 20; i += 1) {
      forces.push(
        ...model.computeForces({ controls: intents({}, { y: -1 }), rider, board: GROUND, dtS: DT }),
      );
    }
    forces.push(...model.computeForces({ controls: intents(), rider, board: GROUND, dtS: DT }));
    expect(forces.some((f) => f.label === "pop")).toBe(false);
    // Standing on the flat, the back foot does not hold the tail either.
    expect(forces.every((f) => f.label !== "press" || f.kind !== "force" || f.forceN.y > -30)).toBe(
      true,
    );
  });
});

describe("DefaultRiderSystem — sweep (shuvit)", () => {
  it("back stick sideways during the pop adds a tangential impulse at the tail tip", () => {
    const { body, system, step } = setup();
    for (let i = 0; i < 20; i += 1) step(intents({}, { y: -1 }));
    step(intents({}, { y: -0.5 }));
    step(intents({}, { x: 0.8, y: 0 }));
    const sweep = system.lastForces.find((f) => f.label === "sweep");
    if (sweep?.kind !== "impulse") throw new Error("expected a sweep impulse");
    expect(sweep.impulseNs.x).toBeCloseTo(0, 9);
    expect(sweep.impulseNs.y).toBeCloseTo(0, 9);
    expect(sweep.impulseNs.z).toBeCloseTo(RIDER_CONFIG.forces.sweepImpulseNs, 9);
    const tailTip = Transform.toWorldPoint(POSE, BoardSpec.tailTipLocal(SPEC));
    expect(Vec3.equals(sweep.pointWorldM, tailTip, 1e-9)).toBe(true);
    // Tail pushed toward +Z → +yaw around board Y.
    expect(torqueOf(sweep.pointWorldM, sweep.impulseNs).y).toBeGreaterThan(0);
    expect(impulses(body.applied)).toHaveLength(2); // pop + sweep
  });

  it("can start shortly after the pop, once per pop, and the sign follows the stick", () => {
    const { body, step } = setup();
    chargeAndRelease(step, GROUND);
    step(intents({}, { x: -0.9 }), AIR);
    step(intents({}, { x: -1 }), AIR);
    const sweeps = body.applied.filter(
      (a) => a.kind === "impulse" && Math.abs(a.impulseNs.z) > 1e-9,
    );
    expect(sweeps).toHaveLength(1);
    const sweep = sweeps[0];
    if (sweep?.kind !== "impulse") throw new Error("expected an impulse");
    expect(sweep.impulseNs.z).toBeLessThan(0);
  });

  it("no sweep without a pop", () => {
    const { body, step } = setup();
    for (let i = 0; i < 20; i += 1) step(intents({}, { x: 1 }));
    expect(impulses(body.applied)).toHaveLength(0);
  });
});

describe("DefaultRiderSystem — ollie friction", () => {
  it("after a pop, the front foot sliding to the nose drags +X and presses the nose", () => {
    const { system, step } = setup();
    chargeAndRelease(step, GROUND);
    step(intents({ y: 0.5, vy: 6 }), AIR);
    const friction = system.lastForces.find((f) => f.label === "friction");
    if (friction?.kind !== "force") throw new Error("expected a friction force");
    const { gripFrictionCoeff, ollieFootNormalN } = RIDER_CONFIG.forces;
    expect(friction.foot).toBe("front");
    expect(friction.forceN.x).toBeCloseTo(gripFrictionCoeff * ollieFootNormalN, 6);
    expect(friction.forceN.y).toBeCloseTo(-ollieFootNormalN, 6);
    // The normal part levels the board: nose-down pitch (−Z torque).
    expect(torqueOf(friction.pointWorldM, friction.forceN).z).toBeLessThan(0);
  });

  it("no friction without a pop or without a slide", () => {
    const noPop = setup();
    noPop.step(intents({ y: 0.5, vy: 6 }), AIR);
    expect(noPop.system.lastForces.some((f) => f.label === "friction")).toBe(false);

    const noSlide = setup();
    chargeAndRelease(noSlide.step, GROUND);
    noSlide.step(intents({ y: 0.5, vy: 0.5 }), AIR);
    expect(noSlide.system.lastForces.some((f) => f.label === "friction")).toBe(false);
  });
});

describe("DefaultRiderSystem — flick", () => {
  /** Drives the front stick with the real input spring toward `targetX`; returns the flick. */
  function flickToward(targetX: number) {
    const { system, step, events } = setup(AIR);
    const stick = new SpringVirtualStick(INPUT_CONFIG.stick);
    const flicks = [];
    for (let i = 0; i < 40; i += 1) {
      stick.update(StickValue.create(targetX, 0), DT);
      const { x, y } = stick.value;
      step(intents({ x, y, vx: stick.velocityPerS.x }), AIR);
      flicks.push(...system.lastForces.filter((f) => f.label === "flick"));
    }
    return { flicks, events, system };
  }

  function rollOf(stance: Stance, edge: "toe" | "heel"): number {
    const sign = toeSideSign(stance) * (edge === "toe" ? 1 : -1);
    const { flicks } = flickToward(sign);
    expect(flicks).toHaveLength(1);
    const flick = flicks[0];
    if (flick?.kind !== "impulse") throw new Error("expected a flick impulse");
    expect(Math.abs(flick.pointWorldM.z)).toBeCloseTo(SPEC.deck.widthM / 2, 9);
    expect(flick.impulseNs.y).toBeLessThan(0);
    expect(Vec3.length(flick.impulseNs)).toBeCloseTo(RIDER_CONFIG.forces.flickImpulseNs, 9);
    return torqueOf(flick.pointWorldM, flick.impulseNs).x;
  }

  it("a kickflip flick rolls the board one way in regular and the mirrored way in goofy", () => {
    const regularKick = rollOf("regular", "toe");
    const goofyKick = rollOf("goofy", "toe");
    expect(regularKick).toBeGreaterThan(0);
    expect(goofyKick).toBeLessThan(0);
    expect(goofyKick).toBeCloseTo(-regularKick, 9);
    // Calibrated in headless Rapier: one full flip needs ≈ 0.13 N·m·s of roll impulse.
    expect(regularKick).toBeGreaterThan(0.11);
    expect(regularKick).toBeLessThan(0.16);
  });

  it("a heelflip flick rolls opposite to the kickflip in the same stance", () => {
    expect(rollOf("regular", "heel")).toBeLessThan(0);
    expect(rollOf("goofy", "heel")).toBeGreaterThan(0);
  });

  it("the flicking foot leaves the deck", () => {
    const { events, system } = flickToward(1);
    expect(events).toContainEqual(
      expect.objectContaining({ type: "FootDetached", foot: "front", reason: "leftDeck" }),
    );
    expect(system.state.front.contact).toBe("airborne");
  });

  it("a slow slide past the edge is not a flick", () => {
    const { system, step } = setup(AIR);
    let flicks = 0;
    for (let x = 0; x <= 1; x += 0.01) {
      step(intents({ x, vx: 1.2 }), AIR);
      flicks += system.lastForces.filter((f) => f.label === "flick").length;
    }
    expect(flicks).toBe(0);
  });

  it("no flick on the ground without a pop (the foot leans instead)", () => {
    const { system, step } = setup();
    step(intents({ x: 0.5, vx: 10 }));
    step(intents({ x: 1, vx: 10 }));
    expect(system.lastForces.some((f) => f.label === "flick")).toBe(false);
    expect(system.state.front.contact).toBe("attached");
  });
});

describe("DefaultRiderSystem — carve", () => {
  it("both feet leaning to +Z press that side: +roll torque", () => {
    const { system, step } = setup();
    for (let i = 0; i < 20; i += 1) step(intents({ x: 0.6 }, { x: 0.6 }));
    const presses = system.lastForces.filter((f) => f.label === "press");
    expect(presses).toHaveLength(2);
    let roll = 0;
    for (const p of presses) {
      if (p.kind !== "force") continue;
      expect(p.pointWorldM.z).toBeGreaterThan(0);
      roll += torqueOf(p.pointWorldM, p.forceN).x;
    }
    expect(roll).toBeGreaterThan(0);
  });

  it("feet leaning opposite ways do not carve", () => {
    const { system, step } = setup();
    for (let i = 0; i < 20; i += 1) step(intents({ x: 0.6 }, { x: -0.6 }));
    const total = system.lastForces.reduce(
      (n, f) => n + (f.kind === "force" ? Vec3.length(f.forceN) : 0),
      0,
    );
    const standing = 2 * RIDER_CONFIG.forces.standingPressure * RIDER_CONFIG.forces.footPressN;
    expect(total).toBeCloseTo(standing, 6);
  });
});

describe("DefaultRiderSystem — push", () => {
  it("pushes along the board heading only when grounded, with a cooldown", () => {
    const heading = Quat.fromAxisAngle(Vec3.UNIT_Y, Math.PI / 2); // nose → world −Z
    const turned = snapshot({ transform: Transform.create(POSE.positionM, heading) });
    const { body, step } = setup(turned);
    step(intents({}, {}, true), turned);
    step(intents({}, {}, true), turned);
    const pushes = impulses(body.applied);
    expect(pushes).toHaveLength(1);
    const push = pushes[0];
    if (push?.kind !== "impulse") throw new Error("expected an impulse");
    expect(
      Vec3.equals(push.impulseNs, Vec3.create(0, 0, -RIDER_CONFIG.forces.pushImpulseNs), 1e-9),
    ).toBe(true);

    const cooldownSteps = Math.ceil(RIDER_CONFIG.forces.pushCooldownS / DT);
    for (let i = 0; i < cooldownSteps; i += 1) step(intents({}, {}, true), turned);
    expect(impulses(body.applied)).toHaveLength(2);
  });

  it("no push in the air, with feet off neutral, or above the max speed", () => {
    const air = setup(AIR);
    air.step(intents({}, {}, true), AIR);
    expect(impulses(air.body.applied)).toHaveLength(0);

    const leaning = setup();
    leaning.step(intents({ y: 0.8 }, {}, true));
    expect(impulses(leaning.body.applied)).toHaveLength(0);

    const fast = snapshot({ linear: Vec3.create(RIDER_CONFIG.forces.pushMaxSpeedMps + 1, 0, 0) });
    const speeding = setup(fast);
    speeding.step(intents({}, {}, true), fast);
    expect(impulses(speeding.body.applied)).toHaveLength(0);
  });
});

describe("DefaultRiderSystem — catch", () => {
  it("a foot that re-attaches in the air with a neutral stick damps the spin", () => {
    const { system, step, events } = setup(AIR);
    step(intents({ x: 1 }), AIR); // front foot off the edge
    for (let i = 0; i < 10; i += 1) step(intents({ x: 1 }), AIR);
    step(intents(), AIR); // back to neutral → re-attach
    expect(events).toContainEqual(expect.objectContaining({ type: "FootAttached", foot: "front" }));

    const omega = Vec3.create(12, 3, 0);
    const spinning = snapshot({ grounded: false, angular: omega });
    system.applyIntents(intents(), spinning, DT);
    const catches = system.lastForces.filter((f) => f.label === "catch");
    expect(catches.length).toBeGreaterThan(0);
    expect(catches.every((f) => f.foot === "front")).toBe(true);
    let torque = Vec3.ZERO;
    for (const f of catches) {
      if (f.kind === "force") torque = Vec3.add(torque, torqueOf(f.pointWorldM, f.forceN));
    }
    expect(Vec3.dot(torque, omega)).toBeLessThan(0);
    expect(torque.x).toBeLessThan(0); // roll is damped too (two shoe edges)
  });

  it("feet that never left the deck do not add catch damping", () => {
    const { system } = setup(AIR);
    system.applyIntents(
      intents(),
      snapshot({ grounded: false, angular: Vec3.create(10, 0, 0) }),
      DT,
    );
    expect(system.lastForces.some((f) => f.label === "catch")).toBe(false);
  });
});

describe("DefaultRiderSystem — events, bail and reset", () => {
  it("publishes FootDetached / FootAttached with the snapshot's tick", () => {
    const { events, system, bus } = setup(AIR);
    const air7 = { ...AIR, tick: 7, timeS: 7 * DT };
    system.applyIntents(intents({ x: 1 }), air7, DT);
    system.postPhysics(air7, DT);
    bus.flush();
    expect(events).toContainEqual({
      type: "FootDetached",
      tick: 7,
      timeS: 7 * DT,
      foot: "front",
      reason: "leftDeck",
    });
  });

  it("bails after BoardLanded upside down, then applies no forces until reset", () => {
    const { events, system, bus, body, step } = setup();
    bus.publish({
      type: "BoardLanded",
      tick: 3,
      timeS: 3 * DT,
      airtimeS: 0.4,
      velocityMps: Vec3.ZERO,
      upDot: -0.8,
      wheelsDown: 0,
    });
    bus.flush();
    expect(events).toContainEqual({
      type: "RiderBailed",
      tick: 3,
      timeS: 3 * DT,
      reason: "upsideDown",
    });
    expect(system.state.bailed).toBe(true);
    step(intents({}, {}, true));
    expect(system.lastForces).toEqual([]);
    expect(body.applied).toHaveLength(0);

    system.reset(GROUND);
    expect(system.state.bailed).toBe(false);
    step(intents({}, {}, true));
    expect(impulses(body.applied)).toHaveLength(1);
  });

  it("bails when both feet stay detached after landing", () => {
    const { events, step } = setup(AIR);
    step(intents({ x: 1 }, { x: 1 }), AIR);
    const steps = Math.ceil(RIDER_CONFIG.bail.feetDetachedAfterLandingS / DT) + 2;
    for (let i = 0; i < steps; i += 1) step(intents({ x: 1 }, { x: 1 }), GROUND);
    expect(events.filter((e) => e.type === "RiderBailed")).toEqual([
      expect.objectContaining({ reason: "feetDetached" }),
    ]);
  });
});
