import { defineConfig } from "vitest/config";

/** `pnpm test:human`: the human-jitter acceptance of the assists (ADR 0012), ≈ 70 s. */
export default defineConfig({
  test: {
    include: ["src/game/scenarios/human.scenario.test.ts"],
    environment: "node",
    testTimeout: 180_000,
  },
});
