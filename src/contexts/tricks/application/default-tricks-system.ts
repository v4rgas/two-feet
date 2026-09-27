import type { EventBus, Stance, Unsubscribe } from "../../../shared";
import type { BoardSnapshot } from "../../board";
import type { AirSession } from "../domain/air-session";
import { DefaultTrickRecognizer } from "../domain/default-trick-recognizer";
import type { RiderPose } from "../domain/rider-frame";
import type { TrickTable } from "../domain/trick-definition";
import type { TrickOutcome, TrickRecognizer } from "../domain/trick-recognizer";
import type { TricksConfig } from "../tricks.config";
import { TRICK_TABLE } from "../tricks.config";
import type { TricksSystem } from "./tricks-system";

export interface DefaultTricksSystemDeps {
  readonly bus: EventBus;
  readonly config: TricksConfig;
  /** The rider's read model, read every step (rider's `RiderSystem` satisfies it). */
  readonly rider: { readonly state: RiderPose };
  /** The stance set in input (input's `InputSystem` satisfies it). */
  readonly stance: { readonly stance: Stance };
  /** Name table; defaults to `TRICK_TABLE`. */
  readonly table?: TrickTable;
  /** Recognizer override (tests). */
  readonly recognizer?: TrickRecognizer;
}

/**
 * Per-tick orchestration of the `tricks` context: feeds the `TrickRecognizer` the fresh
 * snapshot, the rider pose and the stance (loop step 6), hands it every bus event and
 * publishes what it returns (`TrickLanded` / `TrickBailed`), delivered in the same flush.
 */
export class DefaultTricksSystem implements TricksSystem {
  private readonly recognizer: TrickRecognizer;
  private readonly unsubscribe: Unsubscribe;

  constructor(private readonly deps: DefaultTricksSystemDeps) {
    this.recognizer =
      deps.recognizer ??
      new DefaultTrickRecognizer(deps.config, deps.table ?? TRICK_TABLE, deps.stance.stance);
    this.unsubscribe = deps.bus.subscribeAll((event) =>
      this.publish(this.recognizer.onEvent(event)),
    );
  }

  get air(): AirSession | null {
    return this.recognizer.air;
  }

  update(snapshot: BoardSnapshot): void {
    this.recognizer.setStance(this.deps.stance.stance);
    this.publish(this.recognizer.observe(snapshot, this.deps.rider.state));
  }

  reset(): void {
    this.recognizer.reset();
  }

  /** Stops listening to the bus. */
  dispose(): void {
    this.unsubscribe();
  }

  private publish(outcomes: readonly TrickOutcome[]): void {
    for (const outcome of outcomes) this.deps.bus.publish(outcome);
  }
}
