import { BOARD_CONFIG } from "../contexts/board";
import { INPUT_CONFIG } from "../contexts/input";
import { KeyboardInputSource } from "../contexts/input/infrastructure/keyboard-input-source";
import { LocalStorageStanceRepository } from "../contexts/input/infrastructure/local-storage-stance-repository";
import { nextAssistLevel, RIDER_CONFIG } from "../contexts/rider";
import { LocalStorageAssistLevelRepository } from "../contexts/rider/infrastructure/local-storage-assist-level-repository";
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
import { createTunableConfigs, installDevTuningPanel } from "./dev-tuning";
import { GAME_CONFIG } from "./game.config";
import type { GameLoop } from "./loop";

/** The level named by the `?level=` URL parameter: `park`, `street`, or the flat ground (default). */
function levelFromUrl(search: string): Level {
  const name = new URLSearchParams(search).get("level");
  if (name === "park") return createSkateparkLevel(WORLD_CONFIG);
  if (name === "street") return createStreetCourseLevel(WORLD_CONFIG);
  return createFlatGroundLevel(WORLD_CONFIG.flatGround);
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
  // The assist level (ADR 0012): saved like the stance; players start at `normal`.
  const assists = new LocalStorageAssistLevelRepository(configs.rider.assist.storageKey);
  const sim = await composeSimulation({
    configs,
    level,
    inputSource: new KeyboardInputSource(window, configs.input.keys),
    stanceRepository: new LocalStorageStanceRepository(configs.input.stance.storageKey),
    clock: performanceClock,
    assistLevel: assists.load() ?? configs.rider.assist.defaultLevel,
  });
  const { loop } = sim;
  const assist = {
    get level() {
      return sim.rider.assistLevel;
    },
    set level(value) {
      sim.rider.assistLevel = value;
      assists.save(value);
    },
  };
  // F2 cycles the assist level (pro → normal → easy); the HUD shows it by the stance.
  window.addEventListener("keydown", (event) => {
    if (event.code !== configs.rider.assist.cycleKey || event.repeat) return;
    event.preventDefault();
    assist.level = nextAssistLevel(assist.level);
  });

  const renderer = new ThreeRenderer({
    canvas,
    config: tunables?.presentation ?? PRESENTATION_CONFIG,
  });
  renderer.setup({ boardSpec: sim.spec, level });
  if (tunables !== null) void installDevTuningPanel(tunables, assist);

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
