import { CINEMATIC_CONFIG } from "../../presentation/cinematic/cinematic.config";
import { CinematicDirector } from "../../presentation/cinematic/cinematic-director";
import type { TrickCards } from "../../presentation/cinematic/lower-thirds";
import { VideoHud } from "../../presentation/cinematic/video-hud";
import type { RecorderOptions, VideoRecorder } from "../../presentation/cinematic/video-recorder";
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
import type { MontageConfig, VideoFormatId } from "./montage.config";
import { isVideoFormatId, MONTAGE_CONFIG } from "./montage.config";
import type { PromoCardItem, PromoClipItem, PromoSequence } from "./promo";
import { promoById } from "./promo";
import { StepClock } from "./step-clock";

/*
 * MONTAGE MODE (`?montage`, `?montage=<clip>[,<clip>…]`, `?montage=<promo>`, `&pads`,
 * `&record`, `&format`). Plays clips through the real simulation (ClipRun:
 * ScriptedInputSource → input → rider → Rapier → tricks), films them with the cinematic
 * director and draws the video HUD. A PROMO id (`promo/`, e.g. `promo-linkedin`) plays its
 * clips and cards back to back as one video, with its on-screen text. With `&record` it
 * records the canvas plus the HUD, composited into a fixed frame (`&format=720p` (default),
 * `16x9` 1920×1080, `4x5` 1080×1350, `1x1`; a promo defaults to its own format).
 * Deterministic modes run exactly 1/fps × time scale of simulation per video frame, driven
 * by a task loop (not requestAnimationFrame), so a minimized window records the same video:
 *   - `&record=frames`: each frame is a PNG POSTed to the dev server, which encodes them
 *     with ffmpeg (montage-save-plugin.mjs): VP9 WebM, or H.264 MP4 for a promo.
 *     Immune to browser throttling.
 *   - `&record=webcodecs`: WebCodecs VideoEncoder with explicit timestamps + a WebM muxer,
 *     all in the page (needs a visible window: Chrome throttles encoders when minimized).
 *   - `&record=realtime`: canvas.captureStream(60) + MediaRecorder at wall-clock speed.
 *   - `&record`: frames when the dev server has ffmpeg, else webcodecs, else realtime.
 * The video and a few stills are saved by the dev server (MONTAGE_OUT_DIR, default
 * ./recordings), or downloaded when there is no dev server.
 */

export type RecordMode = "off" | "auto" | "frames" | "webcodecs" | "realtime";

/** One thing to play: a clip (with a promo's text, or the montage's title card) or a card. */
export type PlayItem =
  | (Omit<PromoClipItem, "tricks"> & {
      readonly tricks?: TrickCards;
      /** Show the clip's title card (the montage), not in a promo. */
      readonly showTitle: boolean;
    })
  | PromoCardItem;

export interface MontageOptions {
  readonly clips: readonly MontageClip[];
  /** What plays, in order: the clips (montage), or a promo's clips and cards. */
  readonly items: readonly PlayItem[];
  /** The promo being played, or null (a montage of clips). */
  readonly promo: PromoSequence | null;
  /** Ids that were asked for but do not exist. */
  readonly unknown: readonly string[];
  readonly record: RecordMode;
  readonly pads: boolean;
  /** Output frame (`&format=`; else a promo's own format, else the 1280×720 default). */
  readonly format: VideoFormatId;
}

/**
 * Reads `?montage[=ids]&pads&record[=frames|webcodecs|realtime]&format=<id>`. A single id
 * may be a promo sequence (`?montage=promo-linkedin`): its clips and cards play as one video.
 */
export function montageOptionsFromUrl(
  params: URLSearchParams,
  config: MontageConfig = MONTAGE_CONFIG,
): MontageOptions {
  const ids = (params.get("montage") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const promo = ids.length === 1 ? (promoById(ids[0] ?? "") ?? null) : null;
  const found = promo !== null ? [] : ids.map((id) => clipById(id));
  let clips: readonly MontageClip[];
  let items: PlayItem[];
  if (promo !== null) {
    clips = promo.items.flatMap((i) => (i.kind === "clip" ? [i.clip] : []));
    items = promo.items.map((i) => (i.kind === "clip" ? { ...i, showTitle: false } : i));
  } else {
    clips = ids.length === 0 ? MONTAGE_CLIPS : found.filter((c) => c !== undefined);
    items = clips.map((clip) => ({ kind: "clip", clip, showTitle: true }));
  }
  const record = params.get("record");
  const asked = params.get("format");
  const format =
    asked !== null && isVideoFormatId(asked, config) ? asked : (promo?.format ?? "720p");
  return {
    clips,
    items,
    promo,
    unknown: ids.filter((_, i) => promo === null && found[i] === undefined),
    record:
      record === null
        ? "off"
        : record === "frames" || record === "webcodecs" || record === "realtime"
          ? record
          : "auto",
    pads: params.has("pads"),
    format,
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

/**
 * Opacity of the fade to black at video time `videoS` into a clip at sim time `simS` (a
 * card: both are its video time). Fades in over `fadeInS` and out over `fadeOutS` (0 = a
 * cut), video s; the fade-out is measured on the item's own clock.
 */
export function fadeAt(
  videoS: number,
  simS: number,
  durationS: number,
  fadeInS: number,
  fadeOutS: number = fadeInS,
): number {
  const fadeIn = fadeInS <= 0 ? 0 : 1 - videoS / fadeInS;
  const fadeOut = fadeOutS <= 0 ? 0 : 1 - (durationS - simS) / fadeOutS;
  return Math.min(1, Math.max(0, fadeIn, fadeOut));
}

/** The raw keys a clip's timeline holds at clip time `tS` (what the input is fed). */
export function keysDownAt(clip: MontageClip, tS: number): Set<string> {
  const down = new Set<string>();
  for (const k of clip.keys) if (tS >= k.atS - 1e-9 && tS < k.atS + k.holdS) down.add(k.code);
  return down;
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
  rec: RecorderOptions & { readonly serverUrl: string },
  /** File name without extension: the frames recorder writes `.mp4` (H.264) or `.webm`. */
  videoBase: string,
  mp4: boolean,
): Promise<VideoRecorder | null> {
  if (mode === "off") return null;
  if (mode === "frames" || (mode === "auto" && (await frameServerAvailable(rec.serverUrl)))) {
    const name = `${videoBase}.${mp4 ? "mp4" : "webm"}`;
    return createServerFrameRecorder(rec, { baseUrl: rec.serverUrl, name });
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
  const options = montageOptionsFromUrl(params, config);
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
    if (options.items.length === 0) {
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
  const { width, height } = config.record.formats[options.format];
  const rec = { ...config.record, width, height };
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
  await Promise.all([waitForFonts(), hud.preload()]);

  // The recording frame: the WebGL canvas scaled into the fixed output frame, plus the HUD.
  const frameCanvas = document.createElement("canvas");
  frameCanvas.width = rec.width;
  frameCanvas.height = rec.height;
  const frameCtx = frameCanvas.getContext("2d", { willReadFrequently: true });
  if (frameCtx === null) throw new Error("No 2D context for the recording frame");

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const base =
    options.promo !== null ? `${options.promo.id}-${options.format}` : `montage-${options.format}`;
  const videoBase = `${base}-${stamp}`;
  // A promo is for posting: H.264 MP4 (with the frames recorder); the montage stays WebM.
  const mp4 = options.promo !== null;
  const recorder = await createRecorder(options.record, frameCanvas, rec, videoBase, mp4);
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

  const stillCounts = new Map<string, number>();
  /** Composites and records one frame, and saves a still when one is due. */
  const emit = async (stills: number[], itemTimeS: number, stillName: string): Promise<void> => {
    if (recording) {
      hud.composite(renderer.domElement, frameCtx);
      await recorder?.addFrame(frameCanvas, frameIndex);
      if (stills.length > 0 && itemTimeS >= (stills[0] ?? Infinity) - 1e-9) {
        stills.shift();
        const n = (stillCounts.get(stillName) ?? 0) + 1;
        stillCounts.set(stillName, n);
        const png = new Blob([canvasPngBytes(frameCanvas) as BlobPart], { type: "image/png" });
        status.saved.push(await save(png, `${stillName}-${n}.png`, config));
      }
    }
    frameIndex += 1;
    status.frame = frameIndex;
  };

  const clipTotal = options.items.filter((i) => i.kind === "clip").length;
  status.state = "playing";
  do {
    let clipIndex = 0;
    for (const item of options.items) {
      const fadeInS = item.fadeInS ?? config.fadeS;
      const fadeOutS = item.fadeOutS ?? config.fadeS;
      if (item.kind === "card") {
        status.clip = item.id;
        hud.startCard(item.card, item.overlays);
        const stills = recording ? [...(item.stillsAtS ?? [])] : [];
        const frames = Math.round(item.durationS * rec.fps);
        let videoS = 0;
        for (let f = 0; f < frames; f += 1) {
          const dtS = f === 0 ? 0 : await nextFrame();
          videoS += dtS;
          const fade = fadeAt(videoS, videoS, item.durationS, fadeInS, fadeOutS);
          hud.update(null, dtS, fade, videoS);
          hud.drawOverlay(canvas);
          await emit(stills, videoS, `${base}-${item.id}`);
        }
        continue;
      }
      const clip = item.clip;
      status.clip = clip.id;
      const run = await ClipRun.create(clip);
      try {
        renderer.setup({ boardSpec: run.sim.spec, level: run.level });
        director.start(clip.shots);
        hud.startClip(item.showTitle ? clip.title : "", clipIndex, clipTotal, {
          ...(item.tricks === undefined ? {} : { tricks: item.tricks }),
          overlays: item.overlays ?? [],
          sticks: item.sticks ?? "off",
        });
        clipIndex += 1;
        // A clip that enters mid-action: simulate (unfilmed) up to its start.
        const startAtS = item.startAtS ?? 0;
        while (run.timeS < startAtS - 1e-9 && !run.done) run.step();
        const clock = new StepClock(run.stepS);
        let stills: number[] = [];
        if (recording) {
          stills =
            options.promo !== null ? [...(item.stillsAtS ?? [])] : grabTimesS(clip, rec.grabAt);
        }
        const stillName = options.promo !== null ? `${base}-${clip.id}` : clip.id;
        let videoS = 0;
        let first = true;
        while (!run.done) {
          // Only the video's very first frame is a still (dt 0): a clip that follows another
          // starts one frame in, so each item lasts exactly its video length (cuts on the beat).
          const dtS = first && frameIndex === 0 ? 0 : await nextFrame();
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
          const fade = fadeAt(videoS, clipTimeS, clip.durationS, fadeInS, fadeOutS);
          hud.update(frame, dtS, fade, clipTimeS, keysDownAt(clip, run.timeS));
          hud.drawOverlay(canvas);
          await emit(stills, clipTimeS, stillName);
        }
      } finally {
        run.dispose();
      }
    }
  } while (!recording);

  if (recorder !== null) {
    status.state = "encoding";
    const video = await recorder.finish();
    status.saved.push(
      "path" in video ? video.path : await save(video.blob, `${videoBase}.webm`, config),
    );
  }
  renderer.setMontageOverrides(null, null);
  status.state = "done";
}
