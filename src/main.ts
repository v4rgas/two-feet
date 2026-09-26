import { bootstrap } from "./game/bootstrap";

const canvas = document.querySelector<HTMLCanvasElement>("#game");
if (canvas === null) throw new Error('Missing <canvas id="game">');

const resize = (): void => {
  canvas.width = window.innerWidth * window.devicePixelRatio;
  canvas.height = window.innerHeight * window.devicePixelRatio;
};
window.addEventListener("resize", resize);
resize();

bootstrap(canvas);
