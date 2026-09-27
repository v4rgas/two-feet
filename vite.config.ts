import { defineConfig } from "vite";
import { montageSavePlugin } from "./montage-save-plugin.mjs";

export default defineConfig({
  plugins: [montageSavePlugin()],
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
