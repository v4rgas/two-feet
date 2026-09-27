import { loadFont, loadImage, publicUrl } from "../textures/browser-assets";

/*
 * BANNER ART (browser only). Paints one banner tile per sponsor id onto a canvas. The
 * layouts follow each brand's own rules; see sponsor-registry.ts for who is who.
 */

type Ctx = CanvasRenderingContext2D;
type Painter = (ctx: Ctx, w: number, h: number) => Promise<void>;

/**
 * BipBop Labs (their STYLE.md): cream-100 field with the moss corner glows, the penguin
 * head mark (THE logo) at 5/3 × the cap height of the "B", centred on the wordmark with
 * cap/3 above and below, the gap of their wordmark sticker, then a cream-300 rule and
 * "bipbop.cl" (the pre-outlined lettering of their URL lockup). Only their files.
 */
const paintBipBop: Painter = async (ctx, w, h) => {
  const [head, wordmark, url] = await Promise.all([
    loadImage(publicUrl("sponsors/bipbop/head.svg")),
    loadImage(publicUrl("sponsors/bipbop/wordmark.png")),
    loadImage(publicUrl("sponsors/bipbop/url.svg")),
  ]);
  ctx.fillStyle = "#f7f5f0";
  ctx.fillRect(0, 0, w, h);
  const glow = (x: number, y: number, r: number, alpha: number): void => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(61, 122, 58, ${alpha})`);
    g.addColorStop(1, "rgba(61, 122, 58, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  };
  glow(w, 0, h * 1.8, 0.16);
  glow(0, h, h * 1.4, 0.06);

  // wordmark.png (2334 × 650): text origin x = 30 px, the "B" from y = 133 (cap top) to
  // the baseline at y = 495, so its cap height is ≈ 362 px.
  const capPx = 362;
  const capTopPx = 133;
  const baselinePx = 495;
  const iconH = h * 0.66;
  const s = iconH / ((5 / 3) * capPx);
  const gap = iconH * (31.4 / 177.6); // the sticker's icon → text gap
  const wordW = (2263 + 4) * s; // glyphs from x = 34 to 2293, measured from the origin
  const urlH = iconH * 0.36;
  const urlW = urlH * (418 / 133);
  const ruleGap = h * 0.16;
  const total = iconH + gap + wordW + ruleGap * 2 + 3 + urlW;
  let x = (w - total) / 2;
  const iconTop = (h - iconH) / 2;
  ctx.drawImage(head, x, iconTop, iconH, iconH);
  x += iconH + gap;
  // Cap top sits cap/3 below the icon top.
  const wordTop = iconTop + (capPx / 3) * s - capTopPx * s;
  ctx.drawImage(wordmark, x - 30 * s, wordTop, 2334 * s, 650 * s);
  x += wordW + ruleGap;
  const baseline = wordTop + baselinePx * s;
  ctx.fillStyle = "#ddd7c8";
  ctx.fillRect(x, iconTop + iconH * 0.12, 3, iconH * 0.76);
  x += 3 + ruleGap;
  // "bipbop.cl" sits on the wordmark's baseline (its descenders ≈ 22 % of the box).
  ctx.drawImage(url, x, baseline - urlH * 0.78, urlW, urlH);
};

/**
 * v4rgas (v4rgas.com): the site's black field, the 32 × 32 pixel penguin scaled with
 * crisp nearest-neighbour pixels, and "v4rgas.com" in Space Mono, lowercase, white with
 * the site's light-grey muted tone on ".com".
 */
const paintV4rgas: Painter = async (ctx, w, h) => {
  const [penguin] = await Promise.all([
    loadImage(publicUrl("sponsors/v4rgas/penguin.png")),
    loadFont("Space Mono", "700", publicUrl("fonts/SpaceMono-Bold.latin.woff2")),
  ]);
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);
  const scale = Math.floor((h * 0.8) / 32);
  const size = 32 * scale;
  ctx.font = `700 ${Math.round(h * 0.3)}px "Space Mono", monospace`;
  ctx.textBaseline = "middle";
  const name = "v4rgas";
  const tld = ".com";
  const nameW = ctx.measureText(name).width;
  const tldW = ctx.measureText(tld).width;
  const gap = h * 0.14;
  const total = size + gap + nameW + tldW;
  let x = Math.round((w - total) / 2);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(penguin, x, Math.round((h - size) / 2), size, size);
  ctx.imageSmoothingEnabled = true;
  x += size + gap;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(name, x, h / 2);
  ctx.fillStyle = "#d3d3d3";
  ctx.fillText(tld, x + nameW, h / 2);
};

/** Painter per registry id (the tests check every registry id has one). */
export const BANNER_PAINTERS: Readonly<Record<string, Painter>> = Object.freeze({
  bipbop: paintBipBop,
  v4rgas: paintV4rgas,
});
