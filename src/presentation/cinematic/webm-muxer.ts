/**
 * Minimal WebM (Matroska) muxer for ONE video track of encoded frames with EXPLICIT
 * timestamps. The deterministic recorder encodes each frame with WebCodecs at an exact
 * time (frame n at n / fps), so the video's timing never depends on the wall clock.
 * Writes: EBML header, Segment { Info (duration), Tracks (one video track), Clusters of
 * SimpleBlocks }. A new cluster starts at every keyframe (and before the 16-bit block
 * timecode would overflow). No Cues: players still play it; seeking is by scanning.
 */

export interface EncodedFrame {
  readonly data: Uint8Array;
  /** Presentation time, µs. */
  readonly timestampUs: number;
  readonly key: boolean;
}

export interface WebmTrack {
  /** Matroska codec id: "V_VP9" or "V_VP8". */
  readonly codecId: string;
  readonly width: number;
  readonly height: number;
}

/** A tree of EBML elements: the id bytes and either raw data or children. */
type Element = { readonly id: number; readonly data: Uint8Array } | { readonly id: number; readonly children: readonly Element[] };

const ID = {
  EBML: 0x1a45dfa3,
  EBMLVersion: 0x4286,
  EBMLReadVersion: 0x42f7,
  EBMLMaxIDLength: 0x42f2,
  EBMLMaxSizeLength: 0x42f3,
  DocType: 0x4282,
  DocTypeVersion: 0x4287,
  DocTypeReadVersion: 0x4285,
  Segment: 0x18538067,
  Info: 0x1549a966,
  TimecodeScale: 0x2ad7b1,
  MuxingApp: 0x4d80,
  WritingApp: 0x5741,
  Duration: 0x4489,
  Tracks: 0x1654ae6b,
  TrackEntry: 0xae,
  TrackNumber: 0xd7,
  TrackUID: 0x73c5,
  TrackType: 0x83,
  FlagLacing: 0x9c,
  CodecID: 0x86,
  Video: 0xe0,
  PixelWidth: 0xb0,
  PixelHeight: 0xba,
  Cluster: 0x1f43b675,
  Timecode: 0xe7,
  SimpleBlock: 0xa3,
} as const;

/** Largest block timecode relative to its cluster (signed 16 bit), ms. */
const MAX_BLOCK_OFFSET_MS = 32_000;

/** Bytes of an element id (ids already carry their length marker). */
export function idBytes(id: number): Uint8Array {
  const bytes: number[] = [];
  let v = id;
  while (v > 0) {
    bytes.unshift(v & 0xff);
    v = Math.floor(v / 256);
  }
  return Uint8Array.from(bytes);
}

/** EBML variable-length size (1–8 bytes, never the all-ones "unknown" value). */
export function sizeBytes(size: number): Uint8Array {
  let length = 1;
  while (length < 8 && size >= 2 ** (7 * length) - 1) length += 1;
  const out = new Uint8Array(length);
  let v = size;
  for (let i = length - 1; i >= 0; i -= 1) {
    out[i] = v & 0xff;
    v = Math.floor(v / 256);
  }
  out[0] = (out[0] ?? 0) | (0x80 >> (length - 1));
  return out;
}

/** Big-endian unsigned integer in the fewest bytes (at least one). */
export function uintBytes(value: number): Uint8Array {
  const bytes: number[] = [];
  let v = Math.max(0, Math.floor(value));
  do {
    bytes.unshift(v & 0xff);
    v = Math.floor(v / 256);
  } while (v > 0);
  return Uint8Array.from(bytes);
}

function floatBytes(value: number): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setFloat64(0, value);
  return out;
}

function stringBytes(value: string): Uint8Array {
  return Uint8Array.from(value, (c) => c.charCodeAt(0) & 0x7f);
}

const uint = (id: number, v: number): Element => ({ id, data: uintBytes(v) });
const str = (id: number, v: string): Element => ({ id, data: stringBytes(v) });
const float = (id: number, v: number): Element => ({ id, data: floatBytes(v) });
const master = (id: number, children: readonly Element[]): Element => ({ id, children });

function simpleBlock(frame: EncodedFrame, clusterMs: number): Element {
  const offset = Math.round(frame.timestampUs / 1000) - clusterMs;
  const header = new Uint8Array(4);
  header[0] = 0x81; // track number 1 as a vint
  new DataView(header.buffer).setInt16(1, offset);
  header[3] = frame.key ? 0x80 : 0x00;
  const data = new Uint8Array(header.length + frame.data.length);
  data.set(header, 0);
  data.set(frame.data, header.length);
  return { id: ID.SimpleBlock, data };
}

function clusters(frames: readonly EncodedFrame[]): Element[] {
  const out: Element[] = [];
  let blocks: Element[] = [];
  let clusterMs = 0;
  const flush = (): void => {
    if (blocks.length > 0) out.push(master(ID.Cluster, [uint(ID.Timecode, clusterMs), ...blocks]));
    blocks = [];
  };
  for (const frame of frames) {
    const ms = Math.round(frame.timestampUs / 1000);
    if (blocks.length === 0 || frame.key || ms - clusterMs > MAX_BLOCK_OFFSET_MS) {
      flush();
      clusterMs = ms;
    }
    blocks.push(simpleBlock(frame, clusterMs));
  }
  flush();
  return out;
}

function encodedLength(e: Element): number {
  const body = "data" in e ? e.data.length : e.children.reduce((n, c) => n + encodedLength(c), 0);
  return idBytes(e.id).length + sizeBytes(body).length + body;
}

function write(e: Element, out: Uint8Array, at: number): number {
  const id = idBytes(e.id);
  out.set(id, at);
  let p = at + id.length;
  const body = "data" in e ? e.data.length : e.children.reduce((n, c) => n + encodedLength(c), 0);
  const size = sizeBytes(body);
  out.set(size, p);
  p += size.length;
  if ("data" in e) {
    out.set(e.data, p);
    return p + e.data.length;
  }
  for (const c of e.children) p = write(c, out, p);
  return p;
}

/** Muxes `frames` (in decode order, first one a keyframe) into a WebM file. */
export function muxWebm(track: WebmTrack, frames: readonly EncodedFrame[], durationMs: number): Uint8Array {
  if (frames.length > 0 && frames[0]?.key !== true) throw new Error("The first frame must be a keyframe");
  const header = master(ID.EBML, [
    uint(ID.EBMLVersion, 1),
    uint(ID.EBMLReadVersion, 1),
    uint(ID.EBMLMaxIDLength, 4),
    uint(ID.EBMLMaxSizeLength, 8),
    str(ID.DocType, "webm"),
    uint(ID.DocTypeVersion, 2),
    uint(ID.DocTypeReadVersion, 2),
  ]);
  const segment = master(ID.Segment, [
    master(ID.Info, [
      uint(ID.TimecodeScale, 1_000_000),
      str(ID.MuxingApp, "skate-montage"),
      str(ID.WritingApp, "skate-montage"),
      float(ID.Duration, durationMs),
    ]),
    master(ID.Tracks, [
      master(ID.TrackEntry, [
        uint(ID.TrackNumber, 1),
        uint(ID.TrackUID, 1),
        uint(ID.TrackType, 1),
        uint(ID.FlagLacing, 0),
        str(ID.CodecID, track.codecId),
        master(ID.Video, [uint(ID.PixelWidth, track.width), uint(ID.PixelHeight, track.height)]),
      ]),
    ]),
    ...clusters(frames),
  ]);
  const out = new Uint8Array(encodedLength(header) + encodedLength(segment));
  write(segment, out, write(header, out, 0));
  return out;
}
