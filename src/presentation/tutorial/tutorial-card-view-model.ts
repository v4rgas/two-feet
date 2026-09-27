import type { KeyPart } from "../ui/key-parts";

/** READ MODEL of the tutorial's prompt card (GAME.md "Tutorial"), built by the game. */
export interface TutorialCardView {
  /** "1 / 3", or empty on the outro card. */
  readonly progress: string;
  readonly title: string;
  /** The keys of the step, in the current stance. */
  readonly keys: readonly KeyPart[];
  /** Shown after the step's first failed attempt, else null. */
  readonly hint: string | null;
  /** A quiet line under the card (the outro's credit), or null. */
  readonly footnote: string | null;
}
