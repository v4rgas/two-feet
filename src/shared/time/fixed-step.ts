/** Options for `FixedStepAccumulator`. */
export interface FixedStepOptions {
  /** Fixed simulation step, s (the game uses 1/120). */
  readonly stepS: number;
  /**
   * Max steps returned by one `advance` call. Extra accumulated time is dropped
   * (avoids the "spiral of death" after a tab switch or a long frame).
   */
  readonly maxStepsPerAdvance: number;
}

/** Tolerance so that summing N × stepS yields exactly N steps despite float error. */
const STEP_EPSILON = 1e-9;

/**
 * Fixed-timestep accumulator ("Fix your timestep"). Feed it real elapsed time each
 * render frame; it tells you how many fixed steps to simulate and the interpolation
 * factor `alpha` between the previous and the current simulated state.
 */
export class FixedStepAccumulator {
  readonly stepS: number;
  readonly maxStepsPerAdvance: number;
  private accumulatorS = 0;
  private droppedTotalS = 0;

  constructor(options: FixedStepOptions) {
    if (!(options.stepS > 0) || !Number.isFinite(options.stepS)) {
      throw new RangeError(`stepS must be a positive finite number, got ${options.stepS}`);
    }
    if (!Number.isInteger(options.maxStepsPerAdvance) || options.maxStepsPerAdvance < 1) {
      throw new RangeError(
        `maxStepsPerAdvance must be a positive integer, got ${options.maxStepsPerAdvance}`,
      );
    }
    this.stepS = options.stepS;
    this.maxStepsPerAdvance = options.maxStepsPerAdvance;
  }

  /**
   * Adds `elapsedS` of real time and returns how many fixed steps to run now.
   * Negative or non-finite input is treated as 0.
   */
  advance(elapsedS: number): number {
    const dt = Number.isFinite(elapsedS) && elapsedS > 0 ? elapsedS : 0;
    this.accumulatorS += dt;
    let steps = Math.floor(this.accumulatorS / this.stepS + STEP_EPSILON);
    if (steps > this.maxStepsPerAdvance) {
      const dropped = (steps - this.maxStepsPerAdvance) * this.stepS;
      this.droppedTotalS += dropped;
      this.accumulatorS -= dropped;
      steps = this.maxStepsPerAdvance;
    }
    this.accumulatorS = Math.max(0, this.accumulatorS - steps * this.stepS);
    return steps;
  }

  /** Interpolation factor in [0, 1): how far real time is between the last two steps. */
  get alpha(): number {
    return Math.min(this.accumulatorS / this.stepS, 1 - STEP_EPSILON);
  }

  /** Total simulated time discarded because of `maxStepsPerAdvance`, s. */
  get droppedS(): number {
    return this.droppedTotalS;
  }

  reset(): void {
    this.accumulatorS = 0;
  }
}
