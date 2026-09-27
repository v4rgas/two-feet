import { BOARD_CONFIG } from "../contexts/board";
import { INPUT_CONFIG } from "../contexts/input";
import { KeyboardInputSource } from "../contexts/input/infrastructure/keyboard-input-source";
import { LocalStorageStanceRepository } from "../contexts/input/infrastructure/local-storage-stance-repository";
import { RIDER_CONFIG } from "../contexts/rider";
import { createFlatGroundLevel, WORLD_CONFIG } from "../contexts/world";
import { PRESENTATION_CONFIG } from "../presentation/presentation.config";
import { ThreeRenderer } from "../presentation/three-renderer";
import type { Clock } from "../shared";
import type { SimulationConfigs } from "./compose";
import { composeSimulation } from "./compose";
import { createTunableConfigs, installDevTuningPanel } from "./dev-tuning";
import { GAME_CONFIG } from "./game.config";
import type { GameLoop } from "./loop";

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
  };
  const level = createFlatGroundLevel(WORLD_CONFIG.flatGround);
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
