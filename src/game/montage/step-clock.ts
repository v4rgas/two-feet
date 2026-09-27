/** Tolerance on step boundaries, s (keeps 1/60 = 2 × 1/120 exact under float sums). */
const EPS_S = 1e-9;

/**
 * Turns VIDEO time into whole fixed SIMULATION steps, with a time scale for slow motion.
 * Physics always steps at exactly `stepS` (1/120 s); slow motion only changes how many
 * steps a video frame runs (at 60 fps: 2 per frame at 1×, one every other frame at 0.25×),
 * and `alpha` interpolates the rendering between the last two steps.
 */
export class StepClock {
  private accumulatedS = 0;

  constructor(private readonly stepS: number) {}

  /** Steps to run for `videoDtS` of video at time scale `scale` (simulation s per video s). */
  advance(videoDtS: number, scale: number): number {
    this.accumulatedS += Math.max(0, videoDtS) * Math.max(0, scale);
    const steps = Math.floor((this.accumulatedS + EPS_S) / this.stepS);
    this.accumulatedS = Math.max(0, this.accumulatedS - steps * this.stepS);
    return steps;
  }

  /** Simulation time past the last step, as a fraction of a step in [0, 1). */
  get alpha(): number {
    return Math.min(0.999, Math.max(0, this.accumulatedS / this.stepS));
  }

  /** Simulation time past the last step, s. */
  get remainderS(): number {
    return this.accumulatedS;
  }

  reset(): void {
    this.accumulatedS = 0;
  }
}
