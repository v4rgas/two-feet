import { bootstrap } from "./game/bootstrap";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (canvas === null) throw new Error('Missing <canvas id="game">');

// The renderer owns canvas sizing (devicePixelRatio capped, resize handling).
const params = new URLSearchParams(window.location.search);
if (params.has("montage")) {
  // Montage mode: scripted clips filmed with cinematic cameras (src/game/montage).
  void import("./game/montage/montage-player").then(({ startMontage }) =>
    startMontage(canvas, params),
  );
} else if (import.meta.env.DEV && params.has("demo")) {
  // Dev-only synthetic scene for checking the renderer without physics.
  void import("./game/demo").then(({ startDemo }) => startDemo(canvas, params));
} else {
  bootstrap(canvas)
    .then((loop) => {
      // Dev-only handle for browser checks (read-only getters on the loop).
      if (import.meta.env.DEV) Object.assign(window, { __skate: loop });
    })
    .catch((error: unknown) => {
      console.error("Failed to start the game", error);
    });
}
