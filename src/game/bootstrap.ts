import { BOARD_CONFIG } from "../contexts/board";
import { INPUT_CONFIG } from "../contexts/input";
import { KeyboardInputSource } from "../contexts/input/infrastructure/keyboard-input-source";
import { LocalStorageStanceRepository } from "../contexts/input/infrastructure/local-storage-stance-repository";
import { RIDER_CONFIG } from "../contexts/rider";
import { TRICKS_CONFIG } from "../contexts/tricks";
import type { Level } from "../contexts/world";
import {
  createFlatGroundLevel,
  createSkateparkLevel,
  createStreetCourseLevel,
  WORLD_CONFIG,
} from "../contexts/world";
import { PRESENTATION_CONFIG } from "../presentation/presentation.config";
import { ThreeRenderer } from "../presentation/three-renderer";
import type { Clock } from "../shared";
import type { SimulationConfigs } from "./compose";
import { composeSimulation } from "./compose";
import { createBarrierDemoLevel } from "./dev/barrier-demo";
import { createTunableConfigs, installDevTuningPanel } from "./dev-tuning";
import { GAME_CONFIG } from "./game.config";
import type { GameLoop } from "./loop";

/** The level named by the `?level=` URL parameter: `park`, `street`, or the flat ground (default). */
function levelFromUrl(search: string): Level {
  const name = new URLSearchParams(search).get("level");
  if (name === "park") return createSkateparkLevel(WORLD_CONFIG);
  if (name === "street") return createStreetCourseLevel(WORLD_CONFIG);
  if (import.meta.env.DEV && name === "barrier-demo") return createBarrierDemoLevel();
  return createFlatGroundLevel(WORLD_CONFIG.flatGround);
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

/**
 * Composition root: the only place that knows every concrete class (REQUIREMENTS §2.3
 * rule 6). The simulation itself is built by `composeSimulation` (shared with the
 * headless scenario harness); this adds the keyboard, localStorage and the renderer.
 *
 * Dev builds inject `structuredClone`d configs (`createTunableConfigs`) into every system,
 * so lil-gui edits apply live; production injects the frozen defaults.
 */
export async function bootstrap(canvas: HTMLCanvasElement): Promise<GameLoop> {
  const tunables = import.meta.env.DEV ? createTunableConfigs() : null;
  const configs: SimulationConfigs = tunables ?? {
    board: BOARD_CONFIG,
    rider: RIDER_CONFIG,
    input: INPUT_CONFIG,
    game: GAME_CONFIG,
    tricks: TRICKS_CONFIG,
  };
  const level = levelFromUrl(window.location.search);
  forgetObsoleteSettings(configs.game.obsoleteStorageKeys);
  const sim = await composeSimulation({
    configs,
    level,
    inputSource: new KeyboardInputSource(window, configs.input.keys),
    stanceRepository: new LocalStorageStanceRepository(configs.input.stance.storageKey),
    clock: performanceClock,
  });
  const { loop } = sim;

  const renderer = new ThreeRenderer({
    canvas,
    config: tunables?.presentation ?? PRESENTATION_CONFIG,
  });
  renderer.setup({ boardSpec: sim.spec, level });
  if (tunables !== null) void installDevTuningPanel(tunables);
  // Dev-only handle for visual checks (camera poses via `setMontageOverrides`).
  if (import.meta.env.DEV) Object.assign(window, { __skateRenderer: renderer });

  let last = performance.now();
  const frame = (now: number): void => {
    loop.advance((now - last) / 1000);
    last = now;
    renderer.render(loop.buildFrame());
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return loop;
}
