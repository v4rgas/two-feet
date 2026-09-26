import type { PhysicsWorld } from "../contexts/board";
import { BOARD_CONFIG, BoardSpec } from "../contexts/board";
import { createFlatGroundLevel, WORLD_CONFIG } from "../contexts/world";
import type { Clock } from "../shared";
import { InMemoryEventBus, Quat, Transform, Vec3 } from "../shared";
import { GAME_CONFIG } from "./game.config";
import { GameLoop } from "./loop";
import {
  StubBoardSystem,
  StubInputSystem,
  StubPhysicsWorld,
  StubRiderSystem,
  StubTricksSystem,
} from "./stubs";

/** Browser wall clock (the `Clock` port's production adapter). */
const performanceClock: Clock = { nowS: () => performance.now() / 1000 };

/**
 * Composition root: the only place that knows every concrete class (REQUIREMENTS §2.3
 * rule 6). Context agents swap their stub for the real implementation here.
 */
export function bootstrap(canvas: HTMLCanvasElement): GameLoop {
  const bus = new InMemoryEventBus();
  const spec = BoardSpec.create(BOARD_CONFIG.spec);
  const level = createFlatGroundLevel(WORLD_CONFIG.flatGround);
  const spawn = Transform.create(
    Vec3.add(level.spawn.positionM, Vec3.create(0, BoardSpec.restHeightM(spec), 0)),
    Quat.fromAxisAngle(Vec3.UNIT_Y, level.spawn.headingRad),
  );

  // TODO(board): RapierPhysicsWorld + real BoardSystem; add level.obstacles as static colliders.
  const physics: PhysicsWorld = new StubPhysicsWorld();
  for (const obstacle of level.obstacles) physics.addStaticCollider(obstacle);
  const board = new StubBoardSystem(spawn);
  // TODO(input): keyboard InputSource + VirtualSticks.
  const input = new StubInputSystem();
  // TODO(rider): Rider aggregate + FootForceModel, applying forces to `board.body`.
  const rider = new StubRiderSystem(board.snapshot);
  // TODO(tricks): TrickRecognizer subscribed to `bus`.
  const tricks = new StubTricksSystem();

  const loop = new GameLoop(
    { input, rider, board, physics, tricks, bus, clock: performanceClock, spawn },
    GAME_CONFIG,
  );

  // TODO(presentation): Three.js renderer; `renderer.setup({ boardSpec: spec, level })`.
  const context = canvas.getContext("2d");
  let last = performance.now();
  const frame = (now: number): void => {
    loop.advance((now - last) / 1000);
    last = now;
    loop.buildFrame();
    if (context !== null) {
      context.fillStyle = "#e9e6df";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return loop;
}
