import type { EventBus } from "../../../shared";
import { Vec3 } from "../../../shared";
import type { BoardSnapshot, RigidBodyHandle } from "../../board";
import type { IntentFrame } from "../../input";
import type { FootForce } from "../domain/foot-force";
import type {
  BoardMassProperties,
  DeckGeometry,
  FootForceModel,
  GrindEdgeView,
  RiderControls,
} from "../domain/foot-force-model";
import { NEUTRAL_CONTROLS, Rider, type RiderChange } from "../domain/rider";
import type { RiderState } from "../domain/rider-state";
import { TrickController } from "../domain/trick-controller";
import type { AssistLevel, RiderConfig } from "../rider.config";
import type { RiderSystem } from "./rider-system";

/** Everything the rider system needs, injected by the composition root. */
export interface DefaultRiderSystemDeps {
  /** The board's deck body; foot forces are applied to it. */
  readonly body: RigidBodyHandle;
  readonly bus: EventBus;
  /** Deck dimensions (board's `BoardSpec`). */
  readonly deck: DeckGeometry;
  readonly config: RiderConfig;
  /** Snapshot to start from (the spawn pose). */
  readonly board: BoardSnapshot;
  /** Defaults to the MECHANICS.md `TrickController`. */
  readonly model?: FootForceModel;
  /**
   * Height of the ground straight below a point, m (world), or null (nothing below). The
   * composition root implements it with a physics raycast. Absent: flat ground at 0.
   */
  readonly probeGroundY?: (pointWorldM: Vec3) => number | null;
  /**
   * Grind edges whose segment passes within `radiusM` of a point (world), nearest first.
   * The composition root implements it over the level's edges. Absent: none.
   */
  readonly grindEdgesNear?: (pointWorldM: Vec3, radiusM: number) => readonly GrindEdgeView[];
  /** The assist level to start at (ADR 0012). Absent: `pro` (no assists). */
  readonly assistLevel?: AssistLevel;
}

/**
 * `RiderSystem` implementation. Holds the `Rider` aggregate and the `FootForceModel`,
 * applies its forces, impulses and torques through the `RigidBodyHandle` port, tells the
 * aggregate about pops (feet lift) and catches (feet snap on), and publishes the rider's
 * domain events plus `BoardPopped`. Listens to `BoardLanded` for landing outcomes.
 */
export class DefaultRiderSystem implements RiderSystem {
  private readonly body: RigidBodyHandle;
  private readonly bus: EventBus;
  private readonly rider: Rider;
  private readonly model: FootForceModel;
  private readonly config: RiderConfig;
  private readonly mass: BoardMassProperties;
  private controls: RiderControls = NEUTRAL_CONTROLS;
  private forces: readonly FootForce[] = [];
  private lastBoard: BoardSnapshot;
  private readonly probeGroundY: ((pointWorldM: Vec3) => number | null) | undefined;
  private readonly grindEdgesNear:
    | ((pointWorldM: Vec3, radiusM: number) => readonly GrindEdgeView[])
    | undefined;
  /** The trick model reported a loaded pop this step (Q / E wind up). */
  private loading = false;
  assistLevel: AssistLevel;

  constructor(deps: DefaultRiderSystemDeps) {
    this.body = deps.body;
    this.bus = deps.bus;
    this.lastBoard = deps.board;
    this.config = deps.config;
    this.rider = new Rider(deps.deck, deps.config, deps.board);
    this.model = deps.model ?? new TrickController(deps.deck, deps.config);
    this.probeGroundY = deps.probeGroundY;
    this.grindEdgesNear = deps.grindEdgesNear;
    this.assistLevel = deps.assistLevel ?? "pro";
    const body = deps.body;
    this.mass = {
      get massKg() {
        return body.getMassKg();
      },
      get centerOfMassWorldM() {
        return body.getCenterOfMassWorld();
      },
      angularInertiaTimes: (vectorWorld) => body.angularInertiaTimes(vectorWorld),
    };
    this.bus.subscribe("BoardLanded", (event) => {
      // Tilt against the landing surface (a bank, a transition), not world up.
      // Wheels touching the top of a ledge while locked on its edge are no landing.
      if (this.rider.state.grind !== null) return;
      const upDot = event.surfaceUpDot ?? event.upDot;
      this.publish(this.rider.land(upDot, this.lastBoard), event.tick, event.timeS);
    });
  }

  get state(): RiderState {
    return this.rider.state;
  }

  get lastForces(): readonly FootForce[] {
    return this.forces;
  }

  applyIntents(intents: IntentFrame, board: BoardSnapshot, dtS: number): void {
    this.controls = intents;
    const output = this.model.computeForces({
      controls: intents,
      rider: this.rider.state,
      board,
      mass: this.mass,
      dtS,
      groundBelowYM:
        board.grounded || this.probeGroundY === undefined
          ? null
          : this.probeGroundY(board.transform.positionM),
      edgesNear:
        this.grindEdgesNear?.(board.transform.positionM, this.config.grind.queryRadiusM) ?? [],
      assistLevel: this.assistLevel,
    });
    // These act during the step that produces snapshot `board.tick + 1`.
    const tick = board.tick + 1;
    const timeS = board.timeS + dtS;
    // The grind lock first: falling off is a bail, decided this very step.
    const grindChanges = this.rider.setGrind(output.grind ?? null, output.grindExit ?? null);
    if (this.rider.state.bailed) {
      // BAIL = RAGDOLL (MECHANICS.md): from the step the bail is decided until the reset
      // the rider applies nothing at all — no force, no impulse, no pop, no catch.
      this.forces = [];
      this.loading = false;
      this.rider.snapSpinTo(null);
      this.publish(grindChanges, tick, timeS);
      return;
    }
    this.forces = output.forces;
    this.loading = output.loading === true;
    for (const f of this.forces) this.apply(f);
    if (output.popped !== null) {
      const pop = this.forces.find((f) => f.label === "pop" && f.kind === "impulse");
      this.bus.publish({
        type: "BoardPopped",
        tick,
        timeS,
        foot: output.popped === "nose" ? "front" : "back",
        kick: output.popped,
        impulseNs: pop?.kind === "impulse" ? Vec3.length(pop.impulseNs) : 0,
        pointWorldM: pop?.kind === "impulse" ? pop.pointWorldM : board.transform.positionM,
      });
      this.publish(this.rider.liftFeet(output.realignRad ?? 0), tick, timeS);
    }
    if (output.caught) this.publish(this.rider.catchFeet(board), tick, timeS);
    this.rider.snapSpinTo(output.spinSnapHeadingRad ?? null);
    this.publish(grindChanges, tick, timeS);
  }

  postPhysics(board: BoardSnapshot, dtS: number): void {
    this.lastBoard = board;
    this.publish(
      this.rider.update(this.controls, board, dtS, this.loading),
      board.tick,
      board.timeS,
    );
  }

  reset(board: BoardSnapshot): void {
    this.lastBoard = board;
    this.rider.reset(board);
    this.model.reset();
    this.controls = NEUTRAL_CONTROLS;
    this.forces = [];
    this.loading = false;
  }

  private apply(f: FootForce): void {
    switch (f.kind) {
      case "force":
        this.body.applyForceAtPoint(f.forceN, f.pointWorldM);
        break;
      case "impulse":
        this.body.applyImpulseAtPoint(f.impulseNs, f.pointWorldM);
        break;
      case "torque":
        this.body.applyTorque(f.torqueNm);
        break;
      case "angularImpulse":
        this.body.applyTorqueImpulse(f.impulseNms);
        break;
    }
  }

  private publish(changes: readonly RiderChange[], tick: number, timeS: number): void {
    for (const change of changes) this.bus.publish({ ...change, tick, timeS });
  }
}
