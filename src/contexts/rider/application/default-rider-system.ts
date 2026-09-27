import type { EventBus } from "../../../shared";
import { Vec3 } from "../../../shared";
import type { BoardSnapshot, RigidBodyHandle } from "../../board";
import type { IntentFrame } from "../../input";
import type { FootForce } from "../domain/foot-force";
import type { DeckGeometry, FootForceModel, RiderControls } from "../domain/foot-force-model";
import { GestureFootForceModel } from "../domain/gesture-foot-force-model";
import { NEUTRAL_CONTROLS, Rider, type RiderChange } from "../domain/rider";
import type { RiderState } from "../domain/rider-state";
import type { RiderConfig } from "../rider.config";
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
  /** Defaults to `GestureFootForceModel`. */
  readonly model?: FootForceModel;
}

/**
 * `RiderSystem` implementation. Holds the `Rider` aggregate and the `FootForceModel`,
 * applies foot forces through the `RigidBodyHandle` port and publishes the rider's
 * domain events. Listens to `BoardLanded` for landing bails.
 */
export class DefaultRiderSystem implements RiderSystem {
  private readonly body: RigidBodyHandle;
  private readonly bus: EventBus;
  private readonly rider: Rider;
  private readonly model: FootForceModel;
  private controls: RiderControls = NEUTRAL_CONTROLS;
  private forces: readonly FootForce[] = [];

  constructor(deps: DefaultRiderSystemDeps) {
    this.body = deps.body;
    this.bus = deps.bus;
    this.rider = new Rider(deps.deck, deps.config, deps.board);
    this.model = deps.model ?? new GestureFootForceModel(deps.deck, deps.config);
    this.bus.subscribe("BoardLanded", (event) => {
      this.publish(this.rider.land(event.upDot), event.tick, event.timeS);
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
    this.forces = this.model.computeForces({
      controls: intents,
      rider: this.rider.state,
      board,
      dtS,
    });
    // These forces act during the step that produces snapshot `board.tick + 1`.
    const tick = board.tick + 1;
    const timeS = board.timeS + dtS;
    for (const f of this.forces) {
      if (f.kind === "force") {
        this.body.applyForceAtPoint(f.forceN, f.pointWorldM);
        continue;
      }
      this.body.applyImpulseAtPoint(f.impulseNs, f.pointWorldM);
      if (f.label === "pop") {
        this.bus.publish({
          type: "BoardPopped",
          tick,
          timeS,
          foot: f.foot,
          impulseNs: Vec3.length(f.impulseNs),
          pointWorldM: f.pointWorldM,
        });
      }
    }
  }

  postPhysics(board: BoardSnapshot, dtS: number): void {
    this.publish(this.rider.update(this.controls, board, dtS), board.tick, board.timeS);
  }

  reset(board: BoardSnapshot): void {
    this.rider.reset(board);
    this.model.reset();
    this.controls = NEUTRAL_CONTROLS;
    this.forces = [];
  }

  private publish(changes: readonly RiderChange[], tick: number, timeS: number): void {
    for (const change of changes) this.bus.publish({ ...change, tick, timeS });
  }
}
