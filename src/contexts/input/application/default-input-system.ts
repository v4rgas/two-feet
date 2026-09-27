import type { FootId, Stance } from "../../../shared";
import type { FootIntent, IntentFrame } from "../domain/foot-intent";
import type { ControlCluster, InputSource, StanceRepository } from "../domain/input-source";
import { SpringVirtualStick } from "../domain/spring-virtual-stick";
import { clusterForFoot } from "../domain/stance";
import type { VirtualStick } from "../domain/virtual-stick";
import type { InputConfig } from "../input.config";
import type { InputSystem } from "./input-system";

/** Builds one virtual stick. Injectable so tests (or a gamepad) can swap the smoothing. */
export type VirtualStickFactory = () => VirtualStick;

/**
 * `InputSystem` implementation (loop step 1). One `VirtualStick` per control cluster
 * (the smoothing belongs to the physical keys); the stance decides which cluster is the
 * front foot when the frame is built. Changing stance resets both sticks.
 */
export class DefaultInputSystem implements InputSystem {
  private readonly sticks: Record<ControlCluster, VirtualStick>;
  private currentStance: Stance;
  private last: IntentFrame;

  constructor(
    private readonly source: InputSource,
    private readonly stanceRepository: StanceRepository,
    config: InputConfig,
    createStick: VirtualStickFactory = () => new SpringVirtualStick(config.stick),
  ) {
    this.sticks = { left: createStick(), right: createStick() };
    this.currentStance = stanceRepository.load() ?? config.stance.defaultStance;
    this.last = this.buildFrame(false);
  }

  get lastIntents(): IntentFrame {
    return this.last;
  }

  get stance(): Stance {
    return this.currentStance;
  }

  step(dtS: number): IntentFrame {
    const sample = this.source.sample();
    this.sticks.left.update(sample.left, dtS);
    this.sticks.right.update(sample.right, dtS);
    this.last = this.buildFrame(sample.feetDown);
    return this.last;
  }

  setStance(stance: Stance): void {
    this.stanceRepository.save(stance);
    if (stance === this.currentStance) return;
    this.currentStance = stance;
    this.reset();
  }

  reset(): void {
    this.sticks.left.reset();
    this.sticks.right.reset();
    this.last = this.buildFrame(false);
  }

  private buildFrame(feetDown: boolean): IntentFrame {
    return Object.freeze({
      front: this.intentFor("front"),
      back: this.intentFor("back"),
      feetDown,
      stance: this.currentStance,
    });
  }

  private intentFor(foot: FootId): FootIntent {
    const stick = this.sticks[clusterForFoot(this.currentStance, foot)];
    return Object.freeze({ foot, stick: stick.value, stickVelocityPerS: stick.velocityPerS });
  }
}
