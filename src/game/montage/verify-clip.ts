import type { MontageClip } from "./clip";
import { clipProblems } from "./clip";
import type { ClipOutcome } from "./clip-run";
import { ClipRun } from "./clip-run";

/** Below this speed along the rider heading the board counts as rolling fakie, m/s. */
const FAKIE_MAX_FORWARD_MPS = -0.5;

export interface ClipReport {
  readonly clip: MontageClip;
  /** `pending` clips are run and reported but never fail. */
  readonly status: "pass" | "fail" | "pending";
  /** Why it fails (or would fail, when pending). Empty on a pass. */
  readonly problems: readonly string[];
  readonly outcome: ClipOutcome;
}

/**
 * Runs a clip headless (no rendering) through the real simulation and checks it: the
 * expected trick names land in order, nothing bails, and any "rolling fakie" check holds.
 */
export async function verifyClip(clip: MontageClip): Promise<ClipReport> {
  const problems = clipProblems(clip);
  const run = await ClipRun.create(clip);
  let fakieMps: number | null = null;
  try {
    const fakieAtS = clip.expect.rollsFakieAtS;
    while (!run.done) {
      run.step();
      if (fakieAtS !== undefined && fakieMps === null && run.timeS >= fakieAtS - 1e-9) {
        fakieMps = run.forwardMps();
      }
    }
    const outcome = run.outcome();
    const want = clip.expect.tricks;
    if (outcome.tricks.join(" | ") !== want.join(" | ")) {
      problems.push(`tricks: wanted [${want.join(", ")}], got [${outcome.tricks.join(", ")}]`);
    }
    if (clip.expect.bails === true) {
      if (!outcome.bails.some((b) => b.startsWith("rider bailed"))) {
        problems.push("expected a bail (a ragdoll gag), but the rider never bailed");
      }
    } else {
      for (const bail of outcome.bails) problems.push(bail);
    }
    if (fakieAtS !== undefined && !(fakieMps !== null && fakieMps < FAKIE_MAX_FORWARD_MPS)) {
      problems.push(
        `not rolling fakie at ${fakieAtS} s (speed along heading ${fakieMps?.toFixed(2) ?? "?"} m/s)`,
      );
    }
    const status = clip.pending !== undefined ? "pending" : problems.length === 0 ? "pass" : "fail";
    return { clip, status, problems, outcome };
  } finally {
    run.dispose();
  }
}
