import { describe, expect, it } from "vitest";
import { Vec3 } from "../math/vec3";
import type { DomainEvent } from "./domain-event";
import { InMemoryEventBus } from "./event-bus";

const popped: DomainEvent = {
  type: "BoardPopped",
  tick: 1,
  timeS: 1 / 120,
  foot: "back",
  kick: "tail",
  impulseNs: 3,
  pointWorldM: Vec3.ZERO,
};

const leftGround: DomainEvent = {
  type: "BoardLeftGround",
  tick: 2,
  timeS: 2 / 120,
  velocityMps: Vec3.UNIT_Y,
};

describe("InMemoryEventBus", () => {
  it("queues on publish and delivers only on flush", () => {
    const bus = new InMemoryEventBus();
    const seen: string[] = [];
    bus.subscribe("BoardPopped", (e) => seen.push(`${e.type}:${e.foot}`));
    bus.publish(popped);
    expect(seen).toEqual([]);
    bus.flush();
    expect(seen).toEqual(["BoardPopped:back"]);
  });

  it("delivers by type and to catch-all subscribers in FIFO order", () => {
    const bus = new InMemoryEventBus();
    const typed: string[] = [];
    const all: string[] = [];
    bus.subscribe("BoardLeftGround", (e) => typed.push(e.type));
    bus.subscribeAll((e) => all.push(e.type));
    bus.publish(popped);
    bus.publish(leftGround);
    bus.flush();
    expect(typed).toEqual(["BoardLeftGround"]);
    expect(all).toEqual(["BoardPopped", "BoardLeftGround"]);
  });

  it("delivers events published during a flush in the same flush", () => {
    const bus = new InMemoryEventBus();
    const all: string[] = [];
    bus.subscribe("BoardPopped", () => bus.publish(leftGround));
    bus.subscribeAll((e) => all.push(e.type));
    bus.publish(popped);
    bus.flush();
    expect(all).toEqual(["BoardPopped", "BoardLeftGround"]);
  });

  it("unsubscribes", () => {
    const bus = new InMemoryEventBus();
    let count = 0;
    const off = bus.subscribe("BoardPopped", () => {
      count += 1;
    });
    off();
    bus.publish(popped);
    bus.flush();
    expect(count).toBe(0);
  });

  it("guards against infinite publish loops", () => {
    const bus = new InMemoryEventBus();
    bus.subscribe("BoardPopped", () => bus.publish(popped));
    bus.publish(popped);
    expect(() => bus.flush()).toThrow(/exceeded/);
  });
});
