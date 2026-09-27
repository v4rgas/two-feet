import { describe, expect, it } from "vitest";
import type { Stance } from "../../../shared";
import type { InputSource, RawInputSample, StanceRepository } from "../domain/input-source";
import { StickValue } from "../domain/stick-value";
import { INPUT_CONFIG } from "../input.config";
import { DefaultInputSystem } from "./default-input-system";

const DT = 1 / 120;

class ScriptedSource implements InputSource {
  current: RawInputSample = {
    left: StickValue.NEUTRAL,
    right: StickValue.NEUTRAL,
    feetDown: false,
    spin: 0,
  };
  sample(): RawInputSample {
    return this.current;
  }
}

class MemoryStanceRepository implements StanceRepository {
  saved: Stance[] = [];
  constructor(private stored: Stance | null = null) {}
  load(): Stance | null {
    return this.stored;
  }
  save(stance: Stance): void {
    this.stored = stance;
    this.saved.push(stance);
  }
}

function settle(system: DefaultInputSystem, steps = 60): void {
  for (let i = 0; i < steps; i += 1) system.step(DT);
}

describe("DefaultInputSystem", () => {
  it("is neutral before the first step", () => {
    const system = new DefaultInputSystem(
      new ScriptedSource(),
      new MemoryStanceRepository(),
      INPUT_CONFIG,
    );
    expect(system.lastIntents.front.stick).toEqual({ x: 0, y: 0 });
    expect(system.lastIntents.back.stick).toEqual({ x: 0, y: 0 });
    expect(system.lastIntents.feetDown).toBe(false);
  });

  it("a diagonal (↓ + →) is each key on its own axis: the stick and the held keys keep ↓ at −1", () => {
    const source = new ScriptedSource();
    const system = new DefaultInputSystem(source, new MemoryStanceRepository(), INPUT_CONFIG);
    source.current = { ...source.current, right: StickValue.create(0, -1) };
    settle(system);
    source.current = { ...source.current, right: StickValue.create(1, -1) };
    for (let i = 0; i < 60; i += 1) {
      system.step(DT);
      const back = system.lastIntents.back;
      expect(back.held).toEqual({ x: 1, y: -1 });
      expect(back.stick.y).toBeLessThan(-0.95);
    }
    expect(system.lastIntents.back.stick.x).toBeGreaterThan(0.95);
    system.reset();
    expect(system.lastIntents.back.held).toEqual({ x: 0, y: 0 });
  });

  it("regular: WASD drives the front foot and arrows the back foot", () => {
    const source = new ScriptedSource();
    const system = new DefaultInputSystem(source, new MemoryStanceRepository(), INPUT_CONFIG);
    source.current = {
      left: StickValue.create(0, 1),
      right: StickValue.create(0, -1),
      feetDown: true,
      spin: 0,
    };
    settle(system);
    const frame = system.lastIntents;
    expect(system.stance).toBe("regular");
    expect(frame.front.foot).toBe("front");
    expect(frame.front.stick.y).toBeCloseTo(1, 2);
    expect(frame.back.stick.y).toBeCloseTo(-1, 2);
    expect(frame.feetDown).toBe(true);
  });

  it("goofy swaps the clusters: arrows drive the front foot", () => {
    const source = new ScriptedSource();
    const system = new DefaultInputSystem(
      source,
      new MemoryStanceRepository("goofy"),
      INPUT_CONFIG,
    );
    source.current = {
      left: StickValue.create(0, 1),
      right: StickValue.create(0, -1),
      feetDown: false,
      spin: 0,
    };
    settle(system);
    expect(system.stance).toBe("goofy");
    expect(system.lastIntents.front.stick.y).toBeCloseTo(-1, 2);
    expect(system.lastIntents.back.stick.y).toBeCloseTo(1, 2);
  });

  it("setStance persists, swaps the mapping and resets the sticks", () => {
    const source = new ScriptedSource();
    const repo = new MemoryStanceRepository();
    const system = new DefaultInputSystem(source, repo, INPUT_CONFIG);
    source.current = {
      left: StickValue.create(1, 0),
      right: StickValue.NEUTRAL,
      feetDown: false,
      spin: 0,
    };
    settle(system);
    expect(system.lastIntents.front.stick.x).toBeCloseTo(1, 2);

    system.setStance("goofy");
    expect(repo.saved).toEqual(["goofy"]);
    expect(system.stance).toBe("goofy");
    expect(system.lastIntents.back.stick).toEqual({ x: 0, y: 0 });

    settle(system);
    expect(system.lastIntents.back.stick.x).toBeCloseTo(1, 2);
    expect(system.lastIntents.front.stick).toEqual({ x: 0, y: 0 });
  });

  it("exposes stick velocity for flick detection", () => {
    const source = new ScriptedSource();
    const system = new DefaultInputSystem(source, new MemoryStanceRepository(), INPUT_CONFIG);
    source.current = {
      left: StickValue.create(1, 0),
      right: StickValue.NEUTRAL,
      feetDown: false,
      spin: 0,
    };
    const frame = system.step(DT);
    expect(frame.front.stickVelocityPerS.x).toBeGreaterThan(0);
    expect(frame.back.stickVelocityPerS).toEqual({ x: 0, y: 0 });
  });

  it("reset returns both feet to neutral", () => {
    const source = new ScriptedSource();
    const system = new DefaultInputSystem(source, new MemoryStanceRepository(), INPUT_CONFIG);
    source.current = {
      left: StickValue.create(1, 1),
      right: StickValue.create(-1, -1),
      feetDown: false,
      spin: 0,
    };
    settle(system, 10);
    system.reset();
    expect(system.lastIntents.front.stick).toEqual({ x: 0, y: 0 });
    expect(system.lastIntents.back.stickVelocityPerS).toEqual({ x: 0, y: 0 });
  });
});
