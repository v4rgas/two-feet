import deckArtUrl from "../assets/deck-penguin.jpg";
import { createCanvas, loadFont, loadImage, publicUrl } from "../textures/browser-assets";
import type { GraffitiPiece } from "./graffiti-registry";
import { seededRandom } from "./graffiti-registry";

/*
 * GRAFFITI ART (browser only). Each piece is drawn as flat shapes on a transparent
 * canvas, then "sprayed": a soft overspray halo, a rough outline (the silhouette dilated
 * with jittered offsets), drips running down from the bottom edges, and a speckle of
 * stray droplets around it. Every random choice comes from the piece's seed.
 */

type Ctx = CanvasRenderingContext2D;
type Rng = () => number;

/** Calm spray colours, taken from the STYLE.md palette. */
const INK = "#1c1b19";
const MOSS = "#3d7a3a";
const BLUE = "#3b6ea5";
const DECK = "#c8553d";
const GOLD = "#d9a441";

interface SprayOptions {
  /** Overspray halo colour, blur radius (px) and strength. */
  readonly haloColor: string;
  readonly haloBlurPx: number;
  readonly haloAlpha: number;
  /** Outline colour and width (px); 0 = none. */
  readonly outlineColor: string;
  readonly outlinePx: number;
  /** Number and length range of drips (px), and their width (px). */
  readonly drips: number;
  readonly dripMinPx: number;
  readonly dripMaxPx: number;
  readonly dripWidthPx: number;
  /** Stray droplets around the piece. */
  readonly speckles: number;
}

/** A transparent layer the size of the target. */
function layer(w: number, h: number): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const surface = createCanvas(w, h);
  if (surface === null) throw new Error("no canvas");
  return surface;
}

/** The silhouette of `mask` grown by about `r` px, in `color`, with a rough edge. */
function roughOutline(
  mask: HTMLCanvasElement,
  r: number,
  color: string,
  rng: Rng,
): HTMLCanvasElement {
  const out = layer(mask.width, mask.height);
  const steps = 20;
  for (let i = 0; i < steps; i += 1) {
    const a = (i / steps) * Math.PI * 2;
    const rr = r * (0.75 + rng() * 0.45);
    out.ctx.drawImage(mask, Math.cos(a) * rr, Math.sin(a) * rr);
  }
  out.ctx.globalCompositeOperation = "source-in";
  out.ctx.fillStyle = color;
  out.ctx.fillRect(0, 0, mask.width, mask.height);
  return out.canvas;
}

/** Drips: paint running down from the lowest painted pixel of random columns. */
function drips(target: Ctx, mask: HTMLCanvasElement, o: SprayOptions, rng: Rng): void {
  const { width: w, height: h } = mask;
  const mctx = mask.getContext("2d");
  if (mctx === null) return;
  const data = mctx.getImageData(0, 0, w, h).data;
  let made = 0;
  for (let attempt = 0; attempt < o.drips * 20 && made < o.drips; attempt += 1) {
    const x = Math.floor(w * (0.05 + rng() * 0.9));
    let y = -1;
    for (let yy = h - 1; yy >= 0; yy -= 1) {
      if ((data[(yy * w + x) * 4 + 3] ?? 0) > 200) {
        y = yy;
        break;
      }
    }
    if (y < 0) continue;
    const i = (y * w + x) * 4;
    const color = `rgb(${data[i]}, ${data[i + 1]}, ${data[i + 2]})`;
    const length = Math.min(h - y - 4, o.dripMinPx + rng() * (o.dripMaxPx - o.dripMinPx));
    if (length < 4) continue;
    const width = o.dripWidthPx * (0.6 + rng() * 0.7);
    target.strokeStyle = color;
    target.fillStyle = color;
    target.lineCap = "round";
    target.lineWidth = width;
    target.beginPath();
    target.moveTo(x, y - 2);
    // A slight wobble, thinning toward the end.
    target.quadraticCurveTo(x + (rng() - 0.5) * 3, y + length * 0.5, x, y + length);
    target.stroke();
    target.beginPath();
    target.arc(x, y + length, width * 0.75, 0, Math.PI * 2);
    target.fill();
    made += 1;
  }
}

/** Stray droplets scattered where the halo is faint (just outside the piece). */
function speckle(
  target: Ctx,
  halo: HTMLCanvasElement,
  colors: readonly string[],
  n: number,
  rng: Rng,
): void {
  const hctx = halo.getContext("2d");
  if (hctx === null) return;
  const { width: w, height: h } = halo;
  const data = hctx.getImageData(0, 0, w, h).data;
  let made = 0;
  for (let attempt = 0; attempt < n * 30 && made < n; attempt += 1) {
    const x = Math.floor(rng() * w);
    const y = Math.floor(rng() * h);
    const a = (data[(y * w + x) * 4 + 3] ?? 0) / 255;
    if (a < 0.03 || a > 0.45) continue;
    target.globalAlpha = 0.35 + rng() * 0.5;
    target.fillStyle = colors[Math.floor(rng() * colors.length)] ?? INK;
    target.beginPath();
    target.arc(x, y, 0.6 + rng() * 1.8, 0, Math.PI * 2);
    target.fill();
    made += 1;
  }
  target.globalAlpha = 1;
}

/**
 * Sprays a flat drawing onto `target`: halo, rough outline, the drawing, drips, speckle.
 * `draw` paints the piece's flat shapes (any colours) onto a transparent layer.
 */
function spray(
  target: Ctx,
  w: number,
  h: number,
  draw: (ctx: Ctx) => void,
  o: SprayOptions,
  rng: Rng,
): void {
  const mask = layer(w, h);
  draw(mask.ctx);
  // Overspray halo: the silhouette, blurred, in the halo colour.
  const tint = layer(w, h);
  tint.ctx.drawImage(mask.canvas, 0, 0);
  tint.ctx.globalCompositeOperation = "source-in";
  tint.ctx.fillStyle = o.haloColor;
  tint.ctx.fillRect(0, 0, w, h);
  const halo = layer(w, h);
  halo.ctx.filter = `blur(${o.haloBlurPx}px)`;
  halo.ctx.drawImage(tint.canvas, 0, 0);
  halo.ctx.filter = "none";
  target.globalAlpha = o.haloAlpha;
  target.drawImage(halo.canvas, 0, 0);
  target.globalAlpha = 1;
  if (o.outlinePx > 0) {
    const outline = roughOutline(mask.canvas, o.outlinePx, o.outlineColor, rng);
    target.drawImage(outline, 0, 0);
    drips(target, outline, { ...o, drips: Math.ceil(o.drips / 3) }, rng);
  }
  target.drawImage(mask.canvas, 0, 0);
  drips(target, mask.canvas, o, rng);
  speckle(target, halo.canvas, [o.haloColor, o.outlineColor], o.speckles, rng);
}

/** The v4rgas pixel penguin's pixels (32 × 32 RGBA), read once. */
async function penguinPixels(): Promise<Uint8ClampedArray> {
  const image = await loadImage(publicUrl("sponsors/v4rgas/penguin.png"));
  const surface = layer(32, 32);
  surface.ctx.drawImage(image, 0, 0);
  return surface.ctx.getImageData(0, 0, 32, 32).data;
}

/** Draws the pixel penguin as hard squares (nearest-neighbour, never smoothed). */
function drawPixelPenguin(
  ctx: Ctx,
  px: Uint8ClampedArray,
  x0: number,
  y0: number,
  cell: number,
): void {
  for (let y = 0; y < 32; y += 1) {
    for (let x = 0; x < 32; x += 1) {
      const i = (y * 32 + x) * 4;
      if ((px[i + 3] ?? 0) < 128) continue;
      ctx.fillStyle = `rgb(${px[i]}, ${px[i + 1]}, ${px[i + 2]})`;
      ctx.fillRect(
        Math.round(x0 + x * cell),
        Math.round(y0 + y * cell),
        Math.ceil(cell),
        Math.ceil(cell),
      );
    }
  }
}

function star(ctx: Ctx, cx: number, cy: number, r: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function crown(ctx: Ctx, cx: number, base: number, width: number, color: string): void {
  const h = width * 0.6;
  const l = cx - width / 2;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(l, base);
  ctx.lineTo(l, base - h * 0.55);
  ctx.lineTo(l + width * 0.25, base - h * 0.2);
  ctx.lineTo(cx, base - h);
  ctx.lineTo(l + width * 0.75, base - h * 0.2);
  ctx.lineTo(l + width, base - h * 0.55);
  ctx.lineTo(l + width, base);
  ctx.closePath();
  ctx.fill();
  for (const fx of [0, 0.5, 1]) {
    ctx.beginPath();
    ctx.arc(l + width * fx, base - h * (fx === 0.5 ? 1 : 0.55), width * 0.06, 0, Math.PI * 2);
    ctx.fill();
  }
}

const TAG_FONT = "Bagel Fat One";

async function paintThrowup(ctx: Ctx, w: number, h: number, rng: Rng): Promise<void> {
  await loadFont(TAG_FONT, "400", publicUrl("fonts/BagelFatOne-Regular.latin.woff2"));
  const size = h * 0.5;
  spray(
    ctx,
    w,
    h,
    (c) => {
      c.font = `400 ${size}px "${TAG_FONT}", system-ui, sans-serif`;
      c.textAlign = "center";
      c.textBaseline = "alphabetic";
      const cx = w / 2;
      const base = h * 0.74;
      // Bubble letters, each a little rotated and bounced.
      const letters = "v4rgas".split("");
      const widths = letters.map((l) => c.measureText(l).width * 0.92);
      let x = cx - widths.reduce((a, b) => a + b, 0) / 2;
      letters.forEach((l, i) => {
        const lw = widths[i] ?? 0;
        c.save();
        c.translate(x + lw / 2, base + (rng() - 0.5) * h * 0.05);
        c.rotate((rng() - 0.5) * 0.18);
        c.lineJoin = "round";
        c.lineWidth = size * 0.1;
        c.strokeStyle = INK;
        c.strokeText(l, 0, 0);
        const g = c.createLinearGradient(0, -size * 0.7, 0, 0);
        g.addColorStop(0, "#8fc47f");
        g.addColorStop(1, MOSS);
        c.fillStyle = g;
        c.fillText(l, 0, 0);
        // A shine on each letter (cream: under multiply it reads as a bare highlight).
        c.fillStyle = "rgba(247, 245, 240, 0.9)";
        c.beginPath();
        c.ellipse(-lw * 0.15, -size * 0.52, lw * 0.09, size * 0.04, -0.5, 0, Math.PI * 2);
        c.fill();
        c.restore();
        x += lw;
      });
      crown(
        c,
        cx - widths.reduce((a, b) => a + b, 0) / 2 + (widths[0] ?? 0) * 0.5,
        h * 0.3,
        h * 0.26,
        GOLD,
      );
      star(c, w * 0.86, h * 0.22, h * 0.07, GOLD);
      star(c, w * 0.12, h * 0.8, h * 0.05, BLUE);
      star(c, w * 0.92, h * 0.78, h * 0.04, DECK);
    },
    {
      haloColor: MOSS,
      haloBlurPx: h * 0.035,
      haloAlpha: 0.45,
      outlineColor: INK,
      outlinePx: h * 0.018,
      drips: 9,
      dripMinPx: h * 0.04,
      dripMaxPx: h * 0.16,
      dripWidthPx: h * 0.012,
      speckles: 260,
    },
    rng,
  );
}

async function paintPixelPenguin(ctx: Ctx, w: number, h: number, rng: Rng): Promise<void> {
  const px = await penguinPixels();
  const cell = Math.floor((Math.min(w, h) * 0.68) / 32);
  const size = cell * 32;
  spray(
    ctx,
    w,
    h,
    (c) => drawPixelPenguin(c, px, (w - size) / 2, (h - size) / 2 - h * 0.04, cell),
    {
      haloColor: BLUE,
      haloBlurPx: w * 0.03,
      haloAlpha: 0.5,
      outlineColor: BLUE,
      outlinePx: cell * 0.9,
      drips: 10,
      dripMinPx: h * 0.03,
      dripMaxPx: h * 0.14,
      dripWidthPx: cell * 0.45,
      speckles: 320,
    },
    rng,
  );
}

async function paintDeckRoundel(ctx: Ctx, w: number, h: number, rng: Rng): Promise<void> {
  const art = await loadImage(deckArtUrl);
  const r = Math.min(w, h) * 0.36;
  const cx = w / 2;
  const cy = h * 0.45;
  spray(
    ctx,
    w,
    h,
    (c) => {
      c.save();
      c.beginPath();
      c.arc(cx, cy, r, 0, Math.PI * 2);
      c.clip();
      c.drawImage(art, cx - r * 1.05, cy - r * 1.05, r * 2.1, r * 2.1);
      c.restore();
    },
    {
      haloColor: DECK,
      haloBlurPx: w * 0.03,
      haloAlpha: 0.5,
      outlineColor: DECK,
      outlinePx: w * 0.018,
      drips: 12,
      dripMinPx: h * 0.04,
      dripMaxPx: h * 0.15,
      dripWidthPx: w * 0.009,
      speckles: 300,
    },
    rng,
  );
}

async function paintPenguinKing(ctx: Ctx, w: number, h: number, rng: Rng): Promise<void> {
  const px = await penguinPixels();
  const cell = Math.floor((h * 0.56) / 32);
  const size = cell * 32;
  const x0 = (w - size) / 2;
  const y0 = h * 0.3;
  spray(
    ctx,
    w,
    h,
    (c) => {
      drawPixelPenguin(c, px, x0, y0, cell);
      crown(c, w / 2, y0 + cell * 3, size * 0.42, GOLD);
      star(c, w * 0.2, h * 0.3, h * 0.08, GOLD);
      star(c, w * 0.8, h * 0.24, h * 0.06, GOLD);
      star(c, w * 0.84, h * 0.66, h * 0.045, MOSS);
      star(c, w * 0.15, h * 0.72, h * 0.04, DECK);
    },
    {
      haloColor: GOLD,
      haloBlurPx: h * 0.03,
      haloAlpha: 0.4,
      outlineColor: INK,
      outlinePx: cell * 0.7,
      drips: 8,
      dripMinPx: h * 0.03,
      dripMaxPx: h * 0.12,
      dripWidthPx: cell * 0.4,
      speckles: 240,
    },
    rng,
  );
}

const PAINTERS: Readonly<
  Record<string, (ctx: Ctx, w: number, h: number, rng: Rng) => Promise<void>>
> = Object.freeze({
  "v4rgas-throwup": paintThrowup,
  "pixel-penguin": paintPixelPenguin,
  "deck-penguin-roundel": paintDeckRoundel,
  "penguin-king": paintPenguinKing,
});

/** Ids that have a painter (the tests check the registry against it). */
export const PAINTED_PIECE_IDS: readonly string[] = Object.freeze(Object.keys(PAINTERS));

/**
 * Paints a piece onto a new transparent canvas (longest side `canvasPx`), or null where
 * canvases do not exist or the art fails to load.
 */
export async function paintGraffiti(
  piece: GraffitiPiece,
  canvasPx: number,
): Promise<HTMLCanvasElement | null> {
  const painter = PAINTERS[piece.id];
  const w = piece.aspect >= 1 ? canvasPx : Math.round(canvasPx * piece.aspect);
  const h = piece.aspect >= 1 ? Math.round(canvasPx / piece.aspect) : canvasPx;
  const surface = createCanvas(w, h);
  if (painter === undefined || surface === null) return null;
  await painter(surface.ctx, w, h, seededRandom(piece.seed));
  return surface.canvas;
}
