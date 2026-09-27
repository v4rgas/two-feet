import { describe, expect, it } from "vitest";
import { RIDER_CONFIG } from "../rider.config";
import type { Swipe } from "./swipe-tracker";
import { SwipeTracker } from "./swipe-tracker";

const DT = 1 / 120;

/** Feeds a stick trajectory (one value per step); returns the swipes with their step index. */
function feed(xs: readonly number[]): { i: number; swipe: Swipe }[] {
  const t = new SwipeTracker(RIDER_CONFIG.tricks);
  const out: { i: number; swipe: Swipe }[] = [];
  xs.forEach((x, i) => {
    const swipe = t.step(x, DT);
    if (swipe !== null) out.push({ i, swipe });
  });
  return out;
}

/** `n` steps easing linearly from `a` to `b` (inclusive of `b`). */
function ramp(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, k) => a + ((b - a) * (k + 1)) / n);
}

const hold = (x: number, n: number): number[] => Array.from({ length: n }, () => x);

describe("SwipeTracker (MECHANICS.md 'Swipe size')", () => {
  it("a swipe from the middle to the far side is one unit, toward that side", () => {
    const swipes = feed([...hold(0, 10), ...ramp(0, -1, 10)]);
    expect(swipes).toHaveLength(1);
    expect(swipes[0]?.swipe.edge).toBe(-1);
    expect(swipes[0]?.swipe.units).toBe(1);
  });

  it("edge to edge within the lookback is two units", () => {
    const swipes = feed([...hold(1, 20), ...ramp(1, -1, 12)]);
    expect(swipes.map((s) => [s.swipe.edge, s.swipe.units])).toEqual([[-1, 2]]);
  });

  it("from the far edge longer ago than the lookback it is one unit", () => {
    const lookbackSteps = Math.ceil(RIDER_CONFIG.tricks.swipeLookbackS / DT);
    const swipes = feed([
      ...hold(1, 20),
      ...ramp(1, 0, 6),
      ...hold(0, lookbackSteps + 5),
      ...ramp(0, -1, 10),
    ]);
    expect(swipes.map((s) => s.swipe.units)).toEqual([1]);
  });

  it("letting go of a key (x → 0) is no swipe, and neither is a held far position", () => {
    expect(feed([...hold(1, 60), ...ramp(1, 0, 12), ...hold(0, 30)])).toEqual([]);
    // Held on the far side from the start: never entered, no swipe.
    expect(feed(hold(-1, 100))).toEqual([]);
  });

  it("a small move that ends on the far side is no swipe (too little travel)", () => {
    const end = RIDER_CONFIG.tricks.swipeEndMin;
    expect(feed([...hold(end - 0.1, 40), ...ramp(end - 0.1, end + 0.05, 4)])).toEqual([]);
  });

  it("the swipe ends once per entry into the far side", () => {
    const swipes = feed([
      ...hold(0, 5),
      ...ramp(0, 1, 10),
      ...hold(1, 20),
      ...ramp(1, 0.9, 3),
      ...hold(0.9, 5),
    ]);
    expect(swipes).toHaveLength(1);
  });
});
