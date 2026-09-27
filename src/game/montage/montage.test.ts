import { describe, expect, it } from "vitest";
import { INPUT_CONFIG } from "../../contexts/input";
import { clipProblems, timeScaleAt } from "./clip";
import { clipById, MONTAGE_CLIPS } from "./clips";
import { fadeAt, grabTimesS, montageOptionsFromUrl } from "./montage-player";
import { StepClock } from "./step-clock";
import { KeyTimeline } from "./timeline";

describe("montage clips (data)", () => {
  it("every clip is well-formed, with a unique id, shots and a slow-motion moment", () => {
    const ids = MONTAGE_CLIPS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const clip of MONTAGE_CLIPS) {
      expect(clipProblems(clip), clip.id).toEqual([]);
      expect(clip.shots.length).toBeGreaterThanOrEqual(1);
      expect(clip.shots.length).toBeLessThanOrEqual(3);
      expect(clip.slowMotion?.length ?? 0).toBeGreaterThan(0);
    }
    expect(clipById("kickflip-stairs")?.expect.tricks).toEqual(["Kickflip"]);
  });

  it("time scale is 1 outside slow-motion windows", () => {
    const clip = { ...MONTAGE_CLIPS[0], slowMotion: [{ fromS: 1, toS: 2, scale: 0.25 }] };
    const c = clip as (typeof MONTAGE_CLIPS)[number];
    expect(timeScaleAt(c, 0.5)).toBe(1);
    expect(timeScaleAt(c, 1.5)).toBe(0.25);
    expect(timeScaleAt(c, 2)).toBe(1);
  });
});

describe("KeyTimeline", () => {
  it("writes MECHANICS gestures as keys, mirrored for goofy", () => {
    const regular = new KeyTimeline("regular")
      .loadAndPop("tail", 1, 1.2)
      .level("tail", 1.25)
      .flick("tail", "heel", 1.25, 0.08)
      .sweep("tail", "toe", 1.25)
      .catch(1.6)
      .build();
    expect(regular.map((k) => `${k.code}@${k.atS.toFixed(2)}+${k.holdS.toFixed(2)}`)).toEqual([
      "ArrowDown@1.00+0.20",
      "KeyS@1.02+0.25",
      "KeyW@1.25+0.15",
      "KeyA@1.25+0.08",
      "ArrowRight@1.25+0.10",
      `${INPUT_CONFIG.keys.feetDown}@1.60+0.10`,
    ]);
    const goofy = new KeyTimeline("goofy").loadAndPop("nose", 0, 0.2).flick("nose", "toe", 0.25);
    // Goofy: front = arrows, back = WASD, the toe edge is screen left. Nollie heelflip:
    // the front foot pops (↑), the back foot sets (W) and flicks off the toe edge (A).
    expect(goofy.build().map((k) => k.code)).toEqual(["ArrowUp", "KeyW", "KeyA"]);
  });
});

describe("StepClock", () => {
  it("runs exactly 2 steps per 60 fps frame at 1×, one every other frame at 0.25×", () => {
    const c = new StepClock(1 / 120);
    const normal = Array.from({ length: 60 }, () => c.advance(1 / 60, 1));
    expect(normal.every((n) => n === 2)).toBe(true);
    const slow = Array.from({ length: 8 }, () => c.advance(1 / 60, 0.25));
    expect(slow.reduce((a, b) => a + b, 0)).toBe(4);
    expect(slow.every((n) => n <= 1)).toBe(true);
    expect(c.alpha).toBeGreaterThanOrEqual(0);
    expect(c.alpha).toBeLessThan(1);
  });
});

describe("montage mode", () => {
  it("reads the URL: all clips, one clip, pads, record modes, unknown ids", () => {
    const all = montageOptionsFromUrl(new URLSearchParams("montage"));
    expect(all.clips).toHaveLength(MONTAGE_CLIPS.length);
    expect(all.record).toBe("off");
    expect(all.pads).toBe(false);
    const one = montageOptionsFromUrl(new URLSearchParams("montage=tre-flip-euro-gap&pads&record"));
    expect(one.clips.map((c) => c.id)).toEqual(["tre-flip-euro-gap"]);
    expect(one.pads).toBe(true);
    expect(one.record).toBe("auto");
    expect(montageOptionsFromUrl(new URLSearchParams("montage&record=realtime")).record).toBe(
      "realtime",
    );
    expect(montageOptionsFromUrl(new URLSearchParams("montage=nope")).unknown).toEqual(["nope"]);
  });

  it("fades in and out of each clip and grabs stills inside the slow motion", () => {
    expect(fadeAt(0, 0, 4, 0.3)).toBe(1);
    expect(fadeAt(1, 2, 4, 0.3)).toBe(0);
    expect(fadeAt(5, 3.85, 4, 0.3)).toBeCloseTo(0.5);
    const clip = MONTAGE_CLIPS[0];
    if (clip === undefined) throw new Error("no clips");
    const w = clip.slowMotion?.[0];
    for (const t of grabTimesS(clip, [0.25, 0.6])) {
      expect(t).toBeGreaterThanOrEqual(w?.fromS ?? 0);
      expect(t).toBeLessThanOrEqual(w?.toS ?? clip.durationS);
    }
  });
});
