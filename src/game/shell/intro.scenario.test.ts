import { afterEach, describe, expect, it } from "vitest";
import { BOARD_CONFIG } from "../../contexts/board";
import type { StanceRepository } from "../../contexts/input";
import { INPUT_CONFIG } from "../../contexts/input";
import { RIDER_CONFIG } from "../../contexts/rider";
import { TRICKS_CONFIG } from "../../contexts/tricks";
import type { MenuViewModel } from "../../presentation/menu/menu-view-model";
import type { SceneSetup } from "../../presentation/render-frame";
import type { TutorialCardView } from "../../presentation/tutorial/tutorial-card-view-model";
import type { Stance } from "../../shared";
import { ManualClock } from "../../shared";
import { GAME_CONFIG } from "../game.config";
import { MAPS } from "../maps/maps";
import type { IntroPlayer, ShellView } from "./game-shell";
import { GameShell } from "./game-shell";
import { MemoryShellRepository } from "./shell-repository";

/*
 * THE OPENING CINEMATIC in the game shell (GAME.md "Intro"): first launch → intro →
 * tutorial; any key or click skips it; `introSeen` is remembered, so later launches skip
 * it; "Intro" in the menu replays it and comes back to the paused game as it was. The
 * intro itself is a fake here (the real one is a montage clip, checked by
 * `pnpm montage:verify`); the maps and the physics are real.
 */

const STEP_S = GAME_CONFIG.loop.fixedStepS;
const T = 30_000;

class View implements ShellView {
  readonly setups: SceneSetup[] = [];
  menu: MenuViewModel = { open: false, title: "", items: [] };
  card: TutorialCardView | null = null;
  frames = 0;
  setup(scene: SceneSetup): void {
    this.setups.push(scene);
  }
  render(): void {
    this.frames += 1;
  }
  showToast(): void {}
  renderMenu(view: MenuViewModel): void {
    this.menu = view;
  }
  renderTutorial(card: TutorialCardView | null): void {
    this.card = card;
  }
}

/** Plays for `lengthS` of frames, then reports it has finished. */
class FakeIntro implements IntroPlayer {
  starts = 0;
  stops = 0;
  playedS = 0;
  constructor(private readonly lengthS: number) {}
  async start(): Promise<void> {
    this.starts += 1;
    this.playedS = 0;
  }
  advance(elapsedS: number): boolean {
    this.playedS += elapsedS;
    return this.playedS >= this.lengthS;
  }
  stop(): void {
    this.stops += 1;
  }
}

class Stances implements StanceRepository {
  load(): Stance {
    return "regular";
  }
  save(): void {}
}

const open: GameShell[] = [];
afterEach(() => {
  for (const s of open.splice(0)) s.dispose();
});

async function launch(storage: MemoryShellRepository, intro = new FakeIntro(6), mapId?: string) {
  const view = new View();
  const keys = new EventTarget();
  const shell = await GameShell.create(
    {
      maps: MAPS,
      configs: {
        board: BOARD_CONFIG,
        rider: RIDER_CONFIG,
        input: INPUT_CONFIG,
        game: GAME_CONFIG,
        tricks: TRICKS_CONFIG,
      },
      keys,
      stanceRepository: new Stances(),
      storage,
      clock: new ManualClock(),
      view,
      checkpointToast: "checkpoint",
      tutorial: GAME_CONFIG.tutorial,
      intro,
    },
    { mapId: mapId ?? null },
  );
  open.push(shell);
  const key = (type: string, code: string) =>
    keys.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { code }));
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds / STEP_S); i += 1) shell.advance(STEP_S);
  };
  /** Lets the async map load that follows the intro settle. */
  const settle = async () => {
    const until = Date.now() + 10_000;
    while (Date.now() < until && (shell.phase === "intro" || shell.simulation === null)) {
      await new Promise((r) => setTimeout(r, 5));
    }
    for (let i = 0; i < 5; i += 1) await new Promise((r) => setTimeout(r, 0));
  };
  return { shell, view, keys, intro, key, run, settle };
}

describe("opening cinematic (game shell)", () => {
  it(
    "first launch: the intro plays (no map, nothing steps), then the tutorial; introSeen is saved",
    async () => {
      const storage = new MemoryShellRepository();
      const g = await launch(storage);
      expect(g.shell.phase).toBe("intro");
      expect(g.intro.starts).toBe(1);
      expect(g.shell.simulation).toBeNull();
      expect(g.view.setups).toHaveLength(0);
      expect(g.run(3)).toBeUndefined();
      expect(g.shell.phase).toBe("intro");
      expect(storage.loadIntroSeen()).toBe(false);
      g.run(3.1);
      await g.settle();
      expect(g.intro.stops).toBeGreaterThanOrEqual(1);
      expect(storage.loadIntroSeen()).toBe(true);
      expect(g.shell.phase).toBe("tutorial");
      expect(g.shell.currentMap?.id).toBe(MAPS.tutorialMap.id);
      expect(g.view.card?.title).toBe("Push");
    },
    T,
  );

  it(
    "any key skips it (and never reaches the game), a click too; the next launch skips the intro",
    async () => {
      const storage = new MemoryShellRepository();
      const g = await launch(storage);
      g.run(0.5);
      g.key("keydown", "KeyW"); // pressed to skip, and kept held
      await g.settle();
      expect(storage.loadIntroSeen()).toBe(true);
      expect(g.shell.phase).toBe("tutorial");
      g.run(0.1);
      // The skip key did not reach the input: the front foot is not held.
      expect(g.shell.simulation?.input.lastIntents.front.held?.y ?? 0).toBe(0);

      const clicked = await launch(new MemoryShellRepository());
      clicked.keys.dispatchEvent(new Event("pointerdown"));
      await clicked.settle();
      expect(clicked.shell.phase).toBe("tutorial");

      const again = await launch(storage);
      expect(again.intro.starts).toBe(0);
      expect(again.shell.phase).toBe("tutorial"); // the tutorial is still not done
    },
    T,
  );

  it(
    "Esc during the intro skips it instead of opening the menu; a map in the URL skips the intro",
    async () => {
      const g = await launch(new MemoryShellRepository());
      g.key("keydown", "Escape");
      await g.settle();
      expect(g.shell.paused).toBe(false);
      expect(g.shell.phase).toBe("tutorial");

      const storage = new MemoryShellRepository();
      const linked = await launch(storage, new FakeIntro(6), "flat");
      expect(linked.intro.starts).toBe(0);
      expect(linked.shell.phase).toBe("playing");
      expect(storage.loadIntroSeen()).toBe(false);
    },
    T,
  );

  it(
    "later launches: boot → the last map; the menu's Intro replays it and comes back to the paused game as it was",
    async () => {
      const storage = new MemoryShellRepository(true, "flat", true);
      const g = await launch(storage);
      expect(g.intro.starts).toBe(0);
      expect(g.shell.phase).toBe("playing");
      expect(g.shell.currentMap?.id).toBe("flat");
      const sim = g.shell.simulation;
      g.run(0.5);
      const tick = sim?.loop.tick;

      g.key("keydown", "Escape");
      const labels = g.view.menu.items.map((i) => i.label);
      expect(labels).toContain("Intro");
      g.shell.onMenuIntent({ type: "activate", index: labels.indexOf("Intro") });
      await new Promise((r) => setTimeout(r, 0)); // the intro's start() resolves
      expect(g.shell.phase).toBe("intro");
      expect(g.intro.starts).toBe(1);
      expect(g.shell.paused).toBe(false);
      const setupsBefore = g.view.setups.length;
      g.run(2);
      expect(sim?.loop.tick).toBe(tick); // the game behind it stays frozen
      g.key("keydown", "Space");
      await g.settle();
      expect(g.shell.phase).toBe("playing");
      expect(g.shell.simulation).toBe(sim); // the same game, not a reload
      expect(g.view.setups.length).toBe(setupsBefore + 1); // its scene is rebuilt
      g.run(0.1);
      expect(sim?.loop.tick).toBeGreaterThan(tick ?? 0);
    },
    T,
  );
});
