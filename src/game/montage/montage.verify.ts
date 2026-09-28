/*
 * `pnpm montage:verify`: runs every montage clip headless through the real simulation
 * (ScriptedInputSource → input → rider → Rapier → tricks, no rendering) and asserts that
 * the expected tricks land and nothing bails. Pending clips are run and reported, not
 * asserted. This is the loop for tuning clip timelines. Not part of `pnpm test` (it is
 * a `.verify.ts`, run by `vitest.montage.config.ts`).
 */
import { describe, expect, it } from "vitest";
import { MONTAGE_CLIPS } from "./clips";
import type { ClipReport } from "./verify-clip";
import { verifyClip } from "./verify-clip";

const TIMEOUT_MS = 60_000;
// `CLIP=<id> pnpm montage:verify` runs one clip (vitest exposes the environment here).
const ONLY = import.meta.env.CLIP as string | undefined;

function line(r: ClipReport): string {
  const tricks = r.outcome.tricks.length > 0 ? r.outcome.tricks.join(", ") : "-";
  const head = `${r.status.toUpperCase().padEnd(7)} ${r.clip.id.padEnd(26)} landed: ${tricks}`;
  const why = r.problems.map((p) => `\n          ${p}`).join("");
  const pending = r.clip.pending !== undefined ? `\n          pending: ${r.clip.pending}` : "";
  return head + why + pending;
}

describe("montage clips land with real inputs", () => {
  const clips = MONTAGE_CLIPS.filter((c) => ONLY === undefined || c.id === ONLY);
  for (const clip of clips) {
    it(
      `${clip.id}${clip.pending !== undefined ? " (pending)" : ""}`,
      async () => {
        const report = await verifyClip(clip);
        console.log(line(report));
        if (report.status !== "pending") expect(report.problems).toEqual([]);
      },
      TIMEOUT_MS,
    );
  }
});
