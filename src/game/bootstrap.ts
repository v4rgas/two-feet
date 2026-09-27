import { BOARD_CONFIG, BoardSpec, PhysicsBoardSystem } from "../contexts/board";
import { RapierPhysicsWorld } from "../contexts/board/infrastructure/rapier-physics-world";
import { DefaultInputSystem, INPUT_CONFIG } from "../contexts/input";
import { KeyboardInputSource } from "../contexts/input/infrastructure/keyboard-input-source";
import { LocalStorageStanceRepository } from "../contexts/input/infrastructure/local-storage-stance-repository";
import { DefaultRiderSystem, RIDER_CONFIG } from "../contexts/rider";
import { createFlatGroundLevel, WORLD_CONFIG } from "../contexts/world";
import { PRESENTATION_CONFIG } from "../presentation/presentation.config";
import { ThreeRenderer } from "../presentation/three-renderer";
import type { Clock } from "../shared";
import { InMemoryEventBus, Quat, Transform, Vec3 } from "../shared";
import { createTunableConfigs, installDevTuningPanel } from "./dev-tuning";
import { GAME_CONFIG } from "./game.config";
import { GameLoop } from "./loop";
import { StubTricksSystem } from "./stubs";

/** Browser wall clock (the `Clock` port's production adapter). */
const performanceClock: Clock = { nowS: () => performance.now() / 1000 };

/**
 * Composition root: the only place that knows every concrete class (REQUIREMENTS §2.3
 * rule 6). Context agents swap their stub for the real implementation here.
 */
export async function bootstrap(canvas: HTMLCanvasElement): Promise<GameLoop> {
  const bus = new InMemoryEventBus();
  const spec = BoardSpec.create(BOARD_CONFIG.spec);
  const level = createFlatGroundLevel(WORLD_CONFIG.flatGround);
  const spawn = Transform.create(
    Vec3.add(level.spawn.positionM, Vec3.create(0, BoardSpec.restHeightM(spec), 0)),
    Quat.fromAxisAngle(Vec3.UNIT_Y, level.spawn.headingRad),
  );

  const physics = await RapierPhysicsWorld.create(BOARD_CONFIG);
  for (const obstacle of level.obstacles) physics.addStaticCollider(obstacle);
  const board = new PhysicsBoardSystem(physics.createBoard(spec, spawn), spec, BOARD_CONFIG, bus);
  const input = new DefaultInputSystem(
    new KeyboardInputSource(window, INPUT_CONFIG.keys),
    new LocalStorageStanceRepository(INPUT_CONFIG.stance.storageKey),
    INPUT_CONFIG,
  );
  const rider = new DefaultRiderSystem({
    body: board.body,
    bus,
    deck: spec,
    config: RIDER_CONFIG,
    board: board.snapshot,
  });
  // TODO(tricks): TrickRecognizer subscribed to `bus`.
  const tricks = new StubTricksSystem();

  const loop = new GameLoop(
    { input, rider, board, physics, tricks, bus, clock: performanceClock, spawn },
    GAME_CONFIG,
  );

  // Presentation: Three.js renderer + HUD + debug overlay. In dev it gets a tunable clone
  // of its config (live lil-gui edits); see dev-tuning.ts for the other contexts' hook.
  const tunables = import.meta.env.DEV ? createTunableConfigs() : null;
  const renderer = new ThreeRenderer({
    canvas,
    config: tunables?.presentation ?? PRESENTATION_CONFIG,
  });
  renderer.setup({ boardSpec: spec, level });
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
