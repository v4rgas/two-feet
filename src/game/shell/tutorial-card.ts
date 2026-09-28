import type { Stance } from "../../contexts/input";
import type { TutorialCardView } from "../../presentation/tutorial/tutorial-card-view-model";
import { cap, footCap, heelDirection, olliePartsFor, text } from "./key-labels";
import type { TutorialState } from "./tutorial";
import { TUTORIAL_STEPS, tutorialHintVisible } from "./tutorial";

/** The words of the outro card (GAME.md "Tutorial") and its credit. */
export const TUTORIAL_OUTRO = {
  title: "Nice. Welcome to the Street Course.",
  footnote: "two feet, a game by v4rgas",
} as const;

/** The prompt card for a tutorial state, keys and hints in the current stance. */
export function tutorialCard(state: TutorialState, stance: Stance): TutorialCardView | null {
  const progress = `${TUTORIAL_STEPS.indexOf(state.step) + 1} / ${TUTORIAL_STEPS.length}`;
  const hint = (line: string) => (tutorialHintVisible(state) ? line : null);
  const popKey = footCap(stance, "back", "down");
  const setKey = footCap(stance, "front", "down");
  const flickKey = footCap(stance, "front", heelDirection(stance));
  switch (state.step) {
    case "push":
      return {
        progress,
        title: "Push",
        keys: [text("tap"), cap("Space"), text("a few times")],
        hint: hint("Tap Space again and again, with the other keys let go"),
        footnote: null,
      };
    case "ollie":
      return {
        progress,
        title: "Ollie",
        keys: [...olliePartsFor(stance), text("·"), cap("Space"), text("in the air to catch")],
        hint: hint(`Let go of ${popKey} to pop. Keep holding ${setKey}.`),
        footnote: null,
      };
    case "kickflip":
      return {
        progress,
        title: "Kickflip",
        keys: [
          text("push, pop, tap"),
          cap(flickKey),
          text("in the air, then"),
          cap("Space"),
          text("to catch"),
        ],
        hint: hint(`Pop first, then tap ${flickKey} in the air. Space as it comes round.`),
        footnote: null,
      };
    case "outro":
      return {
        progress: "",
        title: TUTORIAL_OUTRO.title,
        keys: [],
        hint: null,
        footnote: TUTORIAL_OUTRO.footnote,
      };
    case "done":
      return null;
  }
}
