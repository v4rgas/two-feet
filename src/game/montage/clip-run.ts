import { BOARD_CONFIG } from "../../contexts/board";
import type { StanceRepository } from "../../contexts/input";
import { INPUT_CONFIG, keyEventsFromPresses } from "../../contexts/input";
import { ScriptedInputSource } from "../../contexts/input/infrastructure/scripted-input-source";
import { RIDER_CONFIG } from "../../contexts/rider";
import { TRICKS_CONFIG } from "../../contexts/tricks";
import {
  createFlatGroundLevel,
  createSkateparkLevel,
  createStreetCourseLevel,
  Level,
  WORLD_CONFIG,
} from "../../contexts/world";
import type { DomainEvent, Stance } from "../../shared";
import { ManualClock, Transform, Vec3 } from "../../shared";
import type { Simulation, SimulationConfigs } from "../compose";
import { composeSimulation } from "../compose";
import { GAME_CONFIG } from "../game.config";
import type { ClipLevel, MontageClip } from "./clip";

/** The stance is the clip's, never the player's saved one (nothing is persisted). */
class FixedStanceRepository implements StanceRepository {
  constructor(private readonly stance: Stance) {}
  load(): Stance {
    return this.stance;
  }
  save(): void {}
}

/** A clip level by its `?level=` name, with its own spawn. */
export function baseClipLevel(name: ClipLevel): Level {
  switch (name) {
    case "park":
      return createSkateparkLevel(WORLD_CONFIG);
    case "street":
      return createStreetCourseLevel(WORLD_CONFIG);
    case "flat":
      return createFlatGroundLevel(WORLD_CONFIG.flatGround);
  }
}

/** The level of a clip, with its spawn override applied. */
export function clipLevel(clip: MontageClip): Level {
  const base = baseClipLevel(clip.level);
  if (clip.spawn === undefined) return base;
  const { xM, yM, zM, headingRad } = clip.spawn;
  return Level.create({ ...base, spawn: { positionM: Vec3.create(xM, yM, zM), headingRad } });
}

/** What a clip did (for `montage:verify` and the player's readout). */
export interface ClipOutcome {
  /** `TrickLanded` names in order. */
  readonly tricks: readonly string[];
  /** `TrickBailed` / `RiderBailed` descriptions in order. */
  readonly bails: readonly string[];
  /** Forward speed along the rider's heading at the end, m/s (< 0 = rolling fakie). */
  readonly endForwardMps: number;
}

/**
 * One clip's simulation: the real composition (`composeSimulation`, like `bootstrap` and
 * the scenario harness) fed by a `ScriptedInputSource` playing the clip's key timeline.
 * Used headless by `montage:verify` and in the browser by the montage player: the same
 * steps, so what is verified is what is filmed.
 */
export class ClipRun {
  readonly events: DomainEvent[] = [];

  private constructor(
    readonly clip: MontageClip,
    readonly sim: Simulation,
    readonly level: Level,
    private readonly input: ScriptedInputSource,
    /** The fixed simulation step, s. */
    readonly stepS: number,
  ) {
    sim.bus.subscribeAll((event) => this.events.push(event));
  }

  static async create(clip: MontageClip, configs?: SimulationConfigs): Promise<ClipRun> {
    const cfg: SimulationConfigs = configs ?? {
      board: BOARD_CONFIG,
      rider: RIDER_CONFIG,
      input: INPUT_CONFIG,
      game: GAME_CONFIG,
      tricks: TRICKS_CONFIG,
    };
    const level = clipLevel(clip);
    const input = new ScriptedInputSource(
      keyEventsFromPresses(clip.keys),
      cfg.input.keys,
      cfg.game.loop.fixedStepS,
    );
    const sim = await composeSimulation({
      configs: cfg,
      level,
      inputSource: input,
      stanceRepository: new FixedStanceRepository(clip.stance),
      clock: new ManualClock(),
      assistLevel: clip.assistLevel ?? "pro",
    });
    const speed = clip.spawn?.speedMps ?? 0;
    if (speed !== 0) {
      sim.board.body.resetTo(
        sim.spawn,
        Transform.toWorldDirection(sim.spawn, Vec3.create(speed, 0, 0)),
      );
    }
    return new ClipRun(clip, sim, level, input, cfg.game.loop.fixedStepS);
  }

  /** Simulation time since the clip start, s. */
  get timeS(): number {
    return this.input.timeS;
  }

  get done(): boolean {
    return this.timeS >= this.clip.durationS - 1e-9;
  }

  /** One fixed step of the whole game loop. */
  step(): void {
    this.sim.loop.step();
  }

  /** Steps to the end of the clip (headless). */
  runToEnd(): this {
    while (!this.done) this.step();
    return this;
  }

  outcome(): ClipOutcome {
    const tricks: string[] = [];
    const bails: string[] = [];
    for (const e of this.events) {
      if (e.type === "TrickLanded") tricks.push(e.name);
      else if (e.type === "TrickBailed") bails.push(`trick bailed: ${e.name ?? "?"} (${e.reason})`);
      else if (e.type === "RiderBailed")
        bails.push(`rider bailed (${e.reason}) at ${e.timeS.toFixed(2)} s`);
    }
    return { tricks, bails, endForwardMps: this.forwardMps() };
  }

  /** Speed along the rider's heading now, m/s (< 0 = rolling fakie). */
  forwardMps(): number {
    const v = this.sim.board.snapshot.linearVelocityMps;
    const h = this.sim.rider.state.headingRad;
    return v.x * Math.cos(h) - v.z * Math.sin(h);
  }

  dispose(): void {
    this.input.dispose();
    this.sim.physics.dispose();
  }
}
