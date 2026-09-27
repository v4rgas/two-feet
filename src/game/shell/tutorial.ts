import type { DomainEvent } from "../../shared";

/*
 * THE TUTORIAL as a pure state machine (GAME.md "Tutorial"): push → ollie → kickflip → the
 * outro card → done. Each step moves on only on the real event from the simulation (the
 * board's speed, a `TrickLanded` with the step's name), never on a timer. A failed attempt
 * (a bail, or a wrong trick landed) keeps the step and shows its hint line.
 */

export type TutorialStep = "push" | "ollie" | "kickflip" | "outro" | "done";

export const TUTORIAL_STEPS: readonly TutorialStep[] = ["push", "ollie", "kickflip"];

export interface TutorialState {
  readonly step: TutorialStep;
  /** Failed attempts at the current step (the hint shows from the first). */
  readonly failures: number;
  /** Time spent on the outro card, s. */
  readonly outroS: number;
}

export interface TutorialConfig {
  readonly pushDoneSpeedMps: number;
  readonly outroS: number;
}

export const TUTORIAL_START: TutorialState = { step: "push", failures: 0, outroS: 0 };

/** The trick name that completes a step. */
const STEP_TRICK: Partial<Record<TutorialStep, string>> = { ollie: "Ollie", kickflip: "Kickflip" };

function next(step: TutorialStep): TutorialStep {
  switch (step) {
    case "push":
      return "ollie";
    case "ollie":
      return "kickflip";
    case "kickflip":
      return "outro";
    default:
      return "done";
  }
}

function advance(state: TutorialState): TutorialState {
  return { step: next(state.step), failures: 0, outroS: 0 };
}

function fail(state: TutorialState): TutorialState {
  return { ...state, failures: state.failures + 1 };
}

/** A domain event from the simulation. */
export function tutorialOnEvent(state: TutorialState, event: DomainEvent): TutorialState {
  if (state.step === "outro" || state.step === "done") return state;
  switch (event.type) {
    case "TrickLanded": {
      const want = STEP_TRICK[state.step];
      if (want === undefined) return state; // push: tricks are fine, speed decides
      return event.name === want ? advance(state) : fail(state);
    }
    case "TrickBailed":
    case "RiderBailed":
      return fail(state);
    default:
      return state;
  }
}

/** The board's speed after a frame, and the time that passed. */
export function tutorialOnFrame(
  state: TutorialState,
  speedMps: number,
  dtS: number,
  config: TutorialConfig,
): TutorialState {
  if (state.step === "push" && speedMps >= config.pushDoneSpeedMps) return advance(state);
  if (state.step === "outro") {
    const outroS = state.outroS + dtS;
    return outroS >= config.outroS ? advance(state) : { ...state, outroS };
  }
  return state;
}

/** Whether the step's hint line shows (after its first failed attempt). */
export function tutorialHintVisible(state: TutorialState): boolean {
  return state.failures > 0;
}
