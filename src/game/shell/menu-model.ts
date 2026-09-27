import type { Stance } from "../../contexts/input";
import type { MenuItemView, MenuViewModel } from "../../presentation/menu/menu-view-model";
import { controlRows } from "./key-labels";

/*
 * THE ESC MENU as a pure state machine (GAME.md "Menu"): which screen is open and which
 * row is selected, driven by keys (↑ ↓ Enter Esc) and the mouse (hover, click). It never
 * acts: it returns a `MenuAction` for the game shell to carry out.
 */

export type MenuScreen = "main" | "maps" | "controls";

export interface MenuState {
  readonly open: boolean;
  readonly screen: MenuScreen;
  readonly index: number;
}

/** What the menu needs to know about the game to list its rows. */
export interface MenuContext {
  readonly maps: readonly {
    readonly id: string;
    readonly name: string;
    readonly description: string;
  }[];
  readonly currentMapId: string | null;
  readonly stance: Stance;
  readonly tutorialRunning: boolean;
  readonly hasCheckpoint: boolean;
  /** An opening cinematic exists (GAME.md "Intro"): the menu lists "Intro" to replay it. */
  readonly hasIntro?: boolean;
}

/** What the game shell should do. */
export type MenuAction =
  | { readonly type: "resume" }
  | { readonly type: "loadMap"; readonly id: string }
  | { readonly type: "restart" }
  | { readonly type: "clearCheckpoint" }
  | { readonly type: "setStance"; readonly stance: Stance }
  | { readonly type: "startTutorial" }
  | { readonly type: "skipTutorial" }
  | { readonly type: "playIntro" };

export type MenuInput =
  | { readonly type: "toggle" }
  | { readonly type: "up" }
  | { readonly type: "down" }
  | { readonly type: "enter" }
  | { readonly type: "back" }
  | { readonly type: "hover"; readonly index: number }
  | { readonly type: "activate"; readonly index: number };

interface Row {
  readonly view: Omit<MenuItemView, "selected">;
  readonly run: () => { state?: MenuState; action?: MenuAction };
}

export const CLOSED_MENU: MenuState = { open: false, screen: "main", index: 0 };
const MAIN: MenuState = { open: true, screen: "main", index: 0 };

function rows(state: MenuState, ctx: MenuContext): Row[] {
  const back: Row = {
    view: { label: "Back", disabled: false },
    run: () => ({ state: MAIN }),
  };
  switch (state.screen) {
    case "maps":
      return [
        ...ctx.maps.map(
          (m): Row => ({
            view: {
              label: m.name,
              detail: m.description,
              disabled: false,
              current: m.id === ctx.currentMapId,
            },
            run: () => ({ state: CLOSED_MENU, action: { type: "loadMap", id: m.id } }),
          }),
        ),
        back,
      ];
    case "controls":
      return [back];
    case "main":
      return [
        {
          view: { label: "Resume", disabled: false },
          run: () => ({ state: CLOSED_MENU, action: { type: "resume" } }),
        },
        {
          view: { label: "Maps", disabled: false },
          run: () => ({ state: { open: true, screen: "maps", index: 0 } }),
        },
        {
          view: { label: "Restart", detail: "R", disabled: false },
          run: () => ({ state: CLOSED_MENU, action: { type: "restart" } }),
        },
        {
          view: { label: "Clear checkpoint", disabled: !ctx.hasCheckpoint },
          run: () => ({ action: { type: "clearCheckpoint" } }),
        },
        {
          view: { label: "Stance", detail: ctx.stance, disabled: false },
          run: () => ({
            action: { type: "setStance", stance: ctx.stance === "regular" ? "goofy" : "regular" },
          }),
        },
        ctx.tutorialRunning
          ? {
              view: { label: "Skip tutorial", disabled: false },
              run: () => ({ state: CLOSED_MENU, action: { type: "skipTutorial" } }),
            }
          : {
              view: { label: "Tutorial", disabled: false },
              run: () => ({ state: CLOSED_MENU, action: { type: "startTutorial" } }),
            },
        ...(ctx.hasIntro === true
          ? [
              {
                view: { label: "Intro", disabled: false },
                run: () => ({ state: CLOSED_MENU, action: { type: "playIntro" } as const }),
              },
            ]
          : []),
        {
          view: { label: "Controls", disabled: false },
          run: () => ({ state: { open: true, screen: "controls", index: 0 } }),
        },
      ];
  }
}

/** Index of the main screen's row with this label (0 if absent). */
function rowIndex(ctx: MenuContext, label: string): number {
  return Math.max(
    0,
    rows(MAIN, ctx).findIndex((r) => r.view.label === label),
  );
}

/** The next enabled row from `index` in direction `step` (wrapping), or `index`. */
function nextEnabled(all: readonly Row[], index: number, step: 1 | -1): number {
  for (let k = 1; k <= all.length; k += 1) {
    const i = (index + step * k + all.length * k) % all.length;
    if (all[i]?.view.disabled === false) return i;
  }
  return index;
}

/** Applies one input: the next state, and the action to carry out (if any). */
export function menuReduce(
  state: MenuState,
  input: MenuInput,
  ctx: MenuContext,
): { state: MenuState; action: MenuAction | null } {
  if (input.type === "toggle") {
    if (!state.open) return { state: MAIN, action: null };
    return { state: CLOSED_MENU, action: { type: "resume" } };
  }
  if (!state.open) return { state, action: null };
  const all = rows(state, ctx);
  const index = Math.min(state.index, all.length - 1);
  const activate = (i: number) => {
    const row = all[i];
    if (row === undefined || row.view.disabled) return { state: { ...state, index }, action: null };
    const out = row.run();
    return { state: out.state ?? { ...state, index: i }, action: out.action ?? null };
  };
  switch (input.type) {
    case "up":
      return { state: { ...state, index: nextEnabled(all, index, -1) }, action: null };
    case "down":
      return { state: { ...state, index: nextEnabled(all, index, 1) }, action: null };
    case "hover":
      if (all[input.index]?.view.disabled !== false) return { state, action: null };
      return { state: { ...state, index: input.index }, action: null };
    case "enter":
      return activate(index);
    case "activate":
      return activate(input.index);
    case "back":
      if (state.screen !== "main") {
        const from = state.screen === "maps" ? 1 : rowIndex(ctx, "Controls");
        return { state: { open: true, screen: "main", index: from }, action: null };
      }
      return { state: CLOSED_MENU, action: { type: "resume" } };
  }
}

/** The main screen carries the wordmark (STYLE.md "Wordmark"); "paused" is its subtitle. */
const TITLES: Record<MenuScreen, string> = {
  main: "TWO FEET",
  maps: "Maps",
  controls: "Controls",
};

/** The menu's read model for the view. */
export function menuView(state: MenuState, ctx: MenuContext): MenuViewModel {
  if (!state.open) return { open: false, title: "", items: [] };
  const all = rows(state, ctx);
  const index = Math.min(state.index, all.length - 1);
  return {
    open: true,
    title: TITLES[state.screen],
    ...(state.screen === "main" ? { subtitle: "paused" } : {}),
    items: all.map((r, i) => ({ ...r.view, selected: i === index })),
    ...(state.screen === "controls" ? { controls: controlRows(ctx.stance) } : {}),
  };
}
