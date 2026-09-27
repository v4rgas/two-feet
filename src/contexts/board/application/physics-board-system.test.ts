import { describe, expect, it } from "vitest";
import type { BoardPartId, DomainEvent } from "../../../shared";
import { InMemoryEventBus, Quat, Transform, Vec3 } from "../../../shared";
import { BOARD_CONFIG } from "../board.config";
import { BoardSpec } from "../domain/board-spec";
import { FakeRigidBodyHandle } from "../domain/fake-rigid-body";
import type { BoardBody, BoardContact } from "../domain/physics-world";
import { PhysicsBoardSystem } from "./physics-board-system";

const DT = 1 / 120;
const spec = BoardSpec.create(BOARD_CONFIG.spec);
const ALL_WHEELS: BoardPartId[] = [
  "noseLeftWheel",
  "noseRightWheel",
  "tailLeftWheel",
  "tailRightWheel",
];

/** Fake `BoardBody`: the test sets the contacts the "physics" reports. */
class FakeBoardBody implements BoardBody {
  readonly body = new FakeRigidBodyHandle();
  current: BoardContact[] = [];
  contacts(): readonly BoardContact[] {
    return this.current;
  }
}

function contact(part: BoardPartId, loadN = 5, obstacleId = "ground"): BoardContact {
  return {
    part,
    surface: "ground",
    obstacleId,
    pointWorldM: Vec3.ZERO,
    normalWorld: Vec3.UNIT_Y,
    normalImpulseNs: loadN * DT,
  };
}

function setup() {
  const board = new FakeBoardBody();
  const bus = new InMemoryEventBus();
  const events: DomainEvent[] = [];
  bus.subscribeAll((e) => events.push(e));
  const system = new PhysicsBoardSystem(board, spec, BOARD_CONFIG, bus);
  let tick = 0;
  const step = (contacts: BoardContact[]) => {
    system.prePhysics(DT);
    board.current = contacts;
    tick += 1;
    const snapshot = system.postPhysics(tick, tick * DT);
    bus.flush();
    return snapshot;
  };
  return { board, system, events, step };
}

describe("PhysicsBoardSystem", () => {
  it("builds the snapshot from contacts and body state", () => {
    const { board, step } = setup();
    board.body.linearVelocityMps = Vec3.create(2, 0, 0);
    const s = step([...ALL_WHEELS.map((w) => contact(w)), contact("tail")]);
    expect(s.tick).toBe(1);
    expect(s.wheelsDown).toBe(4);
    expect(s.grounded).toBe(true);
    expect(s.contacts.tail).toBe(true);
    expect(s.contacts.nose).toBe(false);
    expect(s.contacts.wheels.noseLeftWheel).toBe(true);
    expect(s.airtimeS).toBe(0);
    expect(s.linearVelocityMps.x).toBe(2);
    expect(s.contactPoints).toHaveLength(5);
  });

  it("does not publish events for the first (baseline) step", () => {
    const { events, step } = setup();
    step(ALL_WHEELS.map((w) => contact(w)));
    expect(events).toEqual([]);
  });

  it("publishes BoardLeftGround, counts airtime, then BoardLanded", () => {
    const { board, events, step } = setup();
    const grounded = ALL_WHEELS.map((w) => contact(w));
    step(grounded);
    board.body.linearVelocityMps = Vec3.create(1, 2, 0);
    const air1 = step([]);
    expect(air1.grounded).toBe(false);
    expect(air1.airtimeS).toBe(0);
    for (let i = 0; i < 9; i += 1) step([]);
    expect(events.filter((e) => e.type === "BoardLeftGround")).toHaveLength(1);
    const lastAir = step([]);
    expect(lastAir.airtimeS).toBeCloseTo(10 * DT);

    board.body.transform = Transform.create(Vec3.ZERO, Quat.fromAxisAngle(Vec3.UNIT_X, 0.3));
    const landedSnap = step([contact("tailLeftWheel"), contact("tailRightWheel")]);
    expect(landedSnap.grounded).toBe(true);
    expect(landedSnap.airtimeS).toBe(0);
    const landed = events.find((e) => e.type === "BoardLanded");
    expect(landed).toMatchObject({ type: "BoardLanded", wheelsDown: 2, tick: 13 });
    if (landed?.type !== "BoardLanded") throw new Error("expected BoardLanded");
    expect(landed.airtimeS).toBeCloseTo(11 * DT);
    expect(landed.upDot).toBeCloseTo(Math.cos(0.3));
    const left = events.find((e) => e.type === "BoardLeftGround");
    expect(left).toMatchObject({ tick: 2, velocityMps: { x: 1, y: 2, z: 0 } });
  });

  it("publishes SurfaceContactStarted/Ended once per part and obstacle", () => {
    const { events, step } = setup();
    step([contact("noseLeftWheel")]);
    step([contact("noseLeftWheel"), contact("tail"), contact("tail")]);
    step([contact("noseLeftWheel"), contact("tail"), contact("tail", 5, "rail")]);
    step([contact("noseLeftWheel")]);
    const surfaceEvents = events
      .filter((e) => e.type === "SurfaceContactStarted" || e.type === "SurfaceContactEnded")
      .map((e) => `${e.type}:${e.part}:${e.obstacleId}`);
    expect(surfaceEvents).toEqual([
      "SurfaceContactStarted:tail:ground",
      "SurfaceContactStarted:tail:rail",
      "SurfaceContactEnded:tail:ground",
      "SurfaceContactEnded:tail:rail",
    ]);
  });

  it("applies grip against sideways wheel slip and exposes the forces", () => {
    const { board, system, step } = setup();
    step(ALL_WHEELS.map((w) => contact(w)));
    board.body.linearVelocityMps = Vec3.create(3, 0, 0.5);
    system.prePhysics(DT);
    const grip = system.lastForces.filter((f) => f.label === "grip");
    expect(grip).toHaveLength(4);
    for (const f of grip) expect(f.forceN.z).toBeLessThan(0);
    const rolling = system.lastForces.filter((f) => f.label === "rolling");
    for (const f of rolling) expect(f.forceN.x).toBeLessThan(0);
    const forces = board.body.applied.filter((a) => a.kind === "force");
    expect(forces).toHaveLength(system.lastForces.length);
  });

  it("leans and steers toward the loaded side", () => {
    const { system, step } = setup();
    const leaning = [
      contact("noseRightWheel", 150),
      contact("tailRightWheel", 150),
      contact("noseLeftWheel", 50),
      contact("tailLeftWheel", 50),
    ];
    for (let i = 0; i < 60; i += 1) step(leaning);
    expect(system.leanRad).toBeCloseTo(spec.trucks.maxLeanRad, 3);
    expect(system.steerRad).toBeCloseTo(spec.trucks.maxLeanRad * spec.trucks.steerPerLean, 3);
    for (let i = 0; i < 120; i += 1) step([]);
    expect(Math.abs(system.leanRad)).toBeLessThan(1e-3);
  });

  it("applies no board forces while airborne", () => {
    const { board, system, step } = setup();
    step([]);
    system.prePhysics(DT);
    expect(system.lastForces).toEqual([]);
    expect(board.body.applied).toEqual([]);
  });

  it("reset teleports the body and forgets contact history", () => {
    const { board, system, events, step } = setup();
    step(ALL_WHEELS.map((w) => contact(w)));
    step([]);
    events.length = 0;
    const spawn = Transform.create(Vec3.create(0, 1, 0), Quat.IDENTITY);
    system.reset(spawn);
    expect(board.body.transform).toBe(spawn);
    expect(system.snapshot.transform).toBe(spawn);
    expect(system.snapshot.tick).toBe(0);
    expect(system.leanRad).toBe(0);
    step(ALL_WHEELS.map((w) => contact(w)));
    expect(events).toEqual([]); // baseline again: no BoardLanded after a reset
  });
});
