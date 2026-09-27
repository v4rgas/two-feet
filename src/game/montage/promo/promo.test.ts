import { describe, expect, it } from "vitest";
import { PromoOverlayModel } from "../../../presentation/cinematic/promo-overlays";
import { MAPS } from "../../maps/maps";
import { clipProblems } from "../clip";
import { clipById } from "../clips";
import { MONTAGE_CONFIG } from "../montage.config";
import { fadeAt, montageOptionsFromUrl } from "../montage-player";
import { itemVideoS, PROMO_CLIPS, PROMOS, promoById, promoVideoS } from ".";

describe("promo sequences (data)", () => {
  it("every promo is well-formed: valid clips on real maps, a known format, 20–30 s", () => {
    for (const promo of PROMOS) {
      expect(MONTAGE_CONFIG.record.formats[promo.format], promo.id).toBeDefined();
      const length = promoVideoS(promo, MONTAGE_CONFIG.record.fps);
      expect(length, promo.id).toBeGreaterThanOrEqual(20);
      expect(length, promo.id).toBeLessThanOrEqual(30);
      for (const item of promo.items) {
        if (item.kind === "card") {
          expect(item.durationS).toBeGreaterThan(0);
          continue;
        }
        expect(clipProblems(item.clip), item.clip.id).toEqual([]);
        expect(MAPS.get(item.clip.level), item.clip.id).toBeDefined();
      }
    }
    const ids = PROMO_CLIPS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("the LinkedIn cut: TWO FEET on frame 1, the three tricks, the v4rgas end card", () => {
    const promo = promoById("promo-linkedin");
    if (promo === undefined) throw new Error("no promo-linkedin");
    expect(promo.format).toBe("4x5");
    const [first, ...rest] = promo.items;
    expect(first?.fadeInS).toBe(0);
    const title = first?.overlays?.[0];
    expect(title).toMatchObject({ kind: "wordmark", text: "TWO FEET", fromS: 0, fadeInS: 0 });
    expect(rest.flatMap((i) => (i.kind === "clip" ? i.clip.expect.tricks : []))).toEqual([
      "Kickflip → BS 50-50",
      "360 Flip",
    ]);
    const card = promo.items.at(-1);
    expect(card?.kind === "card" && card.card).toMatchObject({
      title: "TWO FEET",
      credit: "a game by v4rgas",
      url: "v4rgas.com",
    });
    // Promo clips can be previewed one by one too.
    expect(clipById("promo-tre-flip-el-toro")?.level).toBe("el-toro");
  });

  it("slow motion stretches a clip's video length", () => {
    const promo = PROMOS[0];
    const item = promo?.items.find((i) => i.kind === "clip");
    if (item === undefined || item.kind !== "clip") throw new Error("no clip");
    expect(itemVideoS(item, 60)).toBeGreaterThan(item.clip.durationS);
  });
});

describe("promo playback options", () => {
  it("?montage=<promo> plays its items in its format; &format overrides; unknown formats are ignored", () => {
    const o = montageOptionsFromUrl(new URLSearchParams("montage=promo-linkedin&record=frames"));
    expect(o.promo?.id).toBe("promo-linkedin");
    expect(o.format).toBe("4x5");
    expect(o.items.map((i) => i.kind)).toEqual(["clip", "clip", "clip", "card"]);
    expect(o.unknown).toEqual([]);
    expect(
      montageOptionsFromUrl(new URLSearchParams("montage=promo-linkedin&format=16x9")).format,
    ).toBe("16x9");
    const plain = montageOptionsFromUrl(new URLSearchParams("montage=kickflip-stairs&format=nope"));
    expect(plain.promo).toBeNull();
    expect(plain.format).toBe("720p");
    expect(MONTAGE_CONFIG.record.formats["720p"]).toEqual({ width: 1280, height: 720 });
    expect(MONTAGE_CONFIG.record.formats["4x5"]).toEqual({ width: 1080, height: 1350 });
  });

  it("fades separately in and out; 0 is a cut", () => {
    expect(fadeAt(0, 0, 4, 0, 0.3)).toBe(0);
    expect(fadeAt(0.1, 0.1, 4, 0.2, 0.3)).toBeCloseTo(0.5);
    expect(fadeAt(5, 3.85, 4, 0.2, 0.3)).toBeCloseTo(0.5);
    expect(fadeAt(5, 3.99, 4, 0.2, 0)).toBe(0);
  });
});

describe("promo overlays (timing)", () => {
  it("start on item time, hold on video time, and can be on from the first frame", () => {
    const m = new PromoOverlayModel({ fadeInS: 0.2, fadeOutS: 0.5 });
    m.start([
      { kind: "wordmark", text: "TWO FEET", fromS: 0, holdS: 1, fadeInS: 0 },
      { kind: "kicker", text: "later", fromS: 2, holdS: 1 },
    ]);
    m.advance(0, 0);
    expect(m.visible.map((v) => [v.overlay.kind, v.opacity])).toEqual([["wordmark", 1]]);
    // Slow motion: item time crawls, the hold still runs on video time.
    for (let i = 0; i < 12; i += 1) m.advance(0.01 * i, 0.1);
    expect(m.visible.find((v) => v.overlay.kind === "wordmark")?.opacity ?? 0).toBeLessThan(1);
    m.advance(2, 0.1);
    // Started this frame: still fully transparent (not drawn).
    expect(m.visible.find((v) => v.overlay.kind === "kicker")).toBeUndefined();
    m.advance(2.05, 0.1);
    expect(m.visible.find((v) => v.overlay.kind === "kicker")?.opacity).toBeCloseTo(0.5);
  });
});
