import { describe, expect, it } from "vitest";
import { INPUT_CONFIG } from "../input.config";
import { KeyboardInputSource } from "./keyboard-input-source";

function key(type: "keydown" | "keyup", code: string): Event {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, "code", { value: code });
  return event;
}

function setup() {
  const target = new EventTarget();
  const source = new KeyboardInputSource(target, INPUT_CONFIG.keys);
  const press = (code: string) => {
    const e = key("keydown", code);
    target.dispatchEvent(e);
    return e;
  };
  const release = (code: string) => {
    const e = key("keyup", code);
    target.dispatchEvent(e);
    return e;
  };
  return { target, source, press, release };
}

describe("KeyboardInputSource", () => {
  it("maps WASD to the left cluster and arrows to the right cluster", () => {
    const { source, press } = setup();
    press("KeyW");
    press("KeyD");
    press("ArrowDown");
    press("ArrowLeft");
    expect(source.sample()).toEqual({
      left: { x: 1, y: 1 },
      right: { x: -1, y: -1 },
      feetDown: false,
      spin: 0,
    });
  });

  it("releases on keyup and reports feetDown while Space is held", () => {
    const { source, press, release } = setup();
    press("KeyS");
    press("Space");
    expect(source.sample().left).toEqual({ x: 0, y: -1 });
    expect(source.sample().feetDown).toBe(true);
    release("KeyS");
    release("Space");
    expect(source.sample()).toEqual({
      left: { x: 0, y: 0 },
      right: { x: 0, y: 0 },
      feetDown: false,
      spin: 0,
    });
  });

  it("Q / E are the body spin axis (−1 / +1), the most recent press wins", () => {
    const { source, press, release } = setup();
    expect(source.sample().spin).toBe(0);
    press("KeyQ");
    expect(source.sample().spin).toBe(-1);
    press("KeyE");
    expect(source.sample().spin).toBe(1);
    release("KeyE");
    expect(source.sample().spin).toBe(-1);
    release("KeyQ");
    expect(source.sample().spin).toBe(0);
  });

  it("opposite keys: the most recent press wins", () => {
    const { source, press, release } = setup();
    press("KeyA");
    press("KeyD");
    expect(source.sample().left.x).toBe(1);
    release("KeyD");
    expect(source.sample().left.x).toBe(-1);
  });

  it("blur releases every key", () => {
    const { target, source, press } = setup();
    press("KeyW");
    press("ArrowUp");
    press("Space");
    target.dispatchEvent(new Event("blur"));
    expect(source.sample()).toEqual({
      left: { x: 0, y: 0 },
      right: { x: 0, y: 0 },
      feetDown: false,
      spin: 0,
    });
  });

  it("prevents the default action of arrows and Space only", () => {
    const { press } = setup();
    expect(press("ArrowUp").defaultPrevented).toBe(true);
    expect(press("Space").defaultPrevented).toBe(true);
    expect(press("KeyW").defaultPrevented).toBe(false);
    expect(press("KeyQ").defaultPrevented).toBe(false);
  });

  it("stops listening after dispose", () => {
    const { source, press } = setup();
    source.dispose();
    press("KeyW");
    expect(source.sample().left).toEqual({ x: 0, y: 0 });
  });
});
