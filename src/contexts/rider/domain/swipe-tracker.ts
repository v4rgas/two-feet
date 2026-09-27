/**
 * SWIPE SIZE (MECHANICS.md "Swipe size"): how far one foot travels sideways decides how
 * big its flick or scoop is. `x` is the foot's sideways stick value, stance resolved:
 * −1 = heel edge, +1 = toe edge. The sticks are spring-smoothed keys, so a swipe is a
 * stick trajectory:
 * - it ENDS on the step `x` reaches the far side (|x| ≥ `swipeEndMin`) from outside it;
 * - it STARTS at the opposite extreme `x` reached within the last `swipeLookbackS`
 *   (which may be before the pop);
 * - travel = |x_end − x_start| (0…2): ≥ `swipeMinTravel` is one unit (a flip, a 180
 *   shove), ≥ `swipeDoubleTravel` two (a double flip, a 360 shove).
 * Letting go of a key (x → 0) never reaches the far side, and a position held on the far
 * side does not enter it again, so neither is a swipe.
 */

/** The four swipe tunables (`RiderConfig.tricks`). */
export interface SwipeTuning {
  readonly swipeLookbackS: number;
  readonly swipeEndMin: number;
  readonly swipeMinTravel: number;
  readonly swipeDoubleTravel: number;
}

/** A finished swipe (value object). */
export interface Swipe {
  /** The side it ended on: +1 toe edge, −1 heel edge. */
  readonly edge: -1 | 1;
  /** |x_end − x_start|, 0…2. */
  readonly travel: number;
  /** 1 (a flip / a 180 shove) or 2 (a double flip / a 360 shove). */
  readonly units: 1 | 2;
}

interface Sample {
  readonly tS: number;
  readonly x: number;
}

/** One foot's sideways history and its swipe detector. */
export class SwipeTracker {
  private readonly samples: Sample[] = [];
  private clockS = 0;

  constructor(private readonly tuning: SwipeTuning) {}

  /** Adds this step's `x`; returns the swipe that ended on this step, or null. */
  step(x: number, dtS: number): Swipe | null {
    const { swipeLookbackS, swipeEndMin, swipeMinTravel, swipeDoubleTravel } = this.tuning;
    this.clockS += dtS;
    while ((this.samples[0]?.tS ?? Number.POSITIVE_INFINITY) < this.clockS - swipeLookbackS) {
      this.samples.shift();
    }
    const farSide = (v: number): -1 | 0 | 1 => (v >= swipeEndMin ? 1 : v <= -swipeEndMin ? -1 : 0);
    const side = farSide(x);
    const before = this.samples.at(-1);
    let swipe: Swipe | null = null;
    if (side !== 0 && (before === undefined || farSide(before.x) !== side)) {
      // The opposite extreme within the lookback (in the swipe's own direction).
      let start = side * x;
      for (const s of this.samples) start = Math.min(start, side * s.x);
      const travel = side * x - start;
      if (travel >= swipeMinTravel) {
        swipe = { edge: side, travel, units: travel >= swipeDoubleTravel ? 2 : 1 };
      }
    }
    this.samples.push({ tS: this.clockS, x });
    return swipe;
  }

  reset(): void {
    this.samples.length = 0;
    this.clockS = 0;
  }
}
