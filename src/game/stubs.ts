/*
 * TEMPORARY no-op implementations so the loop compiles and the app boots before the
 * real systems exist. Each context agent replaces its stub in `bootstrap.ts` with
 * the real implementation and deletes the stub from this file.
 */
import type {
  BoardBody,
  BoardSnapshot,
  BoardSystem,
  PhysicsWorld,
  RaycastHit,
  RigidBodyHandle,
} from "../contexts/board";
import { FakeRigidBodyHandle, NO_CONTACT } from "../contexts/board";
import type { FootIntent, InputSystem, IntentFrame, Stance } from "../contexts/input";
import { INPUT_CONFIG, StickValue } from "../contexts/input";
import type { FootForce, FootState, RiderState, RiderSystem } from "../contexts/rider";
import { DeckPosition } from "../contexts/rider";
import type { AirSession, TricksSystem } from "../contexts/tricks";
import type { FootId } from "../shared";
import { Transform, Vec2, Vec3 } from "../shared";

function neutralIntent(foot: FootId): FootIntent {
  return { foot, stick: StickValue.NEUTRAL, stickVelocityPerS: Vec2.ZERO };
}

const NEUTRAL_INTENTS: IntentFrame = {
  front: neutralIntent("front"),
  back: neutralIntent("back"),
  feetDown: false,
  stance: INPUT_CONFIG.stance.defaultStance,
  spin: 0,
};

export class StubInputSystem implements InputSystem {
  readonly lastIntents = NEUTRAL_INTENTS;
  stance: Stance = INPUT_CONFIG.stance.defaultStance;
  step(): IntentFrame {
    return NEUTRAL_INTENTS;
  }
  setStance(stance: Stance): void {
    this.stance = stance;
  }
  reset(): void {}
}

export function restingSnapshot(transform: Transform, tick = 0, timeS = 0): BoardSnapshot {
  return {
    tick,
    timeS,
    transform,
    linearVelocityMps: Vec3.ZERO,
    angularVelocityRadps: Vec3.ZERO,
    contacts: NO_CONTACT,
    wheelsDown: 0,
    grounded: false,
    airtimeS: 0,
    contactPoints: [],
  };
}

export class StubBoardSystem implements BoardSystem {
  readonly body: RigidBodyHandle = new FakeRigidBodyHandle();
  readonly lastForces = [];
  readonly leanRad = 0;
  snapshot: BoardSnapshot;
  private transform: Transform;
  constructor(spawn: Transform) {
    this.transform = spawn;
    this.snapshot = restingSnapshot(spawn);
  }
  prePhysics(): void {}
  postPhysics(tick: number, timeS: number): BoardSnapshot {
    this.snapshot = restingSnapshot(this.transform, tick, timeS);
    return this.snapshot;
  }
  reset(transform: Transform): void {
    this.transform = transform;
    this.snapshot = restingSnapshot(transform);
  }
}

export class StubPhysicsWorld implements PhysicsWorld {
  addStaticCollider(): void {}
  createBoard(): BoardBody {
    return { body: new FakeRigidBodyHandle(), contacts: () => [] };
  }
  step(): void {}
  raycast(): RaycastHit | null {
    return null;
  }
  dispose(): void {}
}

function restingFoot(id: FootId, alongM: number, board: BoardSnapshot): FootState {
  return {
    id,
    contact: "attached",
    riderPosition: DeckPosition.create(alongM, 0),
    deckPosition: DeckPosition.create(alongM, 0),
    pressure: 0,
    positionWorldM: Transform.toWorldPoint(board.transform, Vec3.create(alongM, 0, 0)),
    positionRiderM: Vec3.create(alongM, 0, 0),
    positionBoardM: Vec3.create(alongM, 0, 0),
    detachedForS: 0,
  };
}

export class StubRiderSystem implements RiderSystem {
  state: RiderState;
  readonly lastForces: readonly FootForce[] = [];
  constructor(board: BoardSnapshot) {
    this.state = StubRiderSystem.rest(board);
  }
  private static rest(board: BoardSnapshot): RiderState {
    return {
      front: restingFoot("front", 0.12, board),
      back: restingFoot("back", -0.2, board),
      torsoPositionWorldM: Vec3.add(board.transform.positionM, Vec3.create(0, 0.9, 0)),
      headingRad: 0,
      windUpRad: 0,
      bodySpinRateRadps: 0,
      grind: null,
      lastGrindExit: null,
      popOutTurnRad: 0,
      kickflipFlick: null,
      bailed: false,
    };
  }
  applyIntents(): void {}
  postPhysics(): void {}
  reset(board: BoardSnapshot): void {
    this.state = StubRiderSystem.rest(board);
  }
}

export class StubTricksSystem implements TricksSystem {
  readonly air: AirSession | null = null;
  update(): void {}
  reset(): void {}
}
