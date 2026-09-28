import { deepFreeze } from "../../shared";

/** Tunables of montage mode (`?montage`) and its recorder (`&record`). */
export const MONTAGE_CONFIG = deepFreeze({
  /** Fade from / to black at the start and end of every clip, s of video. */
  fadeS: 0.3,
  record: {
    /** Video frame rate. Each video frame advances the simulation by exactly 1/fps × time scale. */
    fps: 60,
    /** The default frame (`&format=` picks one of `formats`). */
    width: 1280,
    height: 720,
    /** Output frames by `&format=` id: the default, full-HD landscape, and the feed crops. */
    formats: {
      "720p": { width: 1280, height: 720 },
      "16x9": { width: 1920, height: 1080 },
      "4x5": { width: 1080, height: 1350 },
      "1x1": { width: 1080, height: 1080 },
    },
    bitrate: 12_000_000,
    /** A keyframe every this many frames (2 s). */
    keyframeEvery: 120,
    /** Dev-server endpoints that save recordings and grabs and encode frames (montage-save-plugin.mjs). */
    serverUrl: "/__montage",
    /** Frame grabs per clip, at these fractions of its slow-motion window (or of the clip). */
    grabAt: [0.25, 0.6],
  },
  /** Deterministic recording: the page yields after this much work in one task, ms. */
  recordSliceMs: 1500,
  /** Longest wall-clock frame fed to the live (non-recording) montage, s. */
  maxLiveFrameS: 0.1,
});

export type MontageConfig = typeof MONTAGE_CONFIG;
/** An output format id (`&format=`). */
export type VideoFormatId = keyof MontageConfig["record"]["formats"];

/** True when `id` is an output format id. */
export function isVideoFormatId(id: string, config: MontageConfig): id is VideoFormatId {
  return Object.hasOwn(config.record.formats, id);
}
