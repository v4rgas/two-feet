import { bootstrap } from "./game/bootstrap";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (canvas === null) throw new Error('Missing <canvas id="game">');

// The renderer owns canvas sizing (devicePixelRatio capped, resize handling).
const params = new URLSearchParams(window.location.search);
if (import.meta.env.DEV && params.has("demo")) {
  // Dev-only synthetic scene for checking the renderer without physics.
  void import("./game/demo").then(({ startDemo }) => startDemo(canvas, params));
} else {
  bootstrap(canvas).catch((error: unknown) => {
    console.error("Failed to start the game", error);
  });
}
