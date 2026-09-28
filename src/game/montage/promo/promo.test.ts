import { describe, expect, it } from "vitest";
import { PromoOverlayModel } from "../../../presentation/cinematic/promo-overlays";
import { MAPS } from "../../maps/maps";
import { clipProblems } from "../clip";
import { clipById } from "../clips";
import { MONTAGE_CONFIG } from "../montage.config";
import { fadeAt, montageOptionsFromUrl } from "../montage-player";
import { itemVideoS, PROMO_CLIPS, PROMOS, promoById, promoVideoS } from ".";
import { MATCH_OFFSET_S } from "./fingerboard-match";

describe("promo sequences (data)", () => {
  it("every promo is well-formed: valid clips on real maps or their own set, a known format", () => {
    for (const promo of PROMOS) {
      expect(MONTAGE_CONFIG.record.formats[promo.format], promo.id).toBeDefined();
      for (const item of promo.items) {
        if (item.kind === "card") {
          expect(item.durationS).toBeGreaterThan(0);
          continue;
        }
        expect(clipProblems(item.clip), item.clip.id).toEqual([]);
        if (item.clip.createLevel === undefined) {
          expect(MAPS.get(item.clip.level), item.clip.id).toBeDefined();
        }
        expect(item.startAtS ?? 0).toBeLessThan(item.clip.durationS);
      }
    }
    const ids = PROMO_CLIPS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("the LinkedIn cut (game half): the match cut first, an escalation with no repeats, one title, ≤ 90 s", () => {
    const promo = promoById("promo-linkedin");
    if (promo === undefined) throw new Error("no promo-linkedin");
    expect(promo.format).toBe("4x5");
    // With the ≈ 5.4 s of real footage the edit puts in front, the video stays ≤ 90 s.
    expect(promoVideoS(promo, MONTAGE_CONFIG.record.fps)).toBeLessThanOrEqual(90 - 5.4);
    const [first] = promo.items;
    expect(first?.kind === "clip" && first.clip.id).toBe("promo-desk-kickflip-fifty-fifty");
    expect(first?.fadeInS).toBe(0);
    const tricks = promo.items.flatMap((i) => (i.kind === "clip" ? i.clip.expect.tricks : []));
    expect(tricks).toEqual([
      "Kickflip → BS 50-50 → Kickflip out",
      "Ollie",
      "Kickflip",
      // The manual line: the pops the recognizer names (manuals have no name).
      "Ollie",
      "Ollie",
      "Kickflip",
      "BS 50-50",
      "FS 50-50",
      "Fakie 360",
      "Heelflip → BS 50-50 → BS Pop Shove-it out",
      "Kickflip → FS Tailslide → Hardflip out",
      // (the bail gag lands nothing)
      "360 Flip",
    ]);
    // One 360 flip in the whole video, and the gag is a real bail.
    expect(tricks.filter((t) => t === "360 Flip")).toHaveLength(1);
    const gag = promo.items.find((i) => i.kind === "clip" && i.clip.expect.bails === true);
    expect(gag?.kind === "clip" && gag.tricks.show).toBe(false);
    // The names shown on screen (the climb after the basics) never repeat.
    const named = promo.items.flatMap((i) =>
      i.kind === "clip" && i.tricks.show ? i.clip.expect.tricks : [],
    );
    expect(new Set(named).size).toBe(named.length);
    // TWO FEET once, over the opening's landing; no other wordmark.
    const wordmarks = promo.items.flatMap((i) =>
      (i.overlays ?? []).filter((o) => o.kind === "wordmark"),
    );
    expect(wordmarks).toHaveLength(1);
    expect(wordmarks[0]).toMatchObject({ text: "TWO FEET" });
    // Captions only in the basics; trick names without sub-captions.
    for (const [i, item] of promo.items.entries()) {
      if (item.kind !== "clip") continue;
      expect(item.tricks.caption, item.clip.id).toBe("");
      const kickers = (item.overlays ?? []).filter((o) => o.kind === "kicker");
      if (i !== 1) expect(kickers, item.clip.id).toEqual([]);
      // Readable: ≥ 1 s per 3 words + 1 s, and ≥ 2 s.
      for (const k of kickers) {
        const words = k.text.split(/\s+/).length;
        expect(k.holdS, k.text).toBeGreaterThanOrEqual(Math.max(2, words / 3 + 1));
      }
    }
    const card = promo.items.at(-1);
    expect(card?.kind === "card" && card.card).toMatchObject({
      title: "TWO FEET",
      tagline: "",
      credit: "a game by v4rgas",
      url: "twofeet.v4rgas.com",
    });
    // Plain copy: no exclamation marks or em dashes anywhere on screen.
    const texts = promo.items.flatMap((i) => [
      ...(i.overlays ?? []).flatMap((o) => [o.text, "sub" in o ? (o.sub ?? "") : ""]),
      i.kind === "clip" ? i.tricks.caption : [i.card.title, i.card.credit, i.card.line].join(" "),
    ]);
    for (const t of texts) expect(t).not.toMatch(/[!—]/);
    // Promo clips can be previewed one by one too.
    expect(clipById("promo-tre-flip-el-toro")?.level).toBe("el-toro");
  });

  it("the desk match starts on the real clip's time: game = source − 4.11 s", () => {
    const desk = promoById("promo-linkedin")?.items[0];
    expect(desk?.kind === "clip" && desk.startAtS).toBeCloseTo(5.4 - MATCH_OFFSET_S, 5);
  });

  it("slow motion stretches a clip's video length", () => {
    const promo = PROMOS[0];
    const item = promo?.items.find((i) => i.kind === "clip" && i.startAtS === undefined);
    if (item === undefined || item.kind !== "clip") throw new Error("no clip");
    expect(itemVideoS(item, 60)).toBeGreaterThan(item.clip.durationS);
  });
});

describe("promo playback options", () => {
  it("?montage=<promo> plays its items in its format; &format overrides; unknown formats are ignored", () => {
    const o = montageOptionsFromUrl(new URLSearchParams("montage=promo-linkedin&record=frames"));
    expect(o.promo?.id).toBe("promo-linkedin");
    expect(o.format).toBe("4x5");
    expect(o.items.map((i) => i.kind)).toEqual([...Array(10).fill("clip"), "card"]);
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
