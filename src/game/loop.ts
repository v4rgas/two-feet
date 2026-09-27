import type { BoardSnapshot, BoardSystem, PhysicsWorld } from "../contexts/board";
import type { InputSystem } from "../contexts/input";
import type { RiderSystem } from "../contexts/rider";
import type { TricksSystem } from "../contexts/tricks";
import type { DebugVector, RenderFrame } from "../presentation/render-frame";
import type { Clock, DomainEvent, EventBus, Transform } from "../shared";
import { FixedStepAccumulator } from "../shared";
import type { GameConfig } from "./game.config";

/** Everything the loop drives. Wired in `bootstrap.ts` (the composition root). */
export interface LoopSystems {
  readonly input: InputSystem;
  readonly rider: RiderSystem;
  readonly board: BoardSystem;
  readonly physics: PhysicsWorld;
  readonly tricks: TricksSystem;
  readonly bus: EventBus;
  /** Wall clock, used only to measure physics step time for the debug overlay. */
  readonly clock: Clock;
  /** Board pose to reset to after a bail. */
  readonly spawn: Transform;
}

interface TimedVector {
  readonly vector: Omit<DebugVector, "ageS">;
  readonly timeS: number;
}

/**
 * Fixed-step game loop (REQUIREMENTS §2.4). `advance` is called once per animation
 * frame with the real elapsed time; it runs 0..N fixed steps of exactly 1/120 s.
 */
export class GameLoop {
  private readonly accumulator: FixedStepAccumulator;
  private readonly stepS: number;
  private tick = 0;
  private timeS = 0;
  private previous: BoardSnapshot;
  private current: BoardSnapshot;
  private physicsStepMs = 0;
  private stepsThisFrame = 0;
  private resetAtS: number | null = null;
  private recentEvents: DomainEvent[] = [];
  private debugVectors: TimedVector[] = [];

  constructor(
    private readonly systems: LoopSystems,
    private readonly config: GameConfig,
  ) {
    this.stepS = config.loop.fixedStepS;
    this.accumulator = new FixedStepAccumulator({
      stepS: config.loop.fixedStepS,
      maxStepsPerAdvance: config.loop.maxStepsPerFrame,
    });
    this.previous = systems.board.snapshot;
    this.current = systems.board.snapshot;
    systems.bus.subscribeAll((event) => this.recentEvents.push(event));
    systems.bus.subscribe("RiderBailed", (event) => {
      this.resetAtS ??= event.timeS + config.bailResetDelayS;
    });
  }

  /** Runs as many fixed steps as `elapsedS` of real time allows. Returns the count. */
  advance(elapsedS: number): number {
    const steps = this.accumulator.advance(elapsedS);
    for (let i = 0; i < steps; i += 1) this.step();
    this.stepsThisFrame = steps;
    return steps;
  }

  /** One fixed step, in the exact order of REQUIREMENTS §2.4. */
  step(): void {
    const { input, rider, board, physics, tricks, bus, clock } = this.systems;
    const dtS = this.stepS;

    // 1. input samples devices and updates the FootIntents.
    const intents = input.step(dtS);

    // 2. rider turns intents into FootForces and applies them through the physics port.
    rider.applyIntents(intents, this.current, dtS);

    // 3. the physics world steps (after the board's own wheel/truck forces).
    board.prePhysics(dtS);
    const t0 = clock.nowS();
    physics.step(dtS);
    this.physicsStepMs = (clock.nowS() - t0) * 1000;

    this.tick += 1;
    this.timeS = this.tick * dtS;

    // 4. board reads back state, builds the BoardSnapshot and emits contact events.
    this.previous = this.current;
    this.current = board.postPhysics(this.tick, this.timeS);

    // 5. rider updates attach/detach and bail.
    rider.postPhysics(this.current, dtS);

    // 6. tricks consumes the snapshot (and, at flush, the events).
    tricks.update(this.current);

    // 7. the event bus flushes.
    bus.flush();

    this.recordDebugVectors();
    this.maybeResetAfterBail();
  }

  /** Builds the presentation read model for this animation frame and drains recent events. */
  buildFrame(): RenderFrame {
    const events = this.recentEvents;
    this.recentEvents = [];
    const air = this.systems.tricks.air;
    return {
      alpha: this.accumulator.alpha,
      previousBoard: this.previous,
      currentBoard: this.current,
      rider: this.systems.rider.state,
      intents: this.systems.input.lastIntents,
      stance: this.systems.input.stance,
      air,
      recentEvents: events,
      debug: {
        physicsStepMs: this.physicsStepMs,
        stepsThisFrame: this.stepsThisFrame,
        vectors: this.debugVectors.map(({ vector, timeS }) => ({
          ...vector,
          ageS: this.timeS - timeS,
        })),
        rotation: air?.rotation ?? null,
      },
    };
  }

  private recordDebugVectors(): void {
    const lifetimeS = this.config.debug.impulseLifetimeS;
    // Forces last one step; impulses linger for the overlay's fade.
    this.debugVectors = this.debugVectors.filter(
      ({ vector, timeS }) => vector.kind === "impulse" && this.timeS - timeS <= lifetimeS,
    );
    for (const f of this.systems.board.lastForces) {
      this.debugVectors.push({
        timeS: this.timeS,
        vector: {
          kind: "force",
          foot: null,
          label: f.label,
          originWorldM: f.pointWorldM,
          vectorWorld: f.forceN,
        },
      });
    }
    const boardOriginM = this.current.transform.positionM;
    for (const f of this.systems.rider.lastForces) {
      // Torques and angular impulses are drawn as axis arrows at the board centre.
      const [kind, originWorldM, vectorWorld] =
        f.kind === "force"
          ? (["force", f.pointWorldM, f.forceN] as const)
          : f.kind === "impulse"
            ? (["impulse", f.pointWorldM, f.impulseNs] as const)
            : f.kind === "torque"
              ? (["force", boardOriginM, f.torqueNm] as const)
              : (["impulse", boardOriginM, f.impulseNms] as const);
      this.debugVectors.push({
        timeS: this.timeS,
        vector: { kind, foot: f.foot, label: f.label, originWorldM, vectorWorld },
      });
    }
  }

  private maybeResetAfterBail(): void {
    if (this.resetAtS === null || this.timeS < this.resetAtS) return;
    this.resetAtS = null;
    const { board, rider, tricks, input, spawn } = this.systems;
    board.reset(spawn);
    rider.reset(board.snapshot);
    tricks.reset();
    input.reset();
    this.previous = board.snapshot;
    this.current = board.snapshot;
  }
}
