import type { EncodedFrame } from "./webm-muxer";
import { muxWebm } from "./webm-muxer";

/** The finished video: a blob to save, or the path where a server already wrote it. */
export type RecordingResult = { readonly blob: Blob } | { readonly path: string };

/**
 * Records composited frames to a WebM video.
 * - "frames": deterministic; each frame is a PNG sent to the dev server, which encodes
 *   them with ffmpeg at exactly `fps`. Works in a minimized window, where Chrome throttles
 *   the browser's own encoders (WebCodecs, toBlob) to about one frame per second.
 * - "webcodecs": deterministic in the browser (explicit timestamps + a WebM muxer).
 * - "mediarecorder": real-time capture (`captureStream` + `MediaRecorder`).
 */
export interface VideoRecorder {
  readonly kind: "frames" | "webcodecs" | "mediarecorder";
  /** Adds frame number `index` (shown at `index / fps`), drawn on `source`. */
  addFrame(source: HTMLCanvasElement, index: number): Promise<void>;
  finish(): Promise<RecordingResult>;
}

export interface RecorderOptions {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly bitrate: number;
  /** A keyframe every this many frames. */
  readonly keyframeEvery: number;
}

/** Codecs tried in order (WebCodecs codec string → Matroska codec id). */
const CODECS = [
  { codec: "vp09.00.10.08", codecId: "V_VP9" },
  { codec: "vp8", codecId: "V_VP8" },
] as const;

/** Encoder queue length above which `addFrame` waits (keeps memory bounded). */
const MAX_QUEUE = 6;

/** Frame uploads allowed in flight before `addFrame` waits for half of them. */
const MAX_UPLOADS_IN_FLIGHT = 240;

/**
 * DETERMINISTIC recorder: WebCodecs `VideoEncoder` with explicit timestamps (frame n at
 * n / fps) and a WebM muxer. Wall time never enters the video, so a throttled or hidden
 * tab still records every frame at the right time. Null when WebCodecs (or VP9 / VP8
 * encoding) is not available.
 */
export async function createWebCodecsRecorder(
  options: RecorderOptions,
): Promise<VideoRecorder | null> {
  if (typeof VideoEncoder === "undefined" || typeof VideoFrame === "undefined") return null;
  for (const { codec, codecId } of CODECS) {
    const config: VideoEncoderConfig = {
      codec,
      width: options.width,
      height: options.height,
      bitrate: options.bitrate,
      framerate: options.fps,
      latencyMode: "quality",
    };
    const support = await VideoEncoder.isConfigSupported(config).catch(() => null);
    if (support?.supported !== true) continue;
    return webCodecsRecorder(config, codecId, options);
  }
  return null;
}

function webCodecsRecorder(
  config: VideoEncoderConfig,
  codecId: string,
  options: RecorderOptions,
): VideoRecorder {
  const frames: EncodedFrame[] = [];
  let failure: unknown = null;
  const encoder = new VideoEncoder({
    output: (chunk) => {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      frames.push({ data, timestampUs: chunk.timestamp, key: chunk.type === "key" });
    },
    error: (error) => {
      failure = error;
    },
  });
  encoder.configure(config);
  const frameUs = 1_000_000 / options.fps;
  let count = 0;

  return {
    kind: "webcodecs",
    async addFrame(source, index) {
      if (failure !== null) throw failure;
      while (encoder.encodeQueueSize > MAX_QUEUE) {
        await new Promise<void>((resolve) =>
          encoder.addEventListener("dequeue", () => resolve(), { once: true }),
        );
      }
      const frame = new VideoFrame(source, {
        timestamp: Math.round(index * frameUs),
        duration: Math.round(frameUs),
      });
      encoder.encode(frame, { keyFrame: index % options.keyframeEvery === 0 });
      frame.close();
      count = Math.max(count, index + 1);
    },
    async finish() {
      await encoder.flush();
      encoder.close();
      if (failure !== null) throw failure;
      frames.sort((a, b) => a.timestampUs - b.timestampUs);
      const bytes = muxWebm(
        { codecId, width: options.width, height: options.height },
        frames,
        (count * 1000) / options.fps,
      );
      return { blob: new Blob([bytes as BlobPart], { type: "video/webm" }) };
    },
  };
}

/**
 * REAL-TIME fallback: `canvas.captureStream(fps)` + `MediaRecorder` (webm / vp9). Frames
 * are timestamped by the wall clock, so the caller must present them at real speed.
 */
export function createMediaRecorder(
  canvas: HTMLCanvasElement,
  options: RecorderOptions,
): VideoRecorder {
  const stream = canvas.captureStream(options.fps);
  const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((t) =>
    MediaRecorder.isTypeSupported(t),
  );
  const recorder = new MediaRecorder(stream, {
    ...(mimeType === undefined ? {} : { mimeType }),
    videoBitsPerSecond: options.bitrate,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.start(1000);
  return {
    kind: "mediarecorder",
    async addFrame() {},
    finish() {
      return new Promise<RecordingResult>((resolve) => {
        recorder.onstop = () => resolve({ blob: new Blob(chunks, { type: "video/webm" }) });
        recorder.stop();
        for (const track of stream.getTracks()) track.stop();
      });
    },
  };
}

/** Endpoints of the dev server's frame recorder (montage-save-plugin.mjs). */
export interface FrameServer {
  /** Base URL, e.g. "/__montage". */
  readonly baseUrl: string;
  /** File name of the finished video. */
  readonly name: string;
}

/** PNG bytes of a canvas, encoded synchronously (`toBlob` is throttled in background tabs). */
export function canvasPngBytes(canvas: HTMLCanvasElement): Uint8Array {
  const base64 = canvas.toDataURL("image/png").split(",")[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * DETERMINISTIC recorder backed by the dev server: every frame is sent as a PNG with its
 * index, and the server encodes them at exactly `fps` with ffmpeg (VP9 WebM). Neither the
 * wall clock nor the browser's encoders take part.
 */
export function createServerFrameRecorder(
  options: RecorderOptions,
  server: FrameServer,
): VideoRecorder {
  const session = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  // Uploads are not awaited one by one: a throttled page resumes awaits about once a
  // second, so frames are produced synchronously and uploads drain in the background.
  let inFlight: Promise<Response>[] = [];
  const settle = async (count: number): Promise<void> => {
    const done = inFlight.slice(0, count);
    inFlight = inFlight.slice(count);
    for (const r of await Promise.all(done)) {
      if (!r.ok) throw new Error(`Frame upload failed: ${r.status} ${await r.text()}`);
    }
  };
  return {
    kind: "frames",
    async addFrame(source, index) {
      const body = canvasPngBytes(source);
      inFlight.push(
        fetch(`${server.baseUrl}/frame?session=${session}&index=${index}`, {
          method: "POST",
          body: body as BlobPart,
        }),
      );
      if (inFlight.length > MAX_UPLOADS_IN_FLIGHT) await settle(inFlight.length / 2);
    },
    async finish() {
      await settle(inFlight.length);
      const name = encodeURIComponent(server.name);
      const r = await fetch(
        `${server.baseUrl}/finish?session=${session}&fps=${options.fps}&name=${name}`,
        { method: "POST" },
      );
      const body = (await r.json()) as { path?: string; error?: string };
      if (!r.ok || body.path === undefined) throw new Error(body.error ?? "Encoding failed");
      return { path: body.path };
    },
  };
}

/** True when the dev server's frame recorder is there and has ffmpeg. */
export async function frameServerAvailable(baseUrl: string): Promise<boolean> {
  try {
    const r = await fetch(`${baseUrl}/ping`);
    if (!r.ok) return false;
    const body = (await r.json()) as { ffmpeg?: boolean };
    return body.ffmpeg === true;
  } catch {
    return false;
  }
}
