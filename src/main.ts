import { dismissBootScreen } from "./game/boot-screen";
import { bootstrap } from "./game/bootstrap";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (canvas === null) throw new Error('Missing <canvas id="game">');

// The renderer owns canvas sizing (devicePixelRatio capped, resize handling).
const params = new URLSearchParams(window.location.search);
if (import.meta.env.DEV && params.has("montage")) {
  // Dev-only montage mode: scripted clips filmed with cinematic cameras (src/game/montage).
  dismissBootScreen();
  void import("./game/montage/montage-player").then(({ startMontage }) =>
    startMontage(canvas, params),
  );
} else if (import.meta.env.DEV && params.has("demo")) {
  // Dev-only synthetic scene for checking the renderer without physics.
  dismissBootScreen();
  void import("./game/demo").then(({ startDemo }) => startDemo(canvas, params));
} else {
  bootstrap(canvas)
    .then((handle) => {
      // Dev-only handle for browser checks (the shell, frame stepping, leak counts).
      if (import.meta.env.DEV) Object.assign(window, { __skate: handle });
    })
    .catch((error: unknown) => {
      dismissBootScreen();
      console.error("Failed to start the game", error);
    });
}
