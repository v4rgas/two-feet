import { describe, expect, it } from "vitest";
import type { AssistLevel } from "../../contexts/rider";
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
 * harder for people fails here. They are not all the spec's targets: see ADR 0012 for
 * what limits each line (in short, the pop-time window of an air that must clear an
 * obstacle is about 0.2–0.25 s, against ± 0.11 s of pop jitter; the assists act sideways
 * and in time, never along the path).
 *
 * | line                               | spec (normal) | pro | normal | easy |
 * |------------------------------------|---------------|-----|--------|------|
 * | G4H kickflip → tailslide → hardflip | ≥ 80 %        | 4 % | 14 %   | 20 % |
 * | kickflip down the 5-stair          | ≥ 90 %        | 44 % | 96 %  | 100 % |
 * | ollie to 50-50 on the rail         | ≥ 90 %        | 24 % | 50 %  | 50 % |
 * | 360 flip off the kicker            | ≥ 90 %        | 44 % | 54 %  | 58 % |
 *
 * Each 50-run batch takes ≈ 5–7 s; the whole file ≈ 40 s, so it runs in `pnpm test`.
 */

const RUNS = 50;
const T = 120_000;

interface Line {
  readonly name: string;
  readonly clip: MontageClip;
  readonly options?: JitterOptions;
  /** Floors per level (fraction of runs landed). */
  readonly floors: Partial<Record<AssistLevel, number>>;
}

const LINES: readonly Line[] = [
  {
    name: "G4H: kickflip → FS tailslide → hardflip out (the G4 line)",
    clip: stairsTailslideHardflip,
    floors: { pro: 0.02, normal: 0.12, easy: 0.18 },
  },
  {
    name: "kickflip down the 5-stair",
    clip: kickflipStairs,
    floors: { pro: 0.4, normal: 0.9, easy: 0.95 },
  },
  {
    name: "ollie to 50-50 on the flat rail (either side; balancing like a person)",
    clip: railFiftyFifty,
    options: { names: [/^(FS|BS) 50-50$/], balanceReflex: true },
    floors: { pro: 0.2, normal: 0.46, easy: 0.46 },
  },
  {
    name: "360 flip off the kicker",
    clip: treFlipKicker,
    floors: { pro: 0.42, normal: 0.52, easy: 0.56 },
  },
];

function summary(runs: readonly JitterRun[]): string {
  const failed = runs.filter((r) => !r.landed);
  return `${runs.length - failed.length}/${runs.length} landed; failed seeds ${failed
    .map((r) => r.seed)
    .join(",")}`;
}

describe("human jitter: lines land with sloppy human timing (assists)", () => {
  it("the jitter is the spec's human model", () => {
    expect(HUMAN_JITTER).toEqual({ keyS: 0.07, holdS: 0.04, lateralM: 0.2, speedMps: 0.3 });
  });

  for (const line of LINES) {
    it(
      `${line.name}: pro ≥ ${line.floors.pro}, normal ≥ ${line.floors.normal}, easy ≥ ${line.floors.easy}; the assists never make it worse`,
      async () => {
        const rates: Partial<Record<AssistLevel, number>> = {};
        for (const level of ["pro", "normal", "easy"] as const) {
          const runs = await jitterRuns(line.clip, level, RUNS, line.options);
          rates[level] = landedRate(runs);
          expect(rates[level], `${level}: ${summary(runs)}`).toBeGreaterThanOrEqual(
            line.floors[level] ?? 0,
          );
        }
        expect(rates.normal ?? 0).toBeGreaterThanOrEqual(rates.pro ?? 0);
        expect(rates.easy ?? 0).toBeGreaterThanOrEqual(rates.normal ?? 0);
      },
      T,
    );
  }
});
