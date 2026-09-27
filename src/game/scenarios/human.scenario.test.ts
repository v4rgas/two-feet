import { describe, expect, it } from "vitest";
import type { MontageClip } from "../montage/clip";
import { railFiftyFifty } from "../montage/clips/grinds";
import { treFlipKicker } from "../montage/clips/ramps";
import { kickflipStairs, stairsTailslideHardflip } from "../montage/clips/stairs";
import type { JitterOptions, JitterRun } from "./human-jitter";
import { HUMAN_JITTER, jitterRuns, landedRate } from "./human-jitter";

/*
 * HUMAN JITTER (MECHANICS.md "Assists" → Acceptance, ADR 0012). Each line is its montage
 * clip, whose timeline is centred the way a person would play it (the middle of each
 * window, full loads, 0.12 s taps). It is played RUNS times with seeded random errors:
 * every key time ± 70 ms, every hold ± 40 ms, the spawn ± 0.2 m sideways and ± 0.3 m/s
 * (`HUMAN_JITTER`). A run lands when it names exactly the line and nothing bails.
 *
 * The floors below sit just under the MEASURED rates, so a change that makes the game
 * harder for people fails here. They are below the spec's first targets: see ADR 0012 for
 * what limits each line (in short, the pop-time window of an air that must clear an
 * obstacle is about 0.2–0.25 s, against ± 0.11 s of pop jitter; the assists act sideways
 * and in time, never along the path). One mode: the assists always on (the pro / normal /
 * easy levels were removed; their last rates are in ADR 0012).
 *
 * | line                               | measured |
 * |------------------------------------|----------|
 * | G4H kickflip → tailslide → hardflip | 20 % |
 * | kickflip down the 5-stair          | 100 % |
 * | ollie to 50-50 on the rail         | 52 % |
 * | 360 flip off the kicker            | 62 % |
 *
 * Each 50-run batch takes ≈ 5–7 s.
 */

const RUNS = 50;
const T = 120_000;

interface Line {
  readonly name: string;
  readonly clip: MontageClip;
  readonly options?: JitterOptions;
  /** Floor: the fraction of runs that must land. */
  readonly floor: number;
}

const LINES: readonly Line[] = [
  {
    name: "G4H: kickflip → FS tailslide → hardflip out (the G4 line)",
    clip: stairsTailslideHardflip,
    floor: 0.18,
  },
  {
    name: "kickflip down the 5-stair",
    clip: kickflipStairs,
    floor: 0.96,
  },
  {
    name: "ollie to 50-50 on the flat rail (either side; balancing like a person)",
    clip: railFiftyFifty,
    options: { names: [/^(FS|BS) 50-50$/], balanceReflex: true },
    floor: 0.48,
  },
  {
    name: "360 flip off the kicker",
    clip: treFlipKicker,
    floor: 0.58,
  },
];

function summary(runs: readonly JitterRun[]): string {
  const failed = runs.filter((r) => !r.landed);
  return `${runs.length - failed.length}/${runs.length} landed; failed seeds ${failed
    .map((r) => r.seed)
    .join(",")}`;
}

describe("human jitter: lines land with sloppy human timing (the assists)", () => {
  it("the jitter is the spec's human model", () => {
    expect(HUMAN_JITTER).toEqual({ keyS: 0.07, holdS: 0.04, lateralM: 0.2, speedMps: 0.3 });
  });

  for (const line of LINES) {
    it(
      `${line.name}: ≥ ${line.floor}`,
      async () => {
        const runs = await jitterRuns(line.clip, RUNS, line.options);
        expect(landedRate(runs), summary(runs)).toBeGreaterThanOrEqual(line.floor);
      },
      T,
    );
  }
});
