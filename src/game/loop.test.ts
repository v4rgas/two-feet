import { describe, expect, it } from "vitest";
import type { BoardSnapshot } from "../contexts/board";
import type { IntentFrame } from "../contexts/input";
import { InMemoryEventBus, ManualClock, Transform, Vec3 } from "../shared";
import { GAME_CONFIG } from "./game.config";
import { GameLoop } from "./loop";
import {
  StubBoardSystem,
  StubInputSystem,
  StubPhysicsWorld,
  StubRiderSystem,
  StubTricksSystem,
} from "./stubs";

function createLoop(calls: string[], moving: (timeS: number) => boolean = () => false) {
  const bus = new InMemoryEventBus();
  const spawn = Transform.IDENTITY;
  const board = new (class extends StubBoardSystem {
    override prePhysics(): void {
      calls.push("board.prePhysics");
    }
    override postPhysics(tick: number, timeS: number): BoardSnapshot {
      calls.push("board.postPhysics");
      if (tick === 1) {
        bus.publish({ type: "RiderBailed", tick, timeS, reason: "upsideDown" });
      }
      const snapshot = super.postPhysics(tick, timeS);
      if (!moving(timeS)) return snapshot;
      // The ragdoll board still tumbling.
      this.snapshot = { ...snapshot, linearVelocityMps: Vec3.create(1, 0, 0) };
      return this.snapshot;
    }
    override reset(transform: Transform): void {
      calls.push("board.reset");
      super.reset(transform);
    }
  })(spawn);
  const input = new (class extends StubInputSystem {
    override step(): IntentFrame {
      calls.push("input.step");
      return super.step();
    }
  })();
  const rider = new (class extends StubRiderSystem {
    override applyIntents(): void {
      calls.push("rider.applyIntents");
    }
    override postPhysics(): void {
      calls.push("rider.postPhysics");
    }
  })(board.snapshot);
  const physics = new (class extends StubPhysicsWorld {
    override step(): void {
      calls.push("physics.step");
    }
  })();
  const tricks = new (class extends StubTricksSystem {
    override update(): void {
      calls.push("tricks.update");
    }
  })();
  const originalFlush = bus.flush.bind(bus);
  bus.flush = () => {
    calls.push("bus.flush");
    originalFlush();
  };
  const loop = new GameLoop(
    { input, rider, board, physics, tricks, bus, clock: new ManualClock(), spawn },
    GAME_CONFIG,
  );
  return { loop, board };
}

describe("GameLoop", () => {
  it("runs one fixed step in the exact order of REQUIREMENTS §2.4", () => {
    const calls: string[] = [];
    const { loop } = createLoop(calls);
    loop.step();
    expect(calls).toEqual([
      "input.step",
      "rider.applyIntents",
      "board.prePhysics",
      "physics.step",
      "board.postPhysics",
      "rider.postPhysics",
      "tricks.update",
      "bus.flush",
    ]);
  });

  it("advances in fixed steps and exposes interpolation + events in the frame", () => {
    const calls: string[] = [];
    const { loop } = createLoop(calls);
    expect(loop.advance(GAME_CONFIG.loop.fixedStepS * 2.5)).toBe(2);
    const frame = loop.buildFrame();
    expect(frame.alpha).toBeCloseTo(0.5);
    expect(frame.currentBoard.tick).toBe(2);
    expect(frame.previousBoard.tick).toBe(1);
    expect(frame.recentEvents.map((e) => e.type)).toEqual(["RiderBailed"]);
    expect(loop.buildFrame().recentEvents).toEqual([]);
  });

  it("resets the run after a bail, once the delay has passed", () => {
    const calls: string[] = [];
    const { loop, board } = createLoop(calls);
    const stepsToReset = Math.ceil(GAME_CONFIG.bailResetDelayS / GAME_CONFIG.loop.fixedStepS) + 1;
    for (let i = 0; i < stepsToReset; i += 1) loop.step();
    expect(calls.filter((c) => c === "board.reset")).toHaveLength(1);
    expect(Vec3.equals(board.snapshot.transform.positionM, Vec3.ZERO)).toBe(true);
  });

  it("a tumbling board resets once it comes to rest (after the delay), at the latest after the cap", () => {
    const stepS = GAME_CONFIG.loop.fixedStepS;
    const resetsAt = (moving: (timeS: number) => boolean): number => {
      const calls: string[] = [];
      const { loop } = createLoop(calls, moving);
      for (let i = 1; i < 1000; i += 1) {
        loop.step();
        if (calls.includes("board.reset")) return i * stepS;
      }
      return Number.POSITIVE_INFINITY;
    };
    const bailS = stepS;
    // Rests at 2.2 s: the reset waits for it.
    expect(resetsAt((t) => t < 2.2) - bailS).toBeCloseTo(2.2 - bailS, 1);
    // Never rests: the cap.
    expect(resetsAt(() => true) - bailS).toBeCloseTo(GAME_CONFIG.bailResetMaxS, 1);
    // Rests at once: the delay.
    expect(resetsAt(() => false) - bailS).toBeCloseTo(GAME_CONFIG.bailResetDelayS, 1);
  });
});
