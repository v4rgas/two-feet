import { defineConfig } from "vitest/config";

/**
 * `pnpm test`: every test, with the scenarios at the `pro` assist level (no assists), plus
 * the scenario suites again at `normal` (the player's default level: ADR 0012, "no feel
 * change" — every existing scenario must pass at both). The human-jitter acceptance
 * (≈ 70 s) runs separately: `pnpm test:human` (vitest.human.config.ts).
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "pro",
          include: ["src/**/*.test.ts"],
          exclude: ["src/game/scenarios/human.scenario.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "normal",
          include: ["src/game/scenarios/*.scenario.test.ts"],
          exclude: ["src/game/scenarios/human.scenario.test.ts"],
          environment: "node",
          env: { SKATE_ASSIST: "normal" },
        },
      },
    ],
  },
});
