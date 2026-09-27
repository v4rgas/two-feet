import { describe, expect, it } from "vitest";
import type { MenuContext, MenuInput, MenuState } from "./menu-model";
import { CLOSED_MENU, menuReduce, menuView } from "./menu-model";

const ctx: MenuContext = {
  maps: [
    { id: "street", name: "Street Course", description: "The plaza." },
    { id: "flat", name: "Flat ground", description: "Concrete." },
  ],
  currentMapId: "street",
  stance: "regular",
  tutorialRunning: false,
  hasCheckpoint: false,
};

function play(inputs: readonly MenuInput[], c: MenuContext = ctx, from: MenuState = CLOSED_MENU) {
  let state = from;
  const actions = [];
  for (const input of inputs) {
    const out = menuReduce(state, input, c);
    state = out.state;
    if (out.action !== null) actions.push(out.action);
  }
  return { state, actions };
}

const labels = (s: MenuState, c: MenuContext = ctx) => menuView(s, c).items.map((i) => i.label);

describe("menu model", () => {
  it("Esc opens it on Resume; Esc again closes it and resumes", () => {
    const opened = play([{ type: "toggle" }]);
    expect(opened.state.open).toBe(true);
    expect(labels(opened.state)).toEqual([
      "Resume",
      "Maps",
      "Restart",
      "Clear checkpoint",
      "Stance",
      "Tutorial",
      "Controls",
    ]);
    expect(menuView(opened.state, ctx).items[0]?.selected).toBe(true);
    const closed = play([{ type: "toggle" }, { type: "toggle" }]);
    expect(closed.state.open).toBe(false);
    expect(closed.actions).toEqual([{ type: "resume" }]);
  });

  it("↑ ↓ move and wrap, skipping disabled rows (Clear checkpoint without one)", () => {
    const s = play([{ type: "toggle" }, { type: "down" }, { type: "down" }, { type: "down" }]);
    expect(labels(s.state)[s.state.index]).toBe("Stance");
    const up = play([{ type: "toggle" }, { type: "up" }]);
    expect(labels(up.state)[up.state.index]).toBe("Controls");
    const withCp = { ...ctx, hasCheckpoint: true };
    const s2 = play(
      [{ type: "toggle" }, { type: "down" }, { type: "down" }, { type: "down" }],
      withCp,
    );
    expect(labels(s2.state, withCp)[s2.state.index]).toBe("Clear checkpoint");
  });

  it("Maps lists every map (the current one marked); picking one loads it and closes", () => {
    const s = play([{ type: "toggle" }, { type: "down" }, { type: "enter" }]);
    const view = menuView(s.state, ctx);
    expect(view.title).toBe("Maps");
    expect(view.items.map((i) => i.label)).toEqual(["Street Course", "Flat ground", "Back"]);
    expect(view.items[0]?.current).toBe(true);
    expect(view.items[1]?.detail).toBe("Concrete.");
    const picked = play([{ type: "down" }, { type: "enter" }], ctx, s.state);
    expect(picked.actions).toEqual([{ type: "loadMap", id: "flat" }]);
    expect(picked.state.open).toBe(false);
  });

  it("Esc in a submenu goes back to the main list; Back does too", () => {
    const s = play([{ type: "toggle" }, { type: "down" }, { type: "enter" }, { type: "back" }]);
    expect(s.state.screen).toBe("main");
    expect(s.state.open).toBe(true);
    expect(s.actions).toEqual([]);
  });

  it("the mouse: hover selects, a click activates", () => {
    const s = play([{ type: "toggle" }, { type: "hover", index: 2 }]);
    expect(s.state.index).toBe(2);
    const click = play([{ type: "toggle" }, { type: "activate", index: 2 }]);
    expect(click.actions).toEqual([{ type: "restart" }]);
    const disabled = play([{ type: "toggle" }, { type: "activate", index: 3 }]);
    expect(disabled.actions).toEqual([]);
  });

  it("Stance toggles (the menu stays open); Tutorial vs Skip tutorial", () => {
    const s = play([{ type: "toggle" }, { type: "activate", index: 4 }]);
    expect(s.actions).toEqual([{ type: "setStance", stance: "goofy" }]);
    expect(s.state.open).toBe(true);
    expect(play([{ type: "toggle" }, { type: "activate", index: 5 }]).actions).toEqual([
      { type: "startTutorial" },
    ]);
    const running = { ...ctx, tutorialRunning: true };
    const skip = play([{ type: "toggle" }, { type: "activate", index: 5 }], running);
    expect(labels(play([{ type: "toggle" }], running).state, running)).toContain("Skip tutorial");
    expect(skip.actions).toEqual([{ type: "skipTutorial" }]);
  });

  it("Controls shows the key reference in the current stance", () => {
    const s = play([{ type: "toggle" }, { type: "activate", index: 6 }]);
    const regular = menuView(s.state, ctx).controls ?? [];
    const goofy = menuView(s.state, { ...ctx, stance: "goofy" }).controls ?? [];
    const ollie = (rows: typeof regular) =>
      rows
        .find((r) => r.label === "Ollie")
        ?.keys.filter((k) => k.kind === "cap")
        .map((k) => (k.kind === "cap" ? k.label : ""));
    expect(ollie(regular)).toEqual(["↓", "S", "↓", "W"]);
    expect(ollie(goofy)).toEqual(["S", "↓", "S", "↑"]);
    for (const label of [
      "Push",
      "Kickflip / heelflip",
      "Shove-it (BS / FS)",
      "Catch",
      "Spin · steer",
      "Grinds",
      "Restart · checkpoint",
      "Menu",
    ]) {
      expect(regular.map((r) => r.label)).toContain(label);
    }
  });
});
