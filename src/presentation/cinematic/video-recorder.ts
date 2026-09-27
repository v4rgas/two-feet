import type { EncodedFrame } from "./webm-muxer";
import { muxWebm } from "./webm-muxer";

/** Records composited frames to a WebM video. */
export interface VideoRecorder {
  /** "webcodecs" = deterministic (explicit timestamps); "mediarecorder" = real-time capture. */
  readonly kind: "webcodecs" | "mediarecorder";
  /** Adds frame number `index` (shown at `index / fps`), drawn on `source`. */
  addFrame(source: HTMLCanvasElement, index: number): Promise<void>;
  finish(): Promise<Blob>;
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
      return new Blob([bytes as BlobPart], { type: "video/webm" });
    },
  };
}

/**
 * REAL-TIME fallback: `canvas.captureStream(fps)` + `MediaRecorder` (webm / vp9). Frames
 * are timestamped by the wall clock, so the caller must present them at real speed.
 */
export function createMediaRecorder(canvas: HTMLCanvasElement, options: RecorderOptions): VideoRecorder {
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
      return new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" }));
        recorder.stop();
        for (const track of stream.getTracks()) track.stop();
      });
    },
  };
}
