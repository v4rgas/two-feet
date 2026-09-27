/*
 * DEV-ONLY tuning (REQUIREMENTS §1.7, ADR 0001 §Config). Configs are deep-frozen, so the
 * lil-gui panel edits `structuredClone`s (`Tunable<T>`). A clone only has an effect if the
 * system that uses it received THAT object by injection and reads it every step.
 */
import type { BoardConfig } from "../contexts/board";
import { BOARD_CONFIG } from "../contexts/board";
import type { InputConfig } from "../contexts/input";
import { INPUT_CONFIG } from "../contexts/input";
import type { RiderConfig } from "../contexts/rider";
import { RIDER_CONFIG } from "../contexts/rider";
import type { TricksConfig } from "../contexts/tricks";
import { TRICKS_CONFIG } from "../contexts/tricks";
import type { PresentationConfig } from "../presentation/presentation.config";
import { PRESENTATION_CONFIG } from "../presentation/presentation.config";
import type { Tunable } from "../shared";
import type { GameConfig } from "./game.config";
import { GAME_CONFIG } from "./game.config";

/** Mutable clones of every config the panel shows. */
export interface TunableConfigs {
  readonly presentation: Tunable<PresentationConfig>;
  readonly board: Tunable<BoardConfig>;
  readonly rider: Tunable<RiderConfig>;
  readonly input: Tunable<InputConfig>;
  readonly tricks: Tunable<TricksConfig>;
  readonly game: Tunable<GameConfig>;
}

export function createTunableConfigs(): TunableConfigs {
  return {
    presentation: structuredClone(PRESENTATION_CONFIG) as Tunable<PresentationConfig>,
    board: structuredClone(BOARD_CONFIG) as Tunable<BoardConfig>,
    rider: structuredClone(RIDER_CONFIG) as Tunable<RiderConfig>,
    input: structuredClone(INPUT_CONFIG) as Tunable<InputConfig>,
    tricks: structuredClone(TRICKS_CONFIG) as Tunable<TricksConfig>,
    game: structuredClone(GAME_CONFIG) as Tunable<GameConfig>,
  };
}

/**
 * Loads lil-gui lazily and builds the panel. Call only when `import.meta.env.DEV`.
 *
 * Live: `presentation` (ThreeRenderer), `board`, `rider`, `input`, `tricks`, `game` —
 * `bootstrap.ts` injects these very clones into the systems, which read them every step.
 * Values baked at construction need a page reload: `board.spec`
 * (body + colliders), `board.colliders`, `board.physics.gravityMps2`, `solverIterations`,
 * the collider friction/restitution, `input.keys`, `game.loop.fixedStepS`.
 */
export async function installDevTuningPanel(configs: TunableConfigs): Promise<void> {
  const { createTuningPanel } = await import("../presentation/tuning-panel");
  createTuningPanel(
    [
      { name: "presentation", target: configs.presentation },
      { name: "board", target: configs.board },
      { name: "rider", target: configs.rider },
      { name: "input", target: configs.input },
      { name: "tricks", target: configs.tricks },
      { name: "game", target: configs.game },
    ],
    onTuningChange,
  );
}

/** Edits of values that are baked at construction (see above): they apply after a reload. */
const BAKED = [
  /^board\.spec\./,
  /^board\.colliders\./,
  /^board\.physics\.(gravityMps2|solverIterations|deckFrictionCoeff|kickFrictionCoeff|deckRestitution|wheelFrictionCoeff|wheelRestitution|surfaceFriction)/,
  /^game\.loop\./,
];

function onTuningChange(section: string, path: string, _value: unknown): void {
  const key = `${section}.${path}`;
  if (BAKED.some((re) => re.test(key))) {
    document.title = `Skate — reload to apply ${key}`;
  }
}
