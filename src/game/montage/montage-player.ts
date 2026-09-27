import { CINEMATIC_CONFIG } from "../../presentation/cinematic/cinematic.config";
import { CinematicDirector } from "../../presentation/cinematic/cinematic-director";
import { VideoHud } from "../../presentation/cinematic/video-hud";
import type { VideoRecorder } from "../../presentation/cinematic/video-recorder";
import {
  canvasPngBytes,
  createMediaRecorder,
  createServerFrameRecorder,
  createWebCodecsRecorder,
  frameServerAvailable,
} from "../../presentation/cinematic/video-recorder";
import { PRESENTATION_CONFIG } from "../../presentation/presentation.config";
import type { RenderFrame } from "../../presentation/render-frame";
import { ThreeRenderer } from "../../presentation/three-renderer";
import type { MontageClip } from "./clip";
import { timeScaleAt } from "./clip";
import { ClipRun } from "./clip-run";
import { clipById, MONTAGE_CLIPS } from "./clips";
import type { MontageConfig } from "./montage.config";
import { MONTAGE_CONFIG } from "./montage.config";
import { StepClock } from "./step-clock";

/*
 * MONTAGE MODE (`?montage`, `?montage=<clip>[,<clip>…]`, `&pads`, `&record`). Plays clips
 * through the real simulation (ClipRun: ScriptedInputSource → input → rider → Rapier →
 * tricks), films them with the cinematic director and draws the video HUD. With `&record`
 * it records the canvas plus the HUD (composited into a fixed 1280×720 frame) to a WebM.
 * Deterministic modes run exactly 1/fps × time scale of simulation per video frame, driven
 * by a task loop (not requestAnimationFrame), so a minimized window records the same video:
 *   - `&record=frames`: each frame is a PNG POSTed to the dev server, which encodes them
 *     with ffmpeg (montage-save-plugin.mjs). Immune to browser throttling.
 *   - `&record=webcodecs`: WebCodecs VideoEncoder with explicit timestamps + a WebM muxer,
 *     all in the page (needs a visible window: Chrome throttles encoders when minimized).
 *   - `&record=realtime`: canvas.captureStream(60) + MediaRecorder at wall-clock speed.
 *   - `&record`: frames when the dev server has ffmpeg, else webcodecs, else realtime.
 * The video and a few frame grabs are saved by the dev server (MONTAGE_OUT_DIR, default
 * ./recordings), or downloaded when there is no dev server.
 */

export type RecordMode = "off" | "auto" | "frames" | "webcodecs" | "realtime";

export interface MontageOptions {
  readonly clips: readonly MontageClip[];
  /** Ids that were asked for but do not exist. */
  readonly unknown: readonly string[];
  readonly record: RecordMode;
  readonly pads: boolean;
}

/** Reads `?montage[=ids]&pads&record[=realtime]`. */
export function montageOptionsFromUrl(params: URLSearchParams): MontageOptions {
  const ids = (params.get("montage") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const found = ids.map((id) => clipById(id));
  const clips = ids.length === 0 ? MONTAGE_CLIPS : found.filter((c) => c !== undefined);
  const record = params.get("record");
  return {
    clips,
    unknown: ids.filter((_, i) => found[i] === undefined),
    record:
      record === null
        ? "off"
        : record === "frames" || record === "webcodecs" || record === "realtime"
          ? record
          : "auto",
    pads: params.has("pads"),
  };
}

/** Status for automation (`window.__montage`), e.g. the devtools recording session. */
export interface MontageStatus {
  state: "loading" | "playing" | "encoding" | "done" | "error";
  clip: string;
  frame: number;
  recorder: string;
  saved: string[];
  error: string | null;
}

/** Sim-time instants to grab a still at, for a clip. */
export function grabTimesS(clip: MontageClip, fractions: readonly number[]): number[] {
  const w = clip.slowMotion?.[0];
  const [from, to] = w === undefined ? [0, clip.durationS] : [w.fromS, w.toS];
  return fractions.map((f) => from + (to - from) * f);
}

/** Opacity of the fade to black at video time `videoS` into a clip at sim time `simS`. */
export function fadeAt(videoS: number, simS: number, durationS: number, fadeS: number): number {
  if (fadeS <= 0) return 0;
  const fadeIn = 1 - videoS / fadeS;
  const fadeOut = 1 - (durationS - simS) / fadeS;
  return Math.min(1, Math.max(0, fadeIn, fadeOut));
}

/** Waits for the next task (MessageChannel: not throttled in background tabs, unlike timers). */
function nextTask(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => resolve();
    channel.port2.postMessage(null);
  });
}

function nextAnimationFrame(): Promise<number> {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

async function waitForFonts(): Promise<void> {
  const loads = [
    "800 40px Inter",
    "700 20px Inter",
    "600 14px Inter",
    "600 13px 'JetBrains Mono'",
  ].map((f) => document.fonts.load(f).catch(() => []));
  await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 3000))]);
}

async function save(blob: Blob, name: string, config: MontageConfig): Promise<string> {
  try {
    const url = `${config.record.serverUrl}/save?name=${encodeURIComponent(name)}`;
    const response = await fetch(url, { method: "POST", body: blob });
    if (response.ok) {
      const body = (await response.json()) as { path?: string };
      return body.path ?? name;
    }
  } catch {
    // No dev server endpoint (production build): download instead.
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  return `download:${name}`;
}

/** Picks the recorder for a mode (see the header comment). */
async function createRecorder(
  mode: RecordMode,
  frameCanvas: HTMLCanvasElement,
  config: MontageConfig,
  videoName: string,
): Promise<VideoRecorder | null> {
  const rec = config.record;
  if (mode === "off") return null;
  if (mode === "frames" || (mode === "auto" && (await frameServerAvailable(rec.serverUrl)))) {
    return createServerFrameRecorder(rec, { baseUrl: rec.serverUrl, name: videoName });
  }
  if (mode === "webcodecs" || mode === "auto") {
    const recorder = await createWebCodecsRecorder(rec);
    if (recorder !== null) return recorder;
  }
  return createMediaRecorder(frameCanvas, rec);
}

/** Boots montage mode on the game canvas. */
export async function startMontage(
  canvas: HTMLCanvasElement,
  params: URLSearchParams,
  config: MontageConfig = MONTAGE_CONFIG,
): Promise<MontageStatus> {
  const options = montageOptionsFromUrl(params);
  const status: MontageStatus = {
    state: "loading",
    clip: "",
    frame: 0,
    recorder: "none",
    saved: [],
    error: null,
  };
  Object.assign(window, { __montage: status });
  try {
    if (options.clips.length === 0) {
      throw new Error(`No montage clip matches "${options.unknown.join(", ")}"`);
    }
    await play(canvas, options, config, status);
  } catch (error) {
    status.state = "error";
    status.error = error instanceof Error ? error.message : String(error);
    console.error("Montage failed", error);
  }
  return status;
}

async function play(
  canvas: HTMLCanvasElement,
  options: MontageOptions,
  config: MontageConfig,
  status: MontageStatus,
): Promise<void> {
  const rec = config.record;
  const recording = options.record !== "off";
  if (recording) {
    document.body.classList.add("skate-montage-record");
    canvas.style.width = `${rec.width}px`;
    canvas.style.height = `${rec.height}px`;
  }
  const renderer = new ThreeRenderer({ canvas, config: PRESENTATION_CONFIG });
  window.dispatchEvent(new Event("resize"));
  const parent = canvas.parentElement ?? document.body;
  const hud = new VideoHud(parent, PRESENTATION_CONFIG, CINEMATIC_CONFIG, { pads: options.pads });
  const director = new CinematicDirector(PRESENTATION_CONFIG.camera, CINEMATIC_CONFIG);
  await waitForFonts();

  // The recording frame: the WebGL canvas scaled into a fixed 16:9 frame, plus the HUD.
  const frameCanvas = document.createElement("canvas");
  frameCanvas.width = rec.width;
  frameCanvas.height = rec.height;
  const frameCtx = frameCanvas.getContext("2d", { willReadFrequently: true });
  if (frameCtx === null) throw new Error("No 2D context for the recording frame");

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const videoName = `montage-${stamp}.webm`;
  const recorder = await createRecorder(options.record, frameCanvas, config, videoName);
  const deterministic = recorder !== null && recorder.kind !== "mediarecorder";
  status.recorder = recorder?.kind ?? "none";

  let frameIndex = 0;
  let lastWallMs: number | null = null;
  let sliceStartMs = performance.now();
  /** Waits for the next frame's turn; returns its video dt. */
  const nextFrame = async (): Promise<number> => {
    if (deterministic) {
      // Frames are produced back to back in long tasks: a minimized window wakes a page
      // about once a second, so yielding per frame would record at ~1 fps. Yield now and
      // then so the page (and the encoder) can still breathe.
      if (performance.now() - sliceStartMs > config.recordSliceMs) {
        await nextTask();
        sliceStartMs = performance.now();
      }
      return 1 / rec.fps;
    }
    const now = await nextAnimationFrame();
    const dt = lastWallMs === null ? 1 / rec.fps : (now - lastWallMs) / 1000;
    lastWallMs = now;
    return Math.min(config.maxLiveFrameS, dt);
  };

  status.state = "playing";
  do {
    for (const [index, clip] of options.clips.entries()) {
      status.clip = clip.id;
      const run = await ClipRun.create(clip);
      try {
        renderer.setup({ boardSpec: run.sim.spec, level: run.level });
        director.start(clip.shots);
        hud.startClip(clip.title, index, options.clips.length);
        const clock = new StepClock(run.stepS);
        const grabs = recording ? grabTimesS(clip, rec.grabAt) : [];
        let videoS = 0;
        let first = true;
        while (!run.done) {
          const dtS = first ? 0 : await nextFrame();
          first = false;
          videoS += dtS;
          const steps = clock.advance(dtS, timeScaleAt(clip, run.timeS));
          for (let i = 0; i < steps && !run.done; i += 1) run.step();
          const frame: RenderFrame = { ...run.sim.loop.buildFrame(), alpha: clock.alpha };
          const clipTimeS = run.timeS + clock.remainderS;
          const aspect = recording
            ? rec.width / rec.height
            : canvas.clientWidth / Math.max(1, canvas.clientHeight);
          const pose = director.update(frame, clipTimeS, dtS, aspect);
          renderer.setMontageOverrides(pose, dtS);
          renderer.render(frame);
          hud.update(frame, dtS, fadeAt(videoS, clipTimeS, clip.durationS, config.fadeS));
          hud.drawOverlay(canvas);
          if (recording) {
            hud.composite(renderer.domElement, frameCtx);
            await recorder?.addFrame(frameCanvas, frameIndex);
            if (grabs.length > 0 && clipTimeS >= (grabs[0] ?? Infinity)) {
              const n = rec.grabAt.length - grabs.length + 1;
              grabs.shift();
              const png = new Blob([canvasPngBytes(frameCanvas) as BlobPart], {
                type: "image/png",
              });
              status.saved.push(await save(png, `${clip.id}-${n}.png`, config));
            }
          }
          frameIndex += 1;
          status.frame = frameIndex;
        }
      } finally {
        run.dispose();
      }
    }
  } while (!recording);

  if (recorder !== null) {
    status.state = "encoding";
    const video = await recorder.finish();
    status.saved.push("path" in video ? video.path : await save(video.blob, videoName, config));
  }
  renderer.setMontageOverrides(null, null);
  status.state = "done";
}
