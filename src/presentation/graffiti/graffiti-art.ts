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

const HAND_FONT = "Sedgwick Ave";
const CREAM = "#f7f5f0";

/** An arrowhead (a filled triangle) at `(x, y)` pointing along `angle`, `size` px long. */
function arrowHead(ctx: Ctx, x: number, y: number, angle: number, size: number): void {
  ctx.beginPath();
  ctx.moveTo(x + Math.cos(angle) * size, y + Math.sin(angle) * size);
  ctx.lineTo(x + Math.cos(angle + 2.4) * size * 0.8, y + Math.sin(angle + 2.4) * size * 0.8);
  ctx.lineTo(x + Math.cos(angle - 2.4) * size * 0.8, y + Math.sin(angle - 2.4) * size * 0.8);
  ctx.closePath();
  ctx.fill();
}

/** A hand-sprayed line through `pts`: a slightly wobbly round-capped stroke. */
function wobblyLine(
  ctx: Ctx,
  pts: readonly (readonly [number, number])[],
  width: number,
  color: string,
  rng: Rng,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  pts.forEach(([x, y], i) => {
    const jx = (rng() - 0.5) * width * 0.4;
    const jy = (rng() - 0.5) * width * 0.4;
    if (i === 0) ctx.moveTo(x + jx, y + jy);
    else ctx.lineTo(x + jx, y + jy);
  });
  ctx.stroke();
}

/** Points along a circle (for sprayed rings), with a little hand wobble in the radius. */
function ringPoints(
  cx: number,
  cy: number,
  r: number,
  rng: Rng,
  steps = 48,
): (readonly [number, number])[] {
  const pts: (readonly [number, number])[] = [];
  const phase = rng() * Math.PI * 2;
  for (let i = 0; i <= steps; i += 1) {
    const a = phase + (i / steps) * Math.PI * 2.04;
    const rr = r * (1 + (rng() - 0.5) * 0.025);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return pts;
}

/**
 * The big floor piece: "v4rgas" in wild bubble letters, crowded and tilted, with a 3D
 * block shadow, a split blue / moss fill with a shine per letter, and arrows flying off the
 * first and last letters. Few drips (it lies on the ground), plenty of overspray.
 */
async function paintWildstyle(ctx: Ctx, w: number, h: number, rng: Rng): Promise<void> {
  await loadFont(TAG_FONT, "400", publicUrl("fonts/BagelFatOne-Regular.latin.woff2"));
  spray(
    ctx,
    w,
    h,
    (c) => {
      // As big as fits: the word fills ≈ 80 % of the width, at most 0.7 of the height.
      c.font = `400 ${h}px "${TAG_FONT}", system-ui, sans-serif`;
      const fullW = c.measureText("v4rgas").width * 0.9;
      const size = Math.min(h * 0.7, (h * w * 0.8) / fullW);
      c.font = `400 ${size}px "${TAG_FONT}", system-ui, sans-serif`;
      c.textAlign = "center";
      c.textBaseline = "alphabetic";
      const letters = "v4rgas".split("");
      const widths = letters.map((l) => c.measureText(l).width * 0.9);
      const total = widths.reduce((a, b) => a + b, 0);
      const base = h / 2 + size * 0.36;
      const placed = letters.map((l, i) => ({
        l,
        x: w / 2 - total / 2 + widths.slice(0, i).reduce((a, b) => a + b, 0) + (widths[i] ?? 0) / 2,
        y: base + (rng() - 0.5) * h * 0.1,
        r: (rng() - 0.5) * 0.24,
      }));
      const draw = (dx: number, dy: number, paint: (p: (typeof placed)[number]) => void) => {
        for (const p of placed) {
          c.save();
          c.translate(p.x + dx, p.y + dy);
          c.rotate(p.r);
          paint(p);
          c.restore();
        }
      };
      // Block shadow: the letters stacked down-right in ink.
      const depth = size * 0.06;
      for (let k = 4; k >= 1; k -= 1) {
        draw((depth * k) / 4, (depth * k) / 4, (p) => {
          c.fillStyle = INK;
          c.fillText(p.l, 0, 0);
          c.lineWidth = size * 0.08;
          c.strokeStyle = INK;
          c.strokeText(p.l, 0, 0);
        });
      }
      draw(0, 0, (p) => {
        c.lineJoin = "round";
        c.lineWidth = size * 0.08;
        c.strokeStyle = INK;
        c.strokeText(p.l, 0, 0);
        const g = c.createLinearGradient(0, -size * 0.75, 0, 0);
        g.addColorStop(0, "#7fa9d6");
        g.addColorStop(0.48, BLUE);
        g.addColorStop(0.52, MOSS);
        g.addColorStop(1, "#8fc47f");
        c.fillStyle = g;
        c.fillText(p.l, 0, 0);
      });
      // A shine on each letter.
      draw(0, 0, () => {
        c.save();
        c.globalCompositeOperation = "source-atop";
        c.fillStyle = CREAM;
        c.beginPath();
        c.ellipse(-size * 0.1, -size * 0.58, size * 0.06, size * 0.025, -0.5, 0, Math.PI * 2);
        c.fill();
        c.restore();
      });
      // Arrows off the ends.
      c.fillStyle = DECK;
      c.strokeStyle = DECK;
      c.lineWidth = h * 0.035;
      c.lineCap = "round";
      const first = placed[0];
      const last = placed[placed.length - 1];
      if (first !== undefined) {
        c.beginPath();
        c.moveTo(first.x - size * 0.3, first.y - size * 0.35);
        c.quadraticCurveTo(
          first.x - size * 0.5,
          first.y - size * 0.9,
          first.x - size * 0.15,
          h * 0.1,
        );
        c.stroke();
        arrowHead(c, first.x - size * 0.15, h * 0.1, -0.4, h * 0.08);
      }
      if (last !== undefined) {
        c.beginPath();
        c.moveTo(last.x + size * 0.25, last.y - size * 0.1);
        const tipX = Math.min(last.x + size * 0.5, w - h * 0.1);
        c.quadraticCurveTo(tipX + size * 0.05, last.y, tipX, h * 0.88);
        c.stroke();
        arrowHead(c, tipX, h * 0.88, 1.7, h * 0.08);
      }
      star(c, w * 0.08, h * 0.25, h * 0.06, GOLD);
      star(c, w * 0.93, h * 0.2, h * 0.05, GOLD);
    },
    {
      haloColor: BLUE,
      haloBlurPx: h * 0.04,
      haloAlpha: 0.4,
      outlineColor: CREAM,
      outlinePx: h * 0.012,
      drips: 3,
      dripMinPx: h * 0.02,
      dripMaxPx: h * 0.06,
      dripWidthPx: h * 0.01,
      speckles: 380,
    },
    rng,
  );
}

/**
 * The pixel penguin as a one-colour stencil: its dark pixels sprayed in ink through a
 * cut card (crisp edges, the light pixels left bare as the stencil's bridges), with the
 * card's soft rectangular overspray around it and a couple of drips.
 */
async function paintPenguinStencil(ctx: Ctx, w: number, h: number, rng: Rng): Promise<void> {
  const px = await penguinPixels();
  const cell = Math.floor((Math.min(w, h) * 0.78) / 32);
  const size = cell * 32;
  const x0 = Math.round((w - size) / 2);
  const y0 = Math.round((h - size) / 2);
  // The card's overspray: fine dots, densest just inside the card's edge.
  const pad = cell * 2;
  for (let i = 0; i < 9000; i += 1) {
    const x = x0 - pad + rng() * (size + pad * 2);
    const y = y0 - pad + rng() * (size + pad * 2);
    const edge = Math.min(x - (x0 - pad), x0 + size + pad - x, y - (y0 - pad), y0 + size + pad - y);
    if (rng() > Math.max(0.08, 1 - edge / (pad * 1.4))) continue;
    ctx.globalAlpha = 0.1 + rng() * 0.15;
    ctx.fillStyle = INK;
    ctx.fillRect(x, y, 1 + rng() * 2, 1 + rng() * 2);
  }
  ctx.globalAlpha = 1;
  const mask = layer(w, h);
  for (let y = 0; y < 32; y += 1) {
    for (let x = 0; x < 32; x += 1) {
      const i = (y * 32 + x) * 4;
      if ((px[i + 3] ?? 0) < 128) continue;
      const lum = ((px[i] ?? 0) + (px[i + 1] ?? 0) + (px[i + 2] ?? 0)) / (3 * 255);
      if (lum > 0.75) continue; // the stencil's bridges (the white belly and eyes)
      mask.ctx.fillStyle = INK;
      mask.ctx.fillRect(x0 + x * cell, y0 + y * cell, cell, cell);
    }
  }
  // A thin hard overspray just round the cut edges, then the paint itself.
  const soft = layer(w, h);
  soft.ctx.filter = `blur(${cell * 0.35}px)`;
  soft.ctx.drawImage(mask.canvas, 0, 0);
  soft.ctx.filter = "none";
  ctx.globalAlpha = 0.35;
  ctx.drawImage(soft.canvas, 0, 0);
  ctx.globalAlpha = 0.92;
  ctx.drawImage(mask.canvas, 0, 0);
  ctx.globalAlpha = 1;
  drips(
    ctx,
    mask.canvas,
    {
      haloColor: INK,
      haloBlurPx: 0,
      haloAlpha: 0,
      outlineColor: INK,
      outlinePx: 0,
      drips: 3,
      dripMinPx: h * 0.03,
      dripMaxPx: h * 0.09,
      dripWidthPx: cell * 0.35,
      speckles: 0,
    },
    rng,
  );
}

/**
 * Tags and scribbles: a handstyle "v4rgas" tag in ink with a swoosh under it, a smaller
 * blue "v4" and a crown doodle beside it, all thin and quick, a few drips.
 */
async function paintTags(ctx: Ctx, w: number, h: number, rng: Rng): Promise<void> {
  await loadFont(HAND_FONT, "400", publicUrl("fonts/SedgwickAve-Regular.latin.woff2"));
  spray(
    ctx,
    w,
    h,
    (c) => {
      c.textAlign = "left";
      c.textBaseline = "alphabetic";
      c.save();
      c.translate(w * 0.06, h * 0.62);
      c.rotate(-0.08);
      c.font = `400 ${h * 0.5}px "${HAND_FONT}", cursive`;
      c.fillStyle = INK;
      c.fillText("v4rgas", 0, 0);
      const tagW = c.measureText("v4rgas").width;
      c.restore();
      wobblyLine(
        c,
        [
          [w * 0.05, h * 0.78],
          [w * 0.05 + tagW * 0.45, h * 0.74],
          [w * 0.05 + tagW * 0.95, h * 0.64],
        ],
        h * 0.025,
        INK,
        rng,
      );
      c.save();
      c.translate(w * 0.72, h * 0.5);
      c.rotate(0.12);
      c.font = `400 ${h * 0.34}px "${HAND_FONT}", cursive`;
      c.fillStyle = BLUE;
      c.fillText("v4", 0, 0);
      c.restore();
      // A quick crown doodle over the "v4", outline only.
      const cx = w * 0.8;
      const base = h * 0.26;
      const cw = h * 0.22;
      wobblyLine(
        c,
        [
          [cx - cw / 2, base],
          [cx - cw / 2, base - cw * 0.35],
          [cx - cw / 4, base - cw * 0.15],
          [cx, base - cw * 0.55],
          [cx + cw / 4, base - cw * 0.15],
          [cx + cw / 2, base - cw * 0.35],
          [cx + cw / 2, base],
          [cx - cw / 2, base],
        ],
        h * 0.018,
        INK,
        rng,
      );
      // Two little scribble ticks.
      wobblyLine(
        c,
        [
          [w * 0.9, h * 0.72],
          [w * 0.93, h * 0.62],
          [w * 0.95, h * 0.74],
        ],
        h * 0.015,
        BLUE,
        rng,
      );
    },
    {
      haloColor: INK,
      haloBlurPx: h * 0.02,
      haloAlpha: 0.22,
      outlineColor: INK,
      outlinePx: 0,
      drips: 6,
      dripMinPx: h * 0.04,
      dripMaxPx: h * 0.16,
      dripWidthPx: h * 0.008,
      speckles: 140,
    },
    rng,
  );
}

/**
 * A sticker-bomb cluster of sprayed doodles: stars, crowns, arrows and dots in the
 * palette colours, each outlined in ink, packed round a small pixel penguin.
 */
async function paintStickerBomb(ctx: Ctx, w: number, h: number, rng: Rng): Promise<void> {
  const px = await penguinPixels();
  const cell = Math.floor((h * 0.34) / 32);
  const colours = [GOLD, DECK, BLUE, MOSS] as const;
  spray(
    ctx,
    w,
    h,
    (c) => {
      const pick = (): string => colours[Math.floor(rng() * colours.length)] ?? GOLD;
      // Ring of doodles round the centre.
      const n = 11;
      for (let i = 0; i < n; i += 1) {
        const a = (i / n) * Math.PI * 2 + rng() * 0.3;
        const r = 0.3 + rng() * 0.08;
        const x = w / 2 + Math.cos(a) * w * r;
        const y = h / 2 + Math.sin(a) * h * r * 0.95;
        const kind = i % 4;
        const s = h * (0.07 + rng() * 0.05);
        if (kind === 0) star(c, x, y, s, pick());
        else if (kind === 1) crown(c, x, y + s * 0.4, s * 1.6, GOLD);
        else if (kind === 2) {
          c.fillStyle = pick();
          c.strokeStyle = c.fillStyle;
          c.lineWidth = s * 0.3;
          c.lineCap = "round";
          const dir = a + Math.PI / 2 + (rng() - 0.5);
          c.beginPath();
          c.moveTo(x - Math.cos(dir) * s, y - Math.sin(dir) * s);
          c.lineTo(x + Math.cos(dir) * s * 0.6, y + Math.sin(dir) * s * 0.6);
          c.stroke();
          arrowHead(c, x + Math.cos(dir) * s * 0.6, y + Math.sin(dir) * s * 0.6, dir, s * 0.7);
        } else {
          c.fillStyle = pick();
          c.beginPath();
          c.arc(x, y, s * 0.55, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = CREAM;
          c.beginPath();
          c.arc(x, y, s * 0.22, 0, Math.PI * 2);
          c.fill();
        }
      }
      drawPixelPenguin(c, px, (w - cell * 32) / 2, (h - cell * 32) / 2, cell);
    },
    {
      haloColor: GOLD,
      haloBlurPx: h * 0.03,
      haloAlpha: 0.35,
      outlineColor: INK,
      outlinePx: h * 0.012,
      drips: 5,
      dripMinPx: h * 0.03,
      dripMaxPx: h * 0.1,
      dripWidthPx: h * 0.008,
      speckles: 260,
    },
    rng,
  );
}

/**
 * A landing mark: a sprayed target (two thin rings) with a big X through it, calm and
 * low-contrast (it lies in a landing zone): ink rings, a muted deck-red X, no drips.
 */
async function paintLandingTarget(ctx: Ctx, w: number, h: number, rng: Rng): Promise<void> {
  const r = Math.min(w, h) * 0.4;
  spray(
    ctx,
    w,
    h,
    (c) => {
      c.globalAlpha = 0.75;
      wobblyLine(c, ringPoints(w / 2, h / 2, r, rng), r * 0.05, INK, rng);
      wobblyLine(c, ringPoints(w / 2, h / 2, r * 0.55, rng), r * 0.04, INK, rng);
      c.globalAlpha = 0.85;
      const d = r * 0.62;
      wobblyLine(
        c,
        [
          [w / 2 - d, h / 2 - d],
          [w / 2, h / 2],
          [w / 2 + d, h / 2 + d],
        ],
        r * 0.11,
        DECK,
        rng,
      );
      wobblyLine(
        c,
        [
          [w / 2 + d, h / 2 - d],
          [w / 2, h / 2],
          [w / 2 - d, h / 2 + d],
        ],
        r * 0.11,
        DECK,
        rng,
      );
      c.globalAlpha = 1;
    },
    {
      haloColor: DECK,
      haloBlurPx: r * 0.06,
      haloAlpha: 0.25,
      outlineColor: INK,
      outlinePx: 0,
      drips: 0,
      dripMinPx: 0,
      dripMaxPx: 0,
      dripWidthPx: 0,
      speckles: 160,
    },
    rng,
  );
}

/**
 * A flow arrow for the floor: one fat curved arrow in blue with an ink outline, a gold
 * dashed centre line and a few stars in its wake.
 */
async function paintFlowArrow(ctx: Ctx, w: number, h: number, rng: Rng): Promise<void> {
  spray(
    ctx,
    w,
    h,
    (c) => {
      const body = h * 0.2;
      const x0 = w * 0.1;
      const x1 = w * 0.76;
      const curve = (t: number): [number, number] => [
        x0 + (x1 - x0) * t,
        h * 0.62 - Math.sin(t * Math.PI) * h * 0.22,
      ];
      c.strokeStyle = BLUE;
      c.lineWidth = body;
      c.lineCap = "butt";
      c.beginPath();
      for (let i = 0; i <= 40; i += 1) {
        const [x, y] = curve(i / 40);
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
      c.fillStyle = BLUE;
      const [ex, ey] = curve(1);
      arrowHead(c, ex + body * 0.2, ey, 0.25, body * 1.6);
      // Dashed centre line.
      c.strokeStyle = GOLD;
      c.lineWidth = body * 0.14;
      c.lineCap = "round";
      for (let i = 0; i < 8; i += 1) {
        const [ax, ay] = curve(0.06 + i * 0.115);
        const [bx, by] = curve(0.06 + i * 0.115 + 0.06);
        c.beginPath();
        c.moveTo(ax, ay);
        c.lineTo(bx, by);
        c.stroke();
      }
      star(c, w * 0.08, h * 0.25, h * 0.07, GOLD);
      star(c, w * 0.2, h * 0.14, h * 0.045, MOSS);
    },
    {
      haloColor: BLUE,
      haloBlurPx: h * 0.035,
      haloAlpha: 0.35,
      outlineColor: INK,
      outlinePx: h * 0.016,
      drips: 2,
      dripMinPx: h * 0.02,
      dripMaxPx: h * 0.06,
      dripWidthPx: h * 0.01,
      speckles: 220,
    },
    rng,
  );
}

const PAINTERS: Readonly<
  Record<string, (ctx: Ctx, w: number, h: number, rng: Rng) => Promise<void>>
> = Object.freeze({
  "v4rgas-throwup": paintThrowup,
  "pixel-penguin": paintPixelPenguin,
  "penguin-king": paintPenguinKing,
  "v4rgas-wildstyle": paintWildstyle,
  "penguin-stencil": paintPenguinStencil,
  "tag-scribbles": paintTags,
  "sticker-bomb": paintStickerBomb,
  "landing-target": paintLandingTarget,
  "flow-arrow": paintFlowArrow,
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
