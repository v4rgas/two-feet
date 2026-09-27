import type { BoardConfig } from "../contexts/board";
import { BoardSpec, PhysicsBoardSystem } from "../contexts/board";
import { RapierPhysicsWorld } from "../contexts/board/infrastructure/rapier-physics-world";
import type { InputConfig, InputSource, StanceRepository } from "../contexts/input";
import { DefaultInputSystem } from "../contexts/input";
import type { RiderConfig } from "../contexts/rider";
import { DefaultRiderSystem } from "../contexts/rider";
import type { TricksConfig } from "../contexts/tricks";
import { DefaultTricksSystem, TRICKS_CONFIG } from "../contexts/tricks";
import type { Level } from "../contexts/world";
import { grindEdgesNear, levelGrindEdges, obstacleCollider } from "../contexts/world";
import type { Clock } from "../shared";
import { InMemoryEventBus, Quat, Transform, Vec3 } from "../shared";
import type { GameConfig } from "./game.config";
import { GameLoop } from "./loop";

/** Configs the simulation reads. In dev these are the tunable clones (live lil-gui edits). */
export interface SimulationConfigs {
  readonly board: BoardConfig;
  readonly rider: RiderConfig;
  readonly input: InputConfig;
  readonly game: GameConfig;
  /** Defaults to `TRICKS_CONFIG`. */
  readonly tricks?: TricksConfig;
}

export interface SimulationDeps {
  readonly configs: SimulationConfigs;
  readonly level: Level;
  readonly inputSource: InputSource;
  readonly stanceRepository: StanceRepository;
  readonly clock: Clock;
}

/** Everything `composeSimulation` built (the harness and the renderer need some of it). */
export interface Simulation {
  readonly loop: GameLoop;
  readonly bus: InMemoryEventBus;
  readonly spec: BoardSpec;
  readonly spawn: Transform;
  readonly physics: RapierPhysicsWorld;
  readonly board: PhysicsBoardSystem;
  readonly input: DefaultInputSystem;
  readonly rider: DefaultRiderSystem;
  readonly tricks: DefaultTricksSystem;
}

/**
 * Builds the whole fixed-step simulation (physics, board, input, rider, tricks, loop)
 * from an input source. Shared by the browser `bootstrap` and the headless scenario
 * harness, so the scenarios test exactly the wiring the game runs.
 *
 * Systems receive the config objects by reference and read them every step, so when the
 * dev build passes tunable clones, lil-gui edits apply live. Values baked at build time
 * (`board.spec`, colliders, gravity, solver iterations, the fixed step) need a reload.
 */
export async function composeSimulation(deps: SimulationDeps): Promise<Simulation> {
  const { configs, level } = deps;
  const bus = new InMemoryEventBus();
  const spec = BoardSpec.create(configs.board.spec);
  const spawn = Transform.create(
    Vec3.add(level.spawn.positionM, Vec3.create(0, BoardSpec.restHeightM(spec), 0)),
    Quat.fromAxisAngle(Vec3.UNIT_Y, level.spawn.headingRad),
  );

  const physics = await RapierPhysicsWorld.create(configs.board);
  for (const obstacle of level.obstacles) physics.addStaticCollider(obstacleCollider(obstacle));
  const board = new PhysicsBoardSystem(physics.createBoard(spec, spawn), spec, configs.board, bus);
  const edges = levelGrindEdges(level.obstacles);
  const input = new DefaultInputSystem(deps.inputSource, deps.stanceRepository, configs.input);
  const rider = new DefaultRiderSystem({
    body: board.body,
    bus,
    deck: spec,
    config: configs.rider,
    board: board.snapshot,
    probeGroundY: (pointWorldM) =>
      physics.raycast(
        { originWorldM: pointWorldM, directionWorld: Vec3.create(0, -1, 0) },
        { maxDistanceM: configs.rider.tricks.groundProbeM, excludeBody: board.body },
      )?.pointWorldM.y ?? null,
    grindEdgesNear: (pointWorldM, radiusM) =>
      grindEdgesNear(edges, pointWorldM, radiusM).map((hit) => hit.edge),
  });
  const tricks = new DefaultTricksSystem({
    bus,
    config: configs.tricks ?? TRICKS_CONFIG,
    rider,
    stance: input,
  });

  const loop = new GameLoop(
    { input, rider, board, physics, tricks, bus, clock: deps.clock, spawn },
    configs.game,
  );
  return { loop, bus, spec, spawn, physics, board, input, rider, tricks };
}
