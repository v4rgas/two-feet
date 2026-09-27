import { defineConfig } from "vitest/config";

/**
 * `pnpm test`: every test, in the game's one mode (the assists always on: ADR 0012). The
 * human-jitter acceptance (≈ 30 s) runs separately: `pnpm test:human`
 * (vitest.human.config.ts).
 */
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/game/scenarios/human.scenario.test.ts"],
    environment: "node",
    // Board-only Rapier scenarios take a few seconds each; under a full parallel run they
    // can pass the 5 s default.
    testTimeout: 20_000,
  },
});
