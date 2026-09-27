import type { StanceRepository } from "../../contexts/input";
import { KeyboardInputSource } from "../../contexts/input/infrastructure/keyboard-input-source";
import type { MapDefinition } from "../../contexts/world";
import type { MenuIntent, MenuViewModel } from "../../presentation/menu/menu-view-model";
import type { RenderFrame, SceneSetup } from "../../presentation/render-frame";
import type { TutorialCardView } from "../../presentation/tutorial/tutorial-card-view-model";
import type { Clock, DomainEvent } from "../../shared";
import { Vec3 } from "../../shared";
import type { Simulation, SimulationConfigs } from "../compose";
import { composeSimulation } from "../compose";
import type { MapRegistry } from "../maps/map-registry";
import type { Checkpoint } from "./checkpoint";
import { checkpointFrom } from "./checkpoint";
import type { MenuAction, MenuContext, MenuInput, MenuState } from "./menu-model";
import { CLOSED_MENU, menuReduce, menuView } from "./menu-model";
import type { ShellRepository } from "./shell-repository";
import type { TutorialState } from "./tutorial";
import { TUTORIAL_START, tutorialOnEvent, tutorialOnFrame } from "./tutorial";
import { tutorialCard } from "./tutorial-card";

/*
 * THE GAME SHELL (GAME.md, ADR 0014): the application layer around one simulation. It owns
 * the current map (and rebuilds the whole simulation to switch), the checkpoint, the pause
 * and the Esc menu, and routes the keyboard: shell keys (Esc, R, C, F3) are handled here,
 * every other key reaches the game's input only while the game runs. The presentation
 * only draws what it is handed and reports clicks back as intents.
 */

/** What the shell draws on (the renderer, the HUD and the menu, adapted in bootstrap). */
export interface ShellView {
  /** Builds the scene for a map (disposing the previous one). */
  setup(scene: SceneSetup): void;
  render(frame: RenderFrame): void;
  showToast(text: string): void;
  renderMenu(view: MenuViewModel): void;
  /** The tutorial's prompt card, or null to hide it (outside the tutorial). */
  renderTutorial(card: TutorialCardView | null): void;
}

/** The part of `window` (or a test's `EventTarget`) the shell listens on for keys. */
export interface KeySource {
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
}

export interface ShellDeps {
  readonly maps: MapRegistry;
  readonly configs: SimulationConfigs;
  readonly keys: KeySource;
  readonly stanceRepository: StanceRepository;
  readonly storage: ShellRepository;
  readonly clock: Clock;
  readonly view: ShellView;
  /** F3: show or hide the tuning panel (dev builds only; absent in production). */
  readonly onToggleTuning?: () => void;
  /** The checkpoint toast's text. */
  readonly checkpointToast: string;
  /** The tutorial's thresholds (GAME_CONFIG.tutorial). */
  readonly tutorial: { readonly pushDoneSpeedMps: number; readonly outroS: number };
}

/** Where the shell opens (GAME.md "First launch"): a map id from the URL wins. */
export interface ShellStart {
  readonly mapId?: string | null;
}

const SHELL_CODES = { menu: "Escape", restart: "KeyR", checkpoint: "KeyC", tuning: "F3" };
const MENU_KEYS: Readonly<Record<string, MenuInput["type"]>> = {
  ArrowUp: "up",
  ArrowDown: "down",
  KeyW: "up",
  KeyS: "down",
  Enter: "enter",
  NumpadEnter: "enter",
};

function codeOf(event: Event): string {
  const code: unknown = (event as Partial<KeyboardEvent>).code;
  return typeof code === "string" ? code : "";
}

function forwarded(type: string, code: string): Event {
  return Object.assign(new Event(type), { code });
}

export class GameShell {
  /** The game's keys, forwarded from `deps.keys` while the game runs (the input listens here). */
  private readonly gameKeys = new EventTarget();
  private readonly input: KeyboardInputSource;
  private readonly gameCodes: ReadonlySet<string>;
  private sim: Simulation | null = null;
  private map: MapDefinition | null = null;
  private checkpoint_: Checkpoint | null = null;
  private menu: MenuState = CLOSED_MENU;
  private loadToken = 0;
  private events: DomainEvent[] = [];
  private unsubscribe: (() => void) | null = null;
  /** The tutorial's progress while it runs (GAME.md "Tutorial"), else null. */
  private tutorial_: TutorialState | null = null;

  private constructor(private readonly deps: ShellDeps) {
    this.input = new KeyboardInputSource(this.gameKeys, deps.configs.input.keys);
    const k = deps.configs.input.keys;
    this.gameCodes = new Set([
      ...Object.values(k.left),
      ...Object.values(k.right),
      k.feetDown,
      k.spin.left,
      k.spin.right,
    ]);
    deps.keys.addEventListener("keydown", this.onKeyDown);
    deps.keys.addEventListener("keyup", this.onKeyUp);
    deps.keys.addEventListener("blur", this.onBlur);
  }

  /** Builds the shell and loads its first map. */
  static async create(deps: ShellDeps, start: ShellStart = {}): Promise<GameShell> {
    const shell = new GameShell(deps);
    const fromUrl = start.mapId == null ? undefined : deps.maps.get(start.mapId);
    if (fromUrl === undefined && !deps.storage.loadTutorialDone()) await shell.startTutorial();
    else await shell.loadMap(shell.firstMap(start).id);
    return shell;
  }

  // ── Read-only state (tests, the dev handle) ────────────────────────────

  get simulation(): Simulation | null {
    return this.sim;
  }

  get currentMap(): MapDefinition | null {
    return this.map;
  }

  get checkpoint(): Checkpoint | null {
    return this.checkpoint_;
  }

  get paused(): boolean {
    return this.menu.open;
  }

  get menuState(): MenuState {
    return this.menu;
  }

  /** The tutorial's progress, or null outside it. */
  get tutorial(): TutorialState | null {
    return this.tutorial_;
  }

  // ── Frame ──────────────────────────────────────────────────────────────

  /**
   * One animation frame: steps the simulation by `elapsedS` of real time unless paused,
   * then draws. Returns the fixed steps run.
   */
  advance(elapsedS: number): number {
    const sim = this.sim;
    if (sim === null) return 0;
    const steps = this.paused ? 0 : sim.loop.advance(elapsedS);
    this.handleEvents(steps * this.deps.configs.game.loop.fixedStepS);
    this.deps.view.render(sim.loop.buildFrame());
    return steps;
  }

  // ── Actions (keys, menu) ───────────────────────────────────────────────

  /** R: back to the checkpoint, or the map's spawn. */
  restart(): void {
    this.sim?.loop.restart();
  }

  /** C: sets the checkpoint if the rule allows it. Returns whether it did. */
  setCheckpoint(): boolean {
    const sim = this.sim;
    // The tutorial always restarts at its spawn (GAME.md "Tutorial").
    if (sim === null || this.paused || this.tutorial_ !== null) return false;
    const cp = checkpointFrom(sim.loop.board, sim.loop.rider);
    if (cp === null) return false;
    this.checkpoint_ = cp;
    sim.loop.setRespawn(cp);
    this.deps.view.showToast(this.deps.checkpointToast);
    return true;
  }

  clearCheckpoint(): void {
    this.checkpoint_ = null;
    this.sim?.loop.setRespawn(null);
  }

  /** Opens the menu (pausing) or closes it (resuming). */
  toggleMenu(): void {
    this.menuInput({ type: "toggle" });
  }

  /** A mouse intent from the menu view. */
  onMenuIntent(intent: MenuIntent): void {
    this.menuInput(intent);
  }

  /** Starts (or replays) the tutorial on the tutorial map. */
  async startTutorial(): Promise<void> {
    await this.loadMap(this.deps.maps.tutorialMap.id, true);
  }

  /** Ends the tutorial as done (completed or skipped) and opens the default map. */
  async finishTutorial(): Promise<void> {
    this.deps.storage.saveTutorialDone(true);
    await this.loadMap(this.deps.maps.defaultMap.id);
  }

  /**
   * Loads a map: builds a new simulation (physics world, bodies), then swaps it in and
   * disposes the old one; the scene is rebuilt. Clears the checkpoint. `tutorial` runs the
   * tutorial on it; any other load ends a running tutorial (not as done).
   */
  async loadMap(id: string, tutorial = false): Promise<void> {
    const map = this.deps.maps.get(id) ?? this.deps.maps.defaultMap;
    const token = ++this.loadToken;
    const level = map.createLevel();
    const sim = await composeSimulation({
      configs: this.deps.configs,
      level,
      inputSource: this.input,
      stanceRepository: this.deps.stanceRepository,
      clock: this.deps.clock,
    });
    if (token !== this.loadToken) {
      sim.physics.dispose(); // a newer load won
      return;
    }
    this.unsubscribe?.();
    this.sim?.physics.dispose();
    this.sim = sim;
    this.map = map;
    this.checkpoint_ = null;
    this.events = [];
    this.unsubscribe = sim.bus.subscribeAll((event) => this.events.push(event));
    this.tutorial_ = tutorial ? TUTORIAL_START : null;
    this.deps.view.setup({ boardSpec: sim.spec, level });
    if (!tutorial) this.deps.storage.saveLastMap(map.id);
    this.renderMenu();
    this.renderTutorial();
  }

  /** Removes the listeners and frees the simulation. */
  dispose(): void {
    this.deps.keys.removeEventListener("keydown", this.onKeyDown);
    this.deps.keys.removeEventListener("keyup", this.onKeyUp);
    this.deps.keys.removeEventListener("blur", this.onBlur);
    this.unsubscribe?.();
    this.input.dispose();
    this.sim?.physics.dispose();
    this.sim = null;
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private firstMap(start: ShellStart): MapDefinition {
    const maps = this.deps.maps;
    const fromUrl = start.mapId == null ? undefined : maps.get(start.mapId);
    if (fromUrl !== undefined) return fromUrl;
    const last = this.deps.storage.loadLastMap();
    return (last === null ? undefined : maps.get(last)) ?? maps.defaultMap;
  }

  /** Feeds the frame's events and the board's speed to the tutorial. */
  private handleEvents(dtS: number): void {
    const events = this.events;
    this.events = [];
    const before = this.tutorial_;
    const sim = this.sim;
    if (before === null || sim === null) return;
    let state = before;
    for (const event of events) state = tutorialOnEvent(state, event);
    const speed = Vec3.length(sim.loop.board.linearVelocityMps);
    state = tutorialOnFrame(state, speed, dtS, this.deps.tutorial);
    this.tutorial_ = state;
    if (state.step === "done") {
      void this.finishTutorial();
      return;
    }
    if (state !== before) this.renderTutorial();
  }

  private renderTutorial(): void {
    const stance = this.sim?.input.stance ?? "regular";
    this.deps.view.renderTutorial(
      this.tutorial_ === null ? null : tutorialCard(this.tutorial_, stance),
    );
  }

  private menuContext(): MenuContext {
    return {
      maps: this.deps.maps.all,
      currentMapId: this.map?.id ?? null,
      stance: this.sim?.input.stance ?? "regular",
      tutorialRunning: this.tutorial_ !== null,
      hasCheckpoint: this.checkpoint_ !== null,
    };
  }

  private menuInput(input: MenuInput): void {
    const wasOpen = this.menu.open;
    const { state, action } = menuReduce(this.menu, input, this.menuContext());
    this.menu = state;
    if (!wasOpen && state.open) this.pauseInput();
    if (action !== null) this.run(action);
    this.renderMenu();
  }

  private run(action: MenuAction): void {
    switch (action.type) {
      case "resume":
        break;
      case "restart":
        this.restart();
        break;
      case "clearCheckpoint":
        this.clearCheckpoint();
        break;
      case "setStance":
        this.sim?.input.setStance(action.stance);
        this.renderTutorial(); // its keys follow the stance
        break;
      case "loadMap":
        void this.loadMap(action.id);
        break;
      case "startTutorial":
        void this.startTutorial();
        break;
      case "skipTutorial":
        void this.finishTutorial();
        break;
    }
  }

  /** Opening the menu: the input forgets every held key, so nothing leaks through it. */
  private pauseInput(): void {
    this.gameKeys.dispatchEvent(new Event("blur"));
    this.sim?.input.reset();
  }

  private renderMenu(): void {
    this.deps.view.renderMenu(menuView(this.menu, this.menuContext()));
  }

  private readonly onKeyDown = (event: Event): void => {
    const code = codeOf(event);
    const repeat = (event as Partial<KeyboardEvent>).repeat === true;
    if (code === SHELL_CODES.menu) {
      event.preventDefault();
      if (!repeat) this.menuInput(this.menu.open ? { type: "back" } : { type: "toggle" });
      return;
    }
    if (code === SHELL_CODES.tuning) {
      if (this.deps.onToggleTuning !== undefined) {
        event.preventDefault();
        if (!repeat) this.deps.onToggleTuning();
      }
      return;
    }
    if (this.menu.open) {
      const nav = MENU_KEYS[code];
      if (nav !== undefined || this.gameCodes.has(code)) event.preventDefault();
      if (nav !== undefined && !(repeat && nav === "enter"))
        this.menuInput({ type: nav } as MenuInput);
      return; // nothing reaches the game while paused
    }
    if (code === SHELL_CODES.restart) {
      if (!repeat) this.restart();
      return;
    }
    if (code === SHELL_CODES.checkpoint) {
      if (!repeat) this.setCheckpoint();
      return;
    }
    if (this.gameCodes.has(code)) event.preventDefault();
    this.gameKeys.dispatchEvent(forwarded("keydown", code));
  };

  private readonly onKeyUp = (event: Event): void => {
    const code = codeOf(event);
    if (this.gameCodes.has(code)) event.preventDefault();
    this.gameKeys.dispatchEvent(forwarded("keyup", code));
  };

  private readonly onBlur = (): void => {
    this.gameKeys.dispatchEvent(new Event("blur"));
  };
}
