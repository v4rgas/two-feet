import { describe, expect, it } from "vitest";
import type { DomainEvent } from "../../shared";
import type { TutorialState } from "./tutorial";
import { TUTORIAL_START, tutorialHintVisible, tutorialOnEvent, tutorialOnFrame } from "./tutorial";

const CONFIG = { pushDoneSpeedMps: 3, outroS: 2 };
const landed = (name: string): DomainEvent =>
  ({ type: "TrickLanded", tick: 1, timeS: 0, name }) as unknown as DomainEvent;
const bailed = { type: "RiderBailed", tick: 1, timeS: 0, reason: "upsideDown" } as DomainEvent;

function ride(state: TutorialState, speed: number, dt = 0.1): TutorialState {
  return tutorialOnFrame(state, speed, dt, CONFIG);
}

describe("tutorial state machine", () => {
  it("push: advances only at 3 m/s of board speed, never on time", () => {
    let s = TUTORIAL_START;
    for (let i = 0; i < 100; i += 1) s = ride(s, 2.9);
    expect(s.step).toBe("push");
    s = ride(s, 3);
    expect(s.step).toBe("ollie");
  });

  it("ollie: only a landed Ollie advances; a bail or another trick is a failure and shows the hint", () => {
    let s: TutorialState = { step: "ollie", failures: 0, outroS: 0 };
    s = ride(s, 10);
    expect(s.step).toBe("ollie");
    expect(tutorialHintVisible(s)).toBe(false);
    s = tutorialOnEvent(s, bailed);
    expect(s.step).toBe("ollie");
    expect(tutorialHintVisible(s)).toBe(true);
    s = tutorialOnEvent(s, landed("Kickflip"));
    expect(s.failures).toBe(2);
    s = tutorialOnEvent(s, landed("Ollie"));
    expect(s).toEqual({ step: "kickflip", failures: 0, outroS: 0 });
    expect(tutorialHintVisible(s)).toBe(false);
  });

  it("kickflip: an Ollie is a wrong trick; a Kickflip moves to the outro, which ends after 2 s", () => {
    let s: TutorialState = { step: "kickflip", failures: 0, outroS: 0 };
    s = tutorialOnEvent(s, landed("Ollie"));
    expect(tutorialHintVisible(s)).toBe(true);
    s = tutorialOnEvent(s, landed("Kickflip"));
    expect(s.step).toBe("outro");
    s = tutorialOnEvent(s, bailed); // events no longer matter
    expect(s.step).toBe("outro");
    for (let i = 0; i < 19; i += 1) s = ride(s, 0);
    expect(s.step).toBe("outro");
    s = ride(s, 0, 0.11);
    expect(s.step).toBe("done");
  });

  it("push ignores tricks (speed decides) but counts bails", () => {
    let s = tutorialOnEvent(TUTORIAL_START, landed("Ollie"));
    expect(s).toEqual(TUTORIAL_START);
    s = tutorialOnEvent(s, bailed);
    expect(s.step).toBe("push");
    expect(tutorialHintVisible(s)).toBe(true);
  });
});
