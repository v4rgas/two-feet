import { defineConfig } from "vitest/config";

/** `pnpm montage:verify`: the montage clips, run headless (see src/game/montage). */
export default defineConfig({
  test: {
    include: ["src/**/*.verify.ts"],
    environment: "node",
    silent: false,
  },
});
