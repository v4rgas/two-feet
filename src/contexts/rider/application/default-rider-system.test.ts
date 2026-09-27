import { describe, expect, it } from "vitest";
import type { DomainEvent } from "../../../shared";
import { InMemoryEventBus, Quat, Transform, Vec2, Vec3 } from "../../../shared";
import type { BoardSnapshot } from "../../board";
import { BOARD_CONFIG, BoardSpec, FakeRigidBodyHandle, NO_CONTACT } from "../../board";
import type { IntentFrame } from "../../input";
import { StickValue } from "../../input";
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

function snapshot(grounded = true, tick = 0): BoardSnapshot {
  return {
    tick,
    timeS: tick * DT,
    transform: POSE,
    linearVelocityMps: Vec3.ZERO,
    angularVelocityRadps: Vec3.ZERO,
    contacts: grounded ? { ...NO_CONTACT, wheels: ALL_WHEELS } : NO_CONTACT,
    wheelsDown: grounded ? 4 : 0,
    grounded,
    airtimeS: 0,
    contactPoints: [],
  };
}

function intents(
  f: { x?: number; y?: number } = {},
  b: { x?: number; y?: number } = {},
  feetDown = false,
): IntentFrame {
  const foot = (id: "front" | "back", s: { x?: number; y?: number }) => ({
    foot: id,
    stick: StickValue.create(s.x ?? 0, s.y ?? 0),
    stickVelocityPerS: Vec2.ZERO,
  });
  return { front: foot("front", f), back: foot("back", b), feetDown, stance: "regular" };
}

function setup() {
  const body = new FakeRigidBodyHandle();
  body.transform = POSE;
  const bus = new InMemoryEventBus();
  const events: DomainEvent[] = [];
  bus.subscribeAll((e) => events.push(e));
  const system = new DefaultRiderSystem({
    body,
    bus,
    deck: SPEC,
    config: RIDER_CONFIG,
    board: snapshot(),
  });
  let tick = 0;
  const step = (frame: IntentFrame, grounded = true) => {
    const b = snapshot(grounded, tick);
    system.applyIntents(frame, b, DT);
    tick += 1;
    system.postPhysics(snapshot(grounded, tick), DT);
    bus.flush();
  };
  return { body, bus, events, system, step };
}

function popOllie(step: (f: IntentFrame, g?: boolean) => void): void {
  for (let i = 0; i < 12; i += 1) step(intents({ x: 1 }, { y: -1 }));
  step(intents({}, { y: 0 }));
}

describe("DefaultRiderSystem", () => {
  it("applies the standing weight through the port each step", () => {
    const { body, step } = setup();
    step(intents());
    expect(body.applied.filter((a) => a.kind === "force")).toHaveLength(2);
  });

  it("pop: applies the impulses, publishes BoardPopped (tail, back foot) and lifts the feet", () => {
    const { body, events, system, step } = setup();
    popOllie(step);
    expect(body.applied.some((a) => a.kind === "impulse")).toBe(true);
    expect(body.applied.some((a) => a.kind === "torqueImpulse")).toBe(true);
    const popped = events.filter((e) => e.type === "BoardPopped");
    expect(popped).toHaveLength(1);
    expect(popped[0]).toMatchObject({ foot: "back", kick: "tail" });
    expect(events.filter((e) => e.type === "FootDetached")).toHaveLength(2);
    expect(system.state.front.contact).toBe("airborne");
  });

  it("catch in the air reattaches both feet; an upside-down landing bails and stops all forces", () => {
    const { body, bus, events, system, step } = setup();
    popOllie(step);
    step(intents(), false);
    step(intents({}, {}, true), false);
    expect(events.filter((e) => e.type === "FootAttached")).toHaveLength(2);
    expect(system.state.back.contact).toBe("attached");

    bus.publish({
      type: "BoardLanded",
      tick: 99,
      timeS: 1,
      airtimeS: 0.4,
      velocityMps: Vec3.ZERO,
      upDot: -1,
      wheelsDown: 0,
    });
    bus.flush();
    expect(events.some((e) => e.type === "RiderBailed")).toBe(true);
    body.applied.length = 0;
    step(intents({}, {}, true));
    expect(body.applied).toHaveLength(0);
  });

  it("reset puts both feet back and clears the bail", () => {
    const { bus, system } = setup();
    bus.publish({
      type: "BoardLanded",
      tick: 1,
      timeS: 0,
      airtimeS: 0.4,
      velocityMps: Vec3.ZERO,
      upDot: -1,
      wheelsDown: 0,
    });
    bus.flush();
    expect(system.state.bailed).toBe(true);
    system.reset(snapshot());
    expect(system.state.bailed).toBe(false);
    expect(system.state.front.contact).toBe("attached");
  });
});
