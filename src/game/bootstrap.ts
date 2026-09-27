import { BOARD_CONFIG } from "../contexts/board";
import { RapierPhysicsWorld } from "../contexts/board/infrastructure/rapier-physics-world";
import { INPUT_CONFIG } from "../contexts/input";
import { LocalStorageStanceRepository } from "../contexts/input/infrastructure/local-storage-stance-repository";
import { RIDER_CONFIG } from "../contexts/rider";
import { TRICKS_CONFIG } from "../contexts/tricks";
import { dismissBootScreen } from "../presentation/boot/boot-screen";
import { MenuView } from "../presentation/menu/menu-view";
import { PRESENTATION_CONFIG } from "../presentation/presentation.config";
import { ThreeRenderer } from "../presentation/three-renderer";
import { TutorialCard } from "../presentation/tutorial/tutorial-card";
import type { Clock } from "../shared";
import type { SimulationConfigs } from "./compose";
import { GAME_CONFIG } from "./game.config";
import { MAPS } from "./maps/maps";
import { GameShell } from "./shell/game-shell";
import { LocalStorageShellRepository } from "./shell/local-storage-shell-repository";

/** `?map=<id>` or `?level=<id>` (dev links): open that map directly. */
function mapIdFromUrl(search: string): string | null {
  const params = new URLSearchParams(search);
  return params.get("map") ?? params.get("level");
}

/**
 * Removes settings the game no longer has (the assist level, ADR 0012), so they do not
 * linger in localStorage. Storage may be unavailable (private mode, blocked): ignored.
 */
function forgetObsoleteSettings(keys: readonly string[]): void {
  for (const key of keys) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // No storage: nothing to tidy.
    }
  }
}

/** Browser wall clock (the `Clock` port's production adapter). */
const performanceClock: Clock = { nowS: () => performance.now() / 1000 };

/** The credit in the menu footer. */
const CREDIT = {
  text: "made by v4rgas",
  linkText: "v4rgas.com",
  href: "https://v4rgas.com",
  iconSrc: `${import.meta.env.BASE_URL}brand/v4rgas/penguin.png`,
} as const;

/** Read-only handle for browser checks (dev builds: `window.__skate`). */
export interface DevHandle {
  readonly shell: GameShell;
  /** Runs one frame of `elapsedS` (for when rAF is throttled). */
  advance(elapsedS: number): number;
  sceneStats(): ReturnType<ThreeRenderer["sceneStats"]>;
  physicsStats(): {
    readonly bodies: number;
    readonly colliders: number;
    readonly liveWorlds: number;
  };
}

/**
 * Composition root: the only place that knows every concrete class (REQUIREMENTS §2.3
 * rule 6). The game shell (GAME.md) owns the simulation and the map; this adds the
 * keyboard (`window`), localStorage, the renderer and the menu.
 *
 * Dev builds inject `structuredClone`d configs (`createTunableConfigs`) into every system,
 * so lil-gui edits apply live (F3 shows the panel); production injects the frozen defaults
 * and never loads the tuning code.
 */
export async function bootstrap(canvas: HTMLCanvasElement): Promise<DevHandle> {
  const dev = import.meta.env.DEV ? await import("./dev-tuning") : null;
  const tunables = dev?.createTunableConfigs() ?? null;
  const configs: SimulationConfigs = tunables ?? {
    board: BOARD_CONFIG,
    rider: RIDER_CONFIG,
    input: INPUT_CONFIG,
    game: GAME_CONFIG,
    tricks: TRICKS_CONFIG,
  };
  forgetObsoleteSettings(configs.game.obsoleteStorageKeys);

  const renderer = new ThreeRenderer({
    canvas,
    config: tunables?.presentation ?? PRESENTATION_CONFIG,
  });
  const hudParent = canvas.parentElement ?? document.body;
  let shell: GameShell | null = null;
  const tutorialCard = new TutorialCard(hudParent);
  const menu = new MenuView(hudParent, (intent) => shell?.onMenuIntent(intent), CREDIT);
  const tuning =
    dev !== null && tunables !== null
      ? new dev.TuningToggle(() => dev.installDevTuningPanel(tunables))
      : null;

  shell = await GameShell.create(
    {
      maps: MAPS,
      configs,
      keys: window,
      stanceRepository: new LocalStorageStanceRepository(configs.input.stance.storageKey),
      storage: new LocalStorageShellRepository(configs.game.shell),
      clock: performanceClock,
      view: {
        setup: (scene) => renderer.setup(scene),
        render: (frame) => renderer.render(frame),
        showToast: (text) => renderer.showToast(text),
        renderMenu: (view) => menu.render(view),
        renderTutorial: (card) => tutorialCard.render(card),
      },
      ...(tuning === null ? {} : { onToggleTuning: () => void tuning.toggle() }),
      checkpointToast: configs.game.shell.checkpointToast,
      tutorial: configs.game.tutorial,
    },
    { mapId: mapIdFromUrl(window.location.search) },
  );
  const game = shell;
  dismissBootScreen();

  let last = performance.now();
  const frame = (now: number): void => {
    game.advance((now - last) / 1000);
    last = now;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  return {
    shell: game,
    advance: (elapsedS) => game.advance(elapsedS),
    sceneStats: () => renderer.sceneStats(),
    physicsStats: () => ({
      ...(game.simulation?.physics.stats() ?? { bodies: 0, colliders: 0 }),
      liveWorlds: RapierPhysicsWorld.liveWorlds,
    }),
  };
}
