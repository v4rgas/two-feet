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

/** Something that can be shown and hidden (the lil-gui panel). */
export interface Showable {
  setVisible(visible: boolean): void;
}

/**
 * F3 (GAME.md "Controls"): the tuning panel is hidden on load; the first toggle loads and
 * builds it (lazily: lil-gui is only fetched when asked for), later toggles show / hide it.
 */
export class TuningToggle {
  private visible = false;
  private panel: Promise<Showable> | null = null;

  constructor(private readonly load: () => Promise<Showable>) {}

  get shown(): boolean {
    return this.visible;
  }

  toggle(): Promise<void> {
    this.visible = !this.visible;
    this.panel ??= this.load();
    const visible = this.visible;
    return this.panel.then((p) => p.setVisible(visible));
  }
}

/**
 * Loads lil-gui lazily and builds the panel (hidden). Call only when `import.meta.env.DEV`.
 *
 * Live: `presentation` (ThreeRenderer), `board`, `rider`, `input`, `tricks`, `game` —
 * `bootstrap.ts` injects these very clones into the systems, which read them every step.
 * Values baked at construction need a page reload: `board.spec`
 * (body + colliders), `board.colliders`, `board.physics.gravityMps2`, `solverIterations`,
 * the collider friction/restitution, `input.keys`, `game.loop.fixedStepS`.
 */
export async function installDevTuningPanel(configs: TunableConfigs): Promise<Showable> {
  const { createTuningPanel } = await import("../presentation/tuning-panel");
  return createTuningPanel(
    [
      // The assists (ADR 0012) are one mode, edited in rider.assist.
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
    document.title = `Two Feet — reload to apply ${key}`;
  }
}
