import { INPUT_CONFIG } from "../../contexts/input";
import type { FootId } from "../../shared";
import type { PresentationConfig } from "../presentation.config";

/*
 * INPUT WIDGETS for videos (the promo's controls shot and lines): the two virtual sticks
 * as the rider sees them (the smoothed `IntentFrame` sticks, not the raw keys), each in a
 * rounded pad tinted with its foot's colour, with a short trail behind the dot so a flick
 * or a swipe reads; under each pad its key cluster as key caps that light up with the raw
 * keys (from the clip's own key timeline), and a Space bar between them. WASD is always
 * the left widget, the arrows the right one (STYLE.md "HUD"); colours follow the foot.
 */

export type StickWidgetSize = "off" | "large" | "small";

interface StickSample {
  readonly x: number;
  readonly y: number;
  readonly ageS: number;
}

/** How long a trail lasts, video s. */
const TRAIL_S = 0.3;

/** Keeps each stick's recent positions (video time) for the trail. Pure. */
export class StickTrails {
  private readonly trails: Record<"left" | "right", StickSample[]> = { left: [], right: [] };

  push(side: "left" | "right", x: number, y: number, dtS: number): void {
    const trail = this.trails[side].map((s) => ({ ...s, ageS: s.ageS + dtS }));
    trail.push({ x, y, ageS: 0 });
    this.trails[side] = trail.filter((s) => s.ageS <= TRAIL_S);
  }

  of(side: "left" | "right"): readonly StickSample[] {
    return this.trails[side];
  }

  clear(): void {
    this.trails.left = [];
    this.trails.right = [];
  }
}

/** What one widget shows this frame. */
export interface StickWidgetState {
  readonly foot: FootId;
  readonly stick: { readonly x: number; readonly y: number };
  readonly trail: readonly StickSample[];
}

/** Everything the widgets draw this frame. */
export interface StickWidgetsFrame {
  readonly left: StickWidgetState;
  readonly right: StickWidgetState;
  /** Raw keys held now (`KeyboardEvent.code`). */
  readonly keysDown: ReadonlySet<string>;
}

type Ctx = CanvasRenderingContext2D;

const LABEL: Record<FootId, string> = { front: "front foot", back: "back foot" };

/**
 * Draws both widgets along the bottom of a `w × h` frame at scale `u` (px per 720-px short
 * side). Returns the height of the band they take, px (so a lower-third can sit above it).
 */
export function drawStickWidgets(
  ctx: Ctx,
  frame: StickWidgetsFrame,
  size: StickWidgetSize,
  palette: PresentationConfig["palette"],
  u: number,
  w: number,
  h: number,
  opacity = 1,
): number {
  if (size === "off" || opacity <= 0) return 0;
  const s = size === "large" ? 1 : 0.75;
  const pad = 118 * u * s;
  const cap = 30 * u * s;
  const gap = 4 * u * s;
  const labelSize = 17 * u * s;
  const margin = 40 * u;
  const bottom = h - margin;
  const capsH = cap * 2 + gap;
  const bandH = labelSize * 1.6 + pad + 12 * u * s + capsH;
  const top = bottom - bandH;
  ctx.save();
  ctx.globalAlpha = opacity;
  const cluster = INPUT_CONFIG.keys;
  const sides = [
    { side: "left" as const, x: margin, keys: cluster.left, glyphs: ["W", "A", "S", "D"] },
    {
      side: "right" as const,
      x: w - margin - pad,
      keys: cluster.right,
      glyphs: ["↑", "←", "↓", "→"],
    },
  ];
  for (const { side, x, keys, glyphs } of sides) {
    const state = frame[side];
    const color = state.foot === "front" ? palette.frontFoot : palette.backFoot;
    // Label.
    ctx.font = `700 ${labelSize}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillStyle = color;
    haloText(ctx, LABEL[state.foot], x + pad / 2, top, palette.concrete100, 3 * u * s);
    // Pad.
    const py = top + labelSize * 1.6;
    ctx.fillStyle = withAlpha(palette.concrete100, 0.82);
    roundRect(ctx, x, py, pad, pad, 16 * u * s);
    ctx.fill();
    ctx.lineWidth = 4 * u * s;
    ctx.strokeStyle = color;
    ctx.stroke();
    // Cross-hair.
    ctx.strokeStyle = withAlpha(palette.ink, 0.12);
    ctx.lineWidth = 1.5 * u * s;
    ctx.beginPath();
    ctx.moveTo(x + pad / 2, py + pad * 0.16);
    ctx.lineTo(x + pad / 2, py + pad * 0.84);
    ctx.moveTo(x + pad * 0.16, py + pad / 2);
    ctx.lineTo(x + pad * 0.84, py + pad / 2);
    ctx.stroke();
    const reach = pad * 0.36;
    const cx = x + pad / 2;
    const cy = py + pad / 2;
    // Trail: older samples fainter and thinner.
    const trail = state.trail;
    for (let i = 1; i < trail.length; i += 1) {
      const a = trail[i - 1];
      const b = trail[i];
      if (a === undefined || b === undefined) continue;
      const fade = 1 - b.ageS / TRAIL_S;
      ctx.strokeStyle = withAlpha(color, 0.55 * fade);
      ctx.lineWidth = (3 + 7 * fade) * u * s;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(cx + a.x * reach, cy - a.y * reach);
      ctx.lineTo(cx + b.x * reach, cy - b.y * reach);
      ctx.stroke();
    }
    // Dot.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx + state.stick.x * reach, cy - state.stick.y * reach, 11 * u * s, 0, Math.PI * 2);
    ctx.fill();
    // Key caps: an inverted T (up on top; left, down, right below).
    const ky = py + pad + 12 * u * s;
    const rowW = cap * 3 + gap * 2;
    const kx = x + (pad - rowW) / 2;
    const codes = [keys.up, keys.left, keys.down, keys.right];
    const spots: [number, number][] = [
      [kx + cap + gap, ky],
      [kx, ky + cap + gap],
      [kx + cap + gap, ky + cap + gap],
      [kx + (cap + gap) * 2, ky + cap + gap],
    ];
    codes.forEach((code, i) => {
      const [sx, sy] = spots[i] ?? [0, 0];
      keyCap(
        ctx,
        sx,
        sy,
        cap,
        cap,
        glyphs[i] ?? "",
        frame.keysDown.has(code),
        color,
        palette,
        u * s,
      );
    });
  }
  // Space, between the two pads (both feet: push on the ground, catch in the air).
  const spaceW = Math.min(220 * u * s, w - 2 * (margin + pad) - 40 * u);
  if (spaceW > 60 * u * s) {
    const sy = bottom - cap;
    keyCap(
      ctx,
      w / 2 - spaceW / 2,
      sy,
      spaceW,
      cap,
      "space",
      frame.keysDown.has(cluster.feetDown),
      palette.ink,
      palette,
      u * s,
    );
  }
  ctx.restore();
  return bandH + margin;
}

function keyCap(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  glyph: string,
  lit: boolean,
  color: string,
  palette: PresentationConfig["palette"],
  u: number,
): void {
  ctx.fillStyle = lit ? color : withAlpha(palette.concrete100, 0.82);
  roundRect(ctx, x, y, w, h, 6 * u);
  ctx.fill();
  ctx.lineWidth = 1.5 * u;
  ctx.strokeStyle = lit ? color : withAlpha(palette.ink, 0.35);
  ctx.stroke();
  ctx.fillStyle = lit ? "#ffffff" : palette.ink;
  ctx.font = `700 ${h * 0.5}px Inter, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(glyph, x + w / 2, y + h / 2 + 0.5 * u);
}

function haloText(ctx: Ctx, text: string, x: number, y: number, halo: string, r: number): void {
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineWidth = r * 2;
  ctx.strokeStyle = withAlpha(halo, 0.85);
  ctx.strokeText(text, x, y);
  ctx.restore();
  ctx.fillText(text, x, y);
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function withAlpha(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
