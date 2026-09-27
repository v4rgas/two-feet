import { describe, expect, it } from "vitest";
import { SCENARIO_ASSIST_LEVEL } from "./scenario-harness";

/*
 * The scenario suites run twice in `pnpm test` (vitest.config.ts): at `pro` (no assists)
 * and at `normal` (SKATE_ASSIST=normal), the player's default: ADR 0012, "no feel change".
 */
describe("scenario assist level", () => {
  it("follows SKATE_ASSIST (pro when unset)", () => {
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
      ?.env?.SKATE_ASSIST;
    expect(SCENARIO_ASSIST_LEVEL).toBe(env ?? "pro");
  });
});
