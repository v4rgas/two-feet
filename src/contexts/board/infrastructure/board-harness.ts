import type { Transform } from "../../../shared";
import { InMemoryEventBus, Quat, Transform as T, Vec3 } from "../../../shared";
import { PhysicsBoardSystem } from "../application/physics-board-system";
import type { BoardConfig } from "../board.config";
import { BOARD_CONFIG } from "../board.config";
import { BoardSpec } from "../domain/board-spec";
import type { StaticColliderDesc } from "../domain/physics-world";
import { RapierPhysicsWorld } from "./rapier-physics-world";

/** Fixed step used by the game (REQUIREMENTS §1.4). */
export const STEP_S = 1 / 120;

/**
 * Headless test harness: a Rapier world with a flat ground (top face y = 0) and a board
 * driven exactly like the game loop does (prePhysics → step → postPhysics).
 * Test-support code for the integration scenarios; not used by the game.
 */
export class BoardHarness {
  tick = 0;
  readonly events: string[] = [];

  private constructor(
    readonly physics: RapierPhysicsWorld,
    readonly system: PhysicsBoardSystem,
    readonly spec: BoardSpec,
    readonly bus: InMemoryEventBus,
  ) {
    bus.subscribeAll((e) => this.events.push(e.type));
  }

  static async create(
    options: {
      config?: BoardConfig;
      spawn?: Transform;
      heightAboveRestM?: number;
      /** Extra static geometry on top of the flat ground (ramps, rails…). */
      obstacles?: readonly StaticColliderDesc[];
    } = {},
  ): Promise<BoardHarness> {
    const config = options.config ?? BOARD_CONFIG;
    const spec = BoardSpec.create(config.spec);
    const physics = await RapierPhysicsWorld.create(config);
    physics.addStaticCollider({
      id: "ground",
      surface: "ground",
      transform: T.create(Vec3.create(0, -0.5, 0), Quat.IDENTITY),
      shape: { kind: "box", halfExtentsM: Vec3.create(100, 0.5, 100) },
    });
    for (const obstacle of options.obstacles ?? []) physics.addStaticCollider(obstacle);
    const spawn =
      options.spawn ??
      T.create(
        Vec3.create(0, BoardSpec.restHeightM(spec) + (options.heightAboveRestM ?? 0), 0),
        Quat.IDENTITY,
      );
    const board = physics.createBoard(spec, spawn);
    const bus = new InMemoryEventBus();
    const system = new PhysicsBoardSystem(board, spec, config, bus);
    return new BoardHarness(physics, system, spec, bus);
  }

  get body() {
    return this.system.body;
  }

  /** One loop step. `beforeStep` runs where the rider would apply its forces. */
  step(beforeStep?: () => void): void {
    beforeStep?.();
    this.system.prePhysics(STEP_S);
    this.physics.step(STEP_S);
    this.tick += 1;
    this.system.postPhysics(this.tick, this.tick * STEP_S);
    this.bus.flush();
  }

  run(steps: number, beforeStep?: () => void): void {
    for (let i = 0; i < steps; i += 1) this.step(beforeStep);
  }

  /** Board-frame point → world. */
  worldPoint(local: Vec3): Vec3 {
    return T.toWorldPoint(this.body.getTransform(), local);
  }

  heading(): number {
    const f = Quat.rotate(this.body.getTransform().rotation, Vec3.UNIT_X);
    return Math.atan2(-f.z, f.x);
  }

  dispose(): void {
    this.physics.dispose();
  }
}
