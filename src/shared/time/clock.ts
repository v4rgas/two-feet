/**
 * Clock port: monotonic wall time in seconds. The browser implementation
 * (`performance.now`) lives in `src/game`; tests use `ManualClock`.
 */
export interface Clock {
  nowS(): number;
}

/** Deterministic clock for tests and headless simulations. */
export class ManualClock implements Clock {
  constructor(private timeS = 0) {}

  nowS(): number {
    return this.timeS;
  }

  advance(dtS: number): void {
    if (!(dtS >= 0)) throw new RangeError(`ManualClock can only advance forward, got ${dtS}`);
    this.timeS += dtS;
  }
}
