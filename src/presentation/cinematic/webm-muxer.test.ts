import { describe, expect, it } from "vitest";
import { idBytes, muxWebm, sizeBytes, uintBytes } from "./webm-muxer";

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join(" ");

function indexOf(haystack: Uint8Array, needle: number[]): number {
  outer: for (let i = 0; i <= haystack.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) if (haystack[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}

describe("WebM muxer", () => {
  it("encodes EBML ids, sizes and unsigned ints", () => {
    expect(hex(idBytes(0x1a45dfa3))).toBe("1a 45 df a3");
    expect(hex(idBytes(0xa3))).toBe("a3");
    expect(hex(sizeBytes(5))).toBe("85");
    expect(hex(sizeBytes(126))).toBe("fe");
    expect(hex(sizeBytes(127))).toBe("40 7f"); // 0xff would mean "unknown size"
    expect(hex(sizeBytes(300))).toBe("41 2c");
    expect(hex(uintBytes(0))).toBe("00");
    expect(hex(uintBytes(1_000_000))).toBe("0f 42 40");
  });

  it("writes a header, one track and a cluster per keyframe with relative block times", () => {
    const frame = (i: number, key: boolean) => ({
      data: Uint8Array.from([0xaa, i]),
      timestampUs: Math.round((i * 1_000_000) / 60),
      key,
    });
    const frames = [frame(0, true), frame(1, false), frame(2, false), frame(3, true)];
    const webm = muxWebm({ codecId: "V_VP9", width: 1280, height: 720 }, frames, 66.7);
    expect(hex(webm.subarray(0, 4))).toBe("1a 45 df a3");
    expect(indexOf(webm, [0x77, 0x65, 0x62, 0x6d])).toBeGreaterThan(0); // "webm"
    expect(indexOf(webm, [...new TextEncoder().encode("V_VP9")])).toBeGreaterThan(0);
    // Two clusters (keyframes at 0 and 50 ms).
    let clusters = 0;
    for (let i = 0; indexOf(webm.subarray(i), [0x1f, 0x43, 0xb6, 0x75]) >= 0; ) {
      i += indexOf(webm.subarray(i), [0x1f, 0x43, 0xb6, 0x75]) + 4;
      clusters += 1;
    }
    expect(clusters).toBe(2);
    // Frame 2 at 33 ms in the first cluster: track 1, +33 ms, not a keyframe, payload.
    expect(indexOf(webm, [0x81, 0x00, 33, 0x00, 0xaa, 2])).toBeGreaterThan(0);
    // Frame 3 starts the second cluster (Timecode 50 ms): offset 0, keyframe flag.
    expect(indexOf(webm, [0xe7, 0x81, 50])).toBeGreaterThan(0);
    expect(indexOf(webm, [0x81, 0x00, 0x00, 0x80, 0xaa, 3])).toBeGreaterThan(0);
  });

  it("requires the first frame to be a keyframe", () => {
    const f = { data: new Uint8Array(1), timestampUs: 0, key: false };
    expect(() => muxWebm({ codecId: "V_VP8", width: 2, height: 2 }, [f], 1)).toThrow();
  });
});
