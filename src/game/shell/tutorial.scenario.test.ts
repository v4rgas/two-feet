import { afterEach, describe, expect, it } from "vitest";
import { BOARD_CONFIG } from "../../contexts/board";
import type { StanceRepository } from "../../contexts/input";
import { INPUT_CONFIG } from "../../contexts/input";
import { RIDER_CONFIG } from "../../contexts/rider";
import { TRICKS_CONFIG } from "../../contexts/tricks";
import type { TutorialCardView } from "../../presentation/tutorial/tutorial-card-view-model";
import type { Stance } from "../../shared";
import { ManualClock, Transform, Vec3 } from "../../shared";
import { GAME_CONFIG } from "../game.config";
import { MAPS } from "../maps/maps";
import type { ShellView } from "./game-shell";
import { GameShell } from "./game-shell";
import { MemoryShellRepository } from "./shell-repository";

/*
 * THE TUTORIAL, full loop (GAME.md "Acceptance"): empty storage lands in the tutorial on
 * the flat map; it is played with real key events through the shell's keyboard routing
 * (push, ollie, a kickflip that bails, the hint, the retry, the kickflip), and each step
 * moves on only on the real event. It ends on the Street Course with the tutorial done,
 * and the next launch goes straight to the street.
 */

const STEP_S = GAME_CONFIG.loop.fixedStepS;
const T = 60_000;

class View implements ShellView {
  card: TutorialCardView | null = null;
  readonly cards: (TutorialCardView | null)[] = [];
  setup(): void {}
  render(): void {}
  showToast(): void {}
  renderMenu(): void {}
  renderTutorial(card: TutorialCardView | null): void {
    this.card = card;
    this.cards.push(card);
  }
}

class Stances implements StanceRepository {
  constructor(private stance: Stance) {}
  load(): Stance {
    return this.stance;
  }
  save(stance: Stance): void {
    this.stance = stance;
  }
}

const open: GameShell[] = [];
afterEach(() => {
  for (const s of open.splice(0)) s.dispose();
});

async function launchGame(storage: MemoryShellRepository, stance: Stance = "regular") {
  const view = new View();
  const keys = new EventTarget();
  const shell = await GameShell.create({
    maps: MAPS,
    configs: {
      board: BOARD_CONFIG,
      rider: RIDER_CONFIG,
      input: INPUT_CONFIG,
      game: GAME_CONFIG,
      tricks: TRICKS_CONFIG,
    },
    keys,
    stanceRepository: new Stances(stance),
    storage,
    clock: new ManualClock(),
    view,
    checkpointToast: "checkpoint",
    tutorial: GAME_CONFIG.tutorial,
  });
  open.push(shell);
  const key = (type: string, code: string) =>
    keys.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { code }));
  const sim = () => {
    const s = shell.simulation;
    if (s === null) throw new Error("no simulation");
    return s;
  };
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / STEP_S); i += 1) shell.advance(STEP_S);
  };
  /** Holds `code` for `holdS` while the game runs. */
  const tap = (code: string, holdS: number) => {
    key("keydown", code);
    run(holdS);
    key("keyup", code);
  };
  /** Runs until `done()` or `maxS`. */
  const until = (done: () => boolean, maxS: number) => {
    for (let i = 0; i < Math.round(maxS / STEP_S) && !done(); i += 1) shell.advance(STEP_S);
  };
  const step = () => shell.tutorial?.step ?? null;
  const k = INPUT_CONFIG.keys;
  const front = stance === "regular" ? k.left : k.right;
  const back = stance === "regular" ? k.right : k.left;
  const heel: "left" | "right" = stance === "regular" ? "left" : "right";

  /** Push: Space taps until the step moves on. */
  const pushUp = (untilStep: () => boolean) => {
    for (let i = 0; i < 20 && !untilStep(); i += 1) {
      tap("Space", 0.12);
      run(0.35);
    }
  };
  /** The ollie gesture: load back ↓ + front ↓, release the back (the pop), front ↑ levels. */
  const popAnd = (afterPop: () => void) => {
    key("keydown", back.down);
    run(0.02);
    key("keydown", front.down);
    run(0.34);
    key("keyup", back.down); // the pop
    run(0.05);
    key("keyup", front.down);
    afterPop();
  };
  return { shell, view, sim, run, tap, until, step, pushUp, popAnd, key, front, heel };
}

describe("tutorial (full loop, real keys)", () => {
  it(
    "empty storage → the tutorial on flat → push, ollie, a bailed kickflip (hint) and the retry → the Street Course, tutorial done; the next launch is the street",
    async () => {
      const storage = new MemoryShellRepository();
      const g = await launchGame(storage);
      expect(g.shell.currentMap?.id).toBe("flat");
      expect(g.step()).toBe("push");
      expect(g.view.card?.title).toBe("Push");
      g.run(0.3);

      // 1. Push: only the real speed moves it on.
      g.run(3);
      expect(g.step()).toBe("push");
      g.pushUp(() => g.step() !== "push");
      expect(g.step()).toBe("ollie");
      expect(Vec3.length(g.sim().loop.board.linearVelocityMps)).toBeGreaterThanOrEqual(3);
      expect(g.view.card?.title).toBe("Ollie");

      // 2. Ollie: pop, W to level, Space in the air.
      g.popAnd(() => {
        g.key("keydown", g.front.up);
        g.run(0.15);
        g.key("keyup", g.front.up);
        g.run(0.25);
        g.tap("Space", 0.1);
      });
      g.until(() => g.step() !== "ollie", 2);
      expect(g.step()).toBe("kickflip");
      expect(g.view.card?.title).toBe("Kickflip");
      expect(g.view.card?.hint).toBeNull();
      g.run(0.5);

      // 3a. A botched try: pop with a quarter body turn (Q) and no catch; it lands sideways
      // and bails. The step stays and the hint shows.
      g.popAnd(() => {
        g.key("keydown", "KeyQ");
        g.run(0.3);
        g.key("keyup", "KeyQ");
      });
      g.until(() => g.sim().loop.rider.bailed || (g.shell.tutorial?.failures ?? 0) > 0, 3);
      expect(g.step()).toBe("kickflip");
      expect(g.shell.tutorial?.failures).toBeGreaterThan(0);
      expect(g.view.card?.hint).toMatch(/^Pop first, tap A/);
      // The bail resets to the tutorial's spawn (no checkpoint in the tutorial).
      g.until(() => !g.sim().loop.rider.bailed, 4);
      g.run(STEP_S);
      const spawn = g.sim().spawn.positionM;
      expect(Vec3.distance(g.sim().loop.board.transform.positionM, spawn)).toBeLessThan(0.05);
      g.key("keydown", "KeyC");
      g.key("keyup", "KeyC");
      expect(g.shell.checkpoint).toBeNull();

      // 3b. The retry: push, then a caught kickflip.
      for (let i = 0; i < 4; i += 1) {
        g.tap("Space", 0.12);
        g.run(0.35);
      }
      g.popAnd(() => {
        g.key("keydown", g.front.up);
        g.key("keydown", g.front[g.heel]);
        g.run(0.08);
        g.key("keyup", g.front[g.heel]);
        g.run(0.02);
        g.key("keyup", g.front.up);
        // Space as the flip comes round and the board looks upright.
        g.until(() => {
          const air = g.sim().tricks.air;
          const b = g.sim().loop.board;
          const up = Transform.toWorldDirection(b.transform, Vec3.UNIT_Y);
          return (
            b.grounded ||
            (air !== null && Math.abs(air.rotation.rollRad) >= 2 * Math.PI - 0.15 && up.y > 0.85)
          );
        }, 1.5);
        g.tap("Space", 0.1);
      });
      g.until(() => g.step() !== "kickflip", 2);
      expect(g.step()).toBe("outro");
      expect(g.view.card?.title).toBe("Nice. Welcome to the Street Course.");
      expect(g.view.card?.footnote).toBe("two feet — a game by v4rgas");

      // 4. ≈ 2 s later: the Street Course, the tutorial done.
      g.run(1.5);
      expect(g.shell.currentMap?.id).toBe("flat");
      g.run(0.6);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(g.shell.currentMap?.id).toBe("street");
      expect(g.shell.tutorial).toBeNull();
      expect(g.view.card).toBeNull();
      expect(storage.loadTutorialDone()).toBe(true);

      // The next launch goes straight to the street.
      const again = await launchGame(storage);
      expect(again.shell.currentMap?.id).toBe("street");
      expect(again.shell.tutorial).toBeNull();
    },
    T,
  );

  it(
    "Skip tutorial from the menu goes to the street and marks it done; Tutorial replays it",
    async () => {
      const storage = new MemoryShellRepository();
      const g = await launchGame(storage);
      expect(g.shell.tutorial).not.toBeNull();
      g.key("keydown", "Escape");
      const menu = g.shell.menuState;
      expect(menu.open).toBe(true);
      g.shell.onMenuIntent({ type: "activate", index: 5 }); // "Skip tutorial"
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(g.shell.currentMap?.id).toBe("street");
      expect(storage.loadTutorialDone()).toBe(true);
      expect(g.shell.paused).toBe(false);
      g.key("keydown", "Escape");
      g.shell.onMenuIntent({ type: "activate", index: 5 }); // "Tutorial"
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(g.shell.currentMap?.id).toBe("flat");
      expect(g.shell.tutorial?.step).toBe("push");
    },
    T,
  );

  it(
    "the cards follow a goofy stance",
    async () => {
      const g = await launchGame(new MemoryShellRepository(), "goofy");
      g.run(0.3);
      g.pushUp(() => g.step() !== "push");
      const caps = g.view.card?.keys.flatMap((k) => (k.kind === "cap" ? [k.label] : []));
      expect(caps?.slice(0, 2)).toEqual(["S", "↓"]);
    },
    T,
  );
});
