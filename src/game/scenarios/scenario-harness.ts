/*
 * HEADLESS FULL-LOOP HARNESS (REQUIREMENTS §2.6). Runs the real simulation — Rapier,
 * PhysicsBoardSystem, DefaultInputSystem fed by the real KeyboardInputSource, the real
 * DefaultRiderSystem and GameLoop — in Node, and replays a timed key script. The key
 * events go through the same keyboard adapter as in the browser (dispatched on a plain
 * EventTarget), so the scenarios exercise the whole input → rider → board chain.
 *
 * Test-support code for `*.scenario.test.ts`; never imported by the game.
 */
import type { BoardConfig, BoardSnapshot } from "../../contexts/board";
import { BOARD_CONFIG, BoardSpec, WHEEL_IDS } from "../../contexts/board";
import type { InputConfig, StanceRepository } from "../../contexts/input";
import { clusterForFoot, INPUT_CONFIG } from "../../contexts/input";
import { KeyboardInputSource } from "../../contexts/input/infrastructure/keyboard-input-source";
import type { FootForce, RiderConfig, RiderState } from "../../contexts/rider";
import { RIDER_CONFIG } from "../../contexts/rider";
import type { Level } from "../../contexts/world";
import { createFlatGroundLevel, WORLD_CONFIG } from "../../contexts/world";
import type { DomainEvent, FootId, Stance } from "../../shared";
import { ManualClock, Transform, Vec3 } from "../../shared";
import type { Simulation } from "../compose";
import { composeSimulation } from "../compose";
import type { GameConfig } from "../game.config";
import { GAME_CONFIG } from "../game.config";

/** A stick direction of one foot, by role (the stance picks the physical key). */
export type FootDirection = "up" | "down" | "left" | "right";

/** One key press in a script: `code` held from `atS` for `holdS` seconds. */
export interface KeyPress {
  readonly code: string;
  readonly atS: number;
  readonly holdS: number;
}

/** Key code of a foot's direction for a stance (regular: front = WASD, back = arrows). */
export function footKey(stance: Stance, foot: FootId, direction: FootDirection): string {
  const cluster = clusterForFoot(stance, foot);
  return INPUT_CONFIG.keys[cluster][direction];
}

/** Everything recorded after one fixed step. */
export interface StepRecord {
  readonly timeS: number;
  readonly board: BoardSnapshot;
  readonly rider: RiderState;
  readonly forces: readonly FootForce[];
  /** Lowest wheel bottom above the ground, m (0 on the ground). */
  readonly wheelClearanceM: number;
  readonly leanRad: number;
}

export interface HarnessOptions {
  readonly stance?: Stance;
  readonly board?: BoardConfig;
  readonly rider?: RiderConfig;
  readonly input?: InputConfig;
  readonly game?: GameConfig;
  /** The level (default: flat ground). */
  readonly level?: Level;
}

class MemoryStanceRepository implements StanceRepository {
  constructor(private stance: Stance) {}
  load(): Stance {
    return this.stance;
  }
  save(stance: Stance): void {
    this.stance = stance;
  }
}

function keyEvent(type: string, code: string): Event {
  return Object.assign(new Event(type), { code });
}

export class ScenarioHarness {
  readonly records: StepRecord[] = [];
  readonly events: DomainEvent[] = [];
  private readonly pending: { atS: number; type: "keydown" | "keyup"; code: string }[] = [];
  private readonly stepS: number;

  private constructor(
    readonly sim: Simulation,
    readonly stance: Stance,
    private readonly keys: EventTarget,
    game: GameConfig,
  ) {
    this.stepS = game.loop.fixedStepS;
    sim.bus.subscribeAll((event) => this.events.push(event));
  }

  static async create(options: HarnessOptions = {}): Promise<ScenarioHarness> {
    const stance = options.stance ?? "regular";
    const game = options.game ?? GAME_CONFIG;
    const keys = new EventTarget();
    const sim = await composeSimulation({
      configs: {
        board: options.board ?? BOARD_CONFIG,
        rider: options.rider ?? RIDER_CONFIG,
        input: options.input ?? INPUT_CONFIG,
        game,
      },
      level: options.level ?? createFlatGroundLevel(WORLD_CONFIG.flatGround),
      inputSource: new KeyboardInputSource(keys, INPUT_CONFIG.keys),
      stanceRepository: new MemoryStanceRepository(stance),
      clock: new ManualClock(),
    });
    return new ScenarioHarness(sim, stance, keys, game);
  }

  get timeS(): number {
    return this.records.at(-1)?.timeS ?? 0;
  }

  get board(): BoardSnapshot {
    return this.sim.board.snapshot;
  }

  get rider(): RiderState {
    return this.sim.rider.state;
  }

  /** Schedules key presses (times relative to now). */
  press(...presses: readonly KeyPress[]): this {
    const now = this.timeS;
    for (const p of presses) {
      this.pending.push({ atS: now + p.atS, type: "keydown", code: p.code });
      this.pending.push({ atS: now + p.atS + p.holdS, type: "keyup", code: p.code });
    }
    this.pending.sort((a, b) => a.atS - b.atS);
    return this;
  }

  /** Sets the board rolling at `speedMps` along its nose, keeping its pose (a run-up). */
  launch(speedMps: number): this {
    const body = this.sim.board.body;
    const t = body.getTransform();
    body.resetTo(t, Transform.toWorldDirection(t, Vec3.create(speedMps, 0, 0)));
    return this;
  }

  /** Presses `code` now and keeps it held until `keyUp` (for inputs released on a condition). */
  keyDown(code: string): this {
    this.pending.unshift({ atS: this.timeS, type: "keydown", code });
    return this;
  }

  /** Releases `code` now. */
  keyUp(code: string): this {
    this.pending.unshift({ atS: this.timeS, type: "keyup", code });
    return this;
  }

  /** Shorthand: press a foot direction (by role) at `atS` for `holdS`. */
  foot(foot: FootId, direction: FootDirection, atS: number, holdS: number): this {
    return this.press({ code: footKey(this.stance, foot, direction), atS, holdS });
  }

  /** Runs fixed steps for `durationS`, delivering scheduled key events before each step. */
  run(durationS: number): this {
    const steps = Math.round(durationS / this.stepS);
    for (let i = 0; i < steps; i += 1) this.step();
    return this;
  }

  /** Records captured since `fromS` (inclusive). */
  since(fromS: number): StepRecord[] {
    return this.records.filter((r) => r.timeS >= fromS - 1e-9);
  }

  eventsOf<T extends DomainEvent["type"]>(type: T): Extract<DomainEvent, { type: T }>[] {
    return this.events.filter((e): e is Extract<DomainEvent, { type: T }> => e.type === type);
  }

  /** Forward speed along the board's heading (flattened), m/s. */
  forwardSpeedMps(board: BoardSnapshot = this.board): number {
    const f = Transform.toWorldDirection(board.transform, Vec3.UNIT_X);
    const h = Vec3.normalize(Vec3.create(f.x, 0, f.z));
    return Vec3.dot(board.linearVelocityMps, h);
  }

  /** Heading of the board (rad around world +Y, 0 = +X). */
  headingRad(board: BoardSnapshot = this.board): number {
    const f = Transform.toWorldDirection(board.transform, Vec3.UNIT_X);
    return Math.atan2(-f.z, f.x);
  }

  /** Tilt of the board's up axis from world up, rad. */
  tiltRad(board: BoardSnapshot = this.board): number {
    const up = Transform.toWorldDirection(board.transform, Vec3.UNIT_Y);
    return Math.acos(Math.max(-1, Math.min(1, up.y)));
  }

  /** Pitch of the nose above the horizon, rad (+ = nose up). */
  pitchRad(board: BoardSnapshot = this.board): number {
    const f = Transform.toWorldDirection(board.transform, Vec3.UNIT_X);
    return Math.asin(Math.max(-1, Math.min(1, f.y)));
  }

  dispose(): void {
    this.sim.physics.dispose();
  }

  private step(): void {
    const nextTimeS = this.timeS + this.stepS;
    // Events due before this step's sample (the keyboard is sampled at loop step 1).
    while (this.pending.length > 0 && (this.pending[0]?.atS ?? Infinity) < nextTimeS - 1e-9) {
      const e = this.pending.shift();
      if (e !== undefined) this.keys.dispatchEvent(keyEvent(e.type, e.code));
    }
    this.sim.loop.step();
    const board = this.sim.board.snapshot;
    this.records.push({
      timeS: board.timeS,
      board,
      rider: this.sim.rider.state,
      forces: this.sim.rider.lastForces,
      wheelClearanceM: wheelClearanceM(this.sim.spec, board),
      leanRad: this.sim.board.leanRad,
    });
  }
}

function wheelClearanceM(spec: BoardSpec, board: BoardSnapshot): number {
  let lowest = Number.POSITIVE_INFINITY;
  for (const wheel of WHEEL_IDS) {
    const c = Transform.toWorldPoint(board.transform, BoardSpec.wheelCenterLocal(spec, wheel));
    lowest = Math.min(lowest, c.y - spec.wheels.radiusM);
  }
  return Math.max(0, lowest);
}

type Mutable<T> = { -readonly [K in keyof T]: Mutable<T[K]> };

/** A copy of the rider config with some values changed (for tuning experiments). */
export function riderWith(edit: (c: Mutable<RiderConfig>) => void): RiderConfig {
  const c = structuredClone(RIDER_CONFIG) as Mutable<RiderConfig>;
  edit(c);
  return c as RiderConfig;
}

/** A copy of the board config with some values changed (for tuning experiments). */
export function boardWith(edit: (c: Mutable<BoardConfig>) => void): BoardConfig {
  const c = structuredClone(BOARD_CONFIG) as Mutable<BoardConfig>;
  edit(c);
  return c as BoardConfig;
}
