import type { KeyPart } from "../ui/key-parts";

/** One row of the Esc menu. */
export interface MenuItemView {
  readonly label: string;
  /** A second, quieter line (a map's description) or a value ("goofy"). */
  readonly detail?: string;
  readonly selected: boolean;
  readonly disabled: boolean;
  /** Marks the current map in the map list. */
  readonly current?: boolean;
}

/** One line of the controls reference. */
export interface ControlRowView {
  readonly label: string;
  readonly keys: readonly KeyPart[];
}

/**
 * READ MODEL of the Esc menu (GAME.md "Menu"), built by the game's menu model. The view
 * never changes it: clicks and hovers go back to the game as `MenuIntent`s.
 */
export interface MenuViewModel {
  readonly open: boolean;
  readonly title: string;
  readonly items: readonly MenuItemView[];
  /** The controls reference (only on the controls screen). */
  readonly controls?: readonly ControlRowView[];
}

/** What the player did with the mouse, for the game to handle. */
export type MenuIntent =
  | { readonly type: "hover"; readonly index: number }
  | { readonly type: "activate"; readonly index: number };
