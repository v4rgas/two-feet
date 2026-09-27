import { describe, expect, it } from "vitest";
import type { KeyPress } from "../domain/key-script";
import { keyEventsFromPresses } from "../domain/key-script";
import { INPUT_CONFIG } from "../input.config";
import { ScriptedInputSource } from "./scripted-input-source";

const STEP = 1 / 120;

function source(presses: readonly KeyPress[]): ScriptedInputSource {
  return new ScriptedInputSource(keyEventsFromPresses(presses), INPUT_CONFIG.keys, STEP);
}

describe("keyEventsFromPresses", () => {
  it("expands presses into sorted down / up events, stable for equal times", () => {
    const events = keyEventsFromPresses([
      { code: "KeyS", atS: 0.02, holdS: 0.2 },
      { code: "ArrowDown", atS: 0, holdS: 0.22 },
      { code: "KeyW", atS: 0.22, holdS: 0 },
    ]);
    expect(events.map((e) => `${e.type}:${e.code}@${e.atS.toFixed(2)}`)).toEqual([
      "keydown:ArrowDown@0.00",
      "keydown:KeyS@0.02",
      "keyup:KeyS@0.22",
      "keyup:ArrowDown@0.22",
      "keydown:KeyW@0.22",
      "keyup:KeyW@0.22",
    ]);
  });

  it("rejects negative times and holds", () => {
    expect(() => keyEventsFromPresses([{ code: "KeyW", atS: -1, holdS: 0.1 }])).toThrow();
    expect(() => keyEventsFromPresses([{ code: "KeyW", atS: 0, holdS: -0.1 }])).toThrow();
  });
});

describe("ScriptedInputSource", () => {
  it("delivers each event before the first fixed step that ends after it", () => {
    // Down at 0.02 s: steps start at 0, 0.0083, 0.0167, 0.025 … The step [0.0167, 0.025)
    // contains 0.02, so it samples the key held. Up at 0.07 s: the step [0.0667, 0.075).
    const s = source([{ code: "KeyW", atS: 0.02, holdS: 0.05 }]);
    const ys = Array.from({ length: 11 }, () => s.sample().left.y);
    expect(ys).toEqual([0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0]);
  });

  it("maps codes like the keyboard: clusters, Space, Q / E, most recent wins", () => {
    const s = source([
      { code: "ArrowLeft", atS: 0, holdS: 1 },
      { code: "ArrowRight", atS: 0.1, holdS: 1 },
      { code: "Space", atS: 0, holdS: 1 },
      { code: "KeyE", atS: 0, holdS: 1 },
    ]);
    expect(s.sample()).toEqual({
      left: { x: 0, y: 0 },
      right: { x: -1, y: 0 },
      feetDown: true,
      spin: 1,
    });
    for (let i = 0; i < 12; i += 1) s.sample();
    expect(s.sample().right.x).toBe(1);
  });

  it("is deterministic and restartable", () => {
    const presses = [
      { code: "ArrowDown", atS: 0, holdS: 0.2 },
      { code: "KeyS", atS: 0.02, holdS: 0.25 },
      { code: "KeyA", atS: 0.25, holdS: 0.1 },
    ];
    const a = source(presses);
    const b = source(presses);
    const run = (s: ScriptedInputSource) => Array.from({ length: 60 }, () => s.sample());
    const first = run(a);
    expect(run(b)).toEqual(first);
    expect(a.finished).toBe(true);
    a.restart();
    expect(a.timeS).toBe(0);
    expect(run(a)).toEqual(first);
  });
});
