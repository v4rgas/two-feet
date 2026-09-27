import { padLayout } from "../hud/hud-model";
import type { PresentationConfig } from "../presentation.config";
import type { RenderFrame } from "../render-frame";
import type { CinematicConfig } from "./cinematic.config";
import { LowerThirdsModel } from "./lower-thirds";
import "./video-hud.css";

/** Layout reference height: sizes below are px at 720 p and scale with the frame. */
const REF_HEIGHT = 720;
const MARGIN = 56;
const PAD_SIZE = 58;
const PAD_GAP = 14;

export interface VideoHudOptions {
  /** Draw the foot pads (`&pads`). */
  readonly pads: boolean;
  /** A quiet line in the bottom-right corner for the whole clip (the intro's skip hint). */
  readonly hint?: string;
  /** The wordmark card (the intro), shown once `LowerThirdsModel.cueTitleCard` is called. */
  readonly titleCard?: TitleCardContent;
}

/** The intro's title card (STYLE.md "Wordmark"). */
export interface TitleCardContent {
  /** The wordmark, e.g. "TWO FEET". */
  readonly title: string;
  readonly tagline: string;
  readonly credit: string;
  /** The pixel penguin beside the credit, drawn with crisp pixels (null = none). */
  readonly icon: CanvasImageSource | null;
}

/**
 * The montage's "video" HUD, drawn on a 2D canvas so the SAME pixels are shown over the
 * game and composited into the recording: a trick lower-third, a clip title card,
 * optional foot pads and the fade between clips. While it exists, the DOM game HUD is
 * hidden (the `skate-montage` body class) and the debug overlay stays off.
 */
export class VideoHud {
  readonly overlay: HTMLCanvasElement;
  readonly model: LowerThirdsModel;
  private readonly ctx: CanvasRenderingContext2D;
  private stickFront = { x: 0, y: 0 };
  private stickBack = { x: 0, y: 0 };
  private layout = padLayout("regular");
  private fade = 0;

  constructor(
    parent: HTMLElement,
    private readonly presentation: PresentationConfig,
    config: CinematicConfig,
    private readonly options: VideoHudOptions,
  ) {
    document.body.classList.add("skate-montage");
    this.overlay = document.createElement("canvas");
    this.overlay.className = "skate-video-hud";
    parent.appendChild(this.overlay);
    const ctx = this.overlay.getContext("2d");
    if (ctx === null) throw new Error("No 2D canvas context for the video HUD");
    this.ctx = ctx;
    this.model = new LowerThirdsModel(config.lowerThird);
  }

  startClip(title: string, index: number, total: number): void {
    this.model.startClip(title, index, total);
  }

  /** Advances by `dtS` of video time and reads the frame's events and sticks. */
  update(frame: RenderFrame, dtS: number, fadeToBlack: number): void {
    this.model.advance(dtS);
    for (const event of frame.recentEvents) this.model.onEvent(event);
    this.stickFront = frame.intents.front.stick;
    this.stickBack = frame.intents.back.stick;
    this.layout = padLayout(frame.stance);
    this.fade = Math.min(1, Math.max(0, fadeToBlack));
  }

  /** Redraws the on-screen overlay to match the CSS box of `over` (the game canvas). */
  drawOverlay(over: HTMLCanvasElement): void {
    const rect = over.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (this.overlay.width !== w || this.overlay.height !== h) {
      this.overlay.width = w;
      this.overlay.height = h;
    }
    Object.assign(this.overlay.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    this.ctx.clearRect(0, 0, w, h);
    this.draw(this.ctx, w, h);
  }

  /** Draws the game frame (`gl`, scaled to fill) plus this HUD into `out`. */
  composite(gl: HTMLCanvasElement, out: CanvasRenderingContext2D): void {
    const { width, height } = out.canvas;
    out.drawImage(gl, 0, 0, width, height);
    this.draw(out, width, height);
  }

  /** The HUD itself, at any resolution. */
  draw(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const u = h / REF_HEIGHT;
    this.drawTitle(ctx, u);
    this.drawLowerThird(ctx, u, h);
    this.drawTitleCard(ctx, u, w, h);
    this.drawHint(ctx, u, w, h);
    if (this.options.pads) this.drawPads(ctx, u, w, h);
    if (this.fade > 0) {
      ctx.globalAlpha = this.fade;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  }

  dispose(): void {
    this.overlay.remove();
    document.body.classList.remove("skate-montage");
  }

  private drawTitle(ctx: CanvasRenderingContext2D, u: number): void {
    const opacity = this.model.titleOpacity;
    if (opacity <= 0) return;
    const p = this.presentation.palette;
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.textBaseline = "alphabetic";
    const x = MARGIN * u;
    let y = MARGIN * u;
    if (this.model.counter !== "") {
      ctx.font = `600 ${13 * u}px "JetBrains Mono", monospace`;
      ctx.fillStyle = p.concrete100;
      shadowText(ctx, this.model.counter, x, y + 13 * u, u);
      y += 22 * u;
    }
    ctx.font = `700 ${22 * u}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = p.concrete100;
    shadowText(ctx, this.model.title, x, y + 22 * u, u);
    ctx.restore();
  }

  /** The wordmark card: centred a little above the middle, over the roll-away. */
  private drawTitleCard(ctx: CanvasRenderingContext2D, u: number, w: number, h: number): void {
    const card = this.options.titleCard;
    const opacity = this.model.titleCardOpacity;
    if (card === undefined || opacity <= 0) return;
    const p = this.presentation.palette;
    const cx = w / 2;
    const rise = (1 - opacity) ** 2 * 14 * u;
    const top = h * 0.24 + rise;
    const titleSize = 96 * u;
    ctx.save();
    ctx.globalAlpha = opacity;
    // A soft ink band behind the card, so light type reads over the pale plaza and sky.
    const bandTop = top - 40 * u;
    const bandH = titleSize + 190 * u;
    const band = ctx.createLinearGradient(0, bandTop, 0, bandTop + bandH);
    band.addColorStop(0, hexWithAlpha(p.ink, 0));
    band.addColorStop(0.5, hexWithAlpha(p.ink, 0.42));
    band.addColorStop(1, hexWithAlpha(p.ink, 0));
    ctx.fillStyle = band;
    ctx.fillRect(0, bandTop, w, bandH);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    // The wordmark: Inter 800, caps, a little tracking.
    ctx.font = `800 ${titleSize}px Inter, system-ui, sans-serif`;
    setLetterSpacing(ctx, titleSize * 0.04);
    ctx.fillStyle = p.concrete100;
    shadowText(ctx, card.title, cx, top + titleSize * 0.8, u);
    setLetterSpacing(ctx, 0);
    // The accent: a short bar in the deck colour, like the lower-thirds' edge.
    const barY = top + titleSize * 0.8 + 20 * u;
    ctx.fillStyle = p.deck;
    ctx.fillRect(cx - 28 * u, barY, 56 * u, 5 * u);
    // The pun, in the credit face.
    const taglineY = barY + 39 * u;
    ctx.font = `400 ${20 * u}px "Space Mono", ui-monospace, monospace`;
    ctx.fillStyle = p.concrete100;
    shadowText(ctx, card.tagline, cx, taglineY, u);
    // The credit, with the pixel penguin (crisp nearest-neighbour pixels).
    ctx.font = `400 ${14 * u}px "Space Mono", ui-monospace, monospace`;
    const iconSize = card.icon === null ? 0 : 24 * u;
    const spacing = card.icon === null ? 0 : 10 * u;
    const rowW = iconSize + spacing + ctx.measureText(card.credit).width;
    const rowY = taglineY + 40 * u;
    const left = cx - rowW / 2;
    if (card.icon !== null) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(card.icon, left, rowY - iconSize * 0.8, iconSize, iconSize);
    }
    ctx.textAlign = "left";
    ctx.globalAlpha = opacity * 0.85;
    shadowText(ctx, card.credit, left + iconSize + spacing, rowY, u);
    ctx.restore();
  }

  /** The hint line, bottom-right, quiet. */
  private drawHint(ctx: CanvasRenderingContext2D, u: number, w: number, h: number): void {
    const hint = this.options.hint;
    if (hint === undefined || hint === "") return;
    ctx.save();
    // Ink, quiet: the plaza and the sky are both pale, so dark type reads on either.
    ctx.globalAlpha = 0.55;
    ctx.textAlign = "right";
    ctx.textBaseline = "alphabetic";
    ctx.font = `400 ${13 * u}px "Space Mono", ui-monospace, monospace`;
    ctx.fillStyle = this.presentation.palette.ink;
    ctx.fillText(hint, w - MARGIN * 0.6 * u, h - MARGIN * 0.6 * u);
    ctx.restore();
  }

  private drawLowerThird(ctx: CanvasRenderingContext2D, u: number, h: number): void {
    const card = this.model.current;
    const opacity = this.model.opacity;
    if (card === null || opacity <= 0) return;
    const p = this.presentation.palette;
    const slide = (1 - this.model.entrance) ** 2 * 36 * u;
    const nameSize = (card.tone === "bail" ? 34 : 46) * u;
    const captionSize = 14 * u;
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.font = `800 ${nameSize}px Inter, system-ui, sans-serif`;
    const text = card.tone === "bail" ? card.text.toLowerCase() : card.text;
    const nameW = ctx.measureText(text).width;
    ctx.font = `600 ${captionSize}px Inter, system-ui, sans-serif`;
    const caption = card.caption.toUpperCase();
    const captionW = ctx.measureText(caption).width + caption.length * 1.5 * u;

    const x = MARGIN * u - slide;
    const bottom = h - MARGIN * 1.5 * u;
    const padX = 18 * u;
    const boxH = nameSize + (caption === "" ? 0 : captionSize + 10 * u) + 26 * u;
    const boxW = Math.max(nameW, captionW) + padX * 2;
    const top = bottom - boxH;
    // Backdrop: concrete, like a strip of paper; an accent bar in the deck colour.
    ctx.fillStyle = hexWithAlpha(p.concrete100, 0.9);
    roundRect(ctx, x, top, boxW, boxH, 6 * u);
    ctx.fill();
    ctx.fillStyle = card.tone === "bail" ? p.warn : p.deck;
    ctx.fillRect(x, top, 6 * u, boxH);

    ctx.textBaseline = "top";
    ctx.fillStyle = card.tone === "bail" ? p.warn : p.ink;
    ctx.font = `800 ${nameSize}px Inter, system-ui, sans-serif`;
    ctx.fillText(text, x + padX, top + 13 * u);
    if (caption !== "") {
      ctx.fillStyle = p.concrete600;
      ctx.font = `600 ${captionSize}px Inter, system-ui, sans-serif`;
      if ("letterSpacing" in ctx) ctx.letterSpacing = `${1.5 * u}px`;
      ctx.fillText(caption, x + padX, top + 13 * u + nameSize + 8 * u);
    }
    ctx.restore();
  }

  private drawPads(ctx: CanvasRenderingContext2D, u: number, w: number, h: number): void {
    const p = this.presentation.palette;
    const size = PAD_SIZE * u;
    const y = h - MARGIN * u - size;
    const right = w - MARGIN * u;
    const slots = [
      { foot: this.layout.left, x: right - size * 2 - PAD_GAP * u },
      { foot: this.layout.right, x: right - size },
    ];
    ctx.save();
    for (const { foot, x } of slots) {
      const stick = foot === "front" ? this.stickFront : this.stickBack;
      const color = foot === "front" ? p.frontFoot : p.backFoot;
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = hexWithAlpha(p.concrete100, 0.75);
      roundRect(ctx, x, y, size, size, 10 * u);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2.5 * u;
      ctx.strokeStyle = color;
      ctx.stroke();
      const cx = x + size / 2 + stick.x * size * 0.32;
      const cy = y + size / 2 - stick.y * size * 0.32;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, 6 * u, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function shadowText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  u: number,
): void {
  ctx.shadowColor = "rgba(28, 27, 25, 0.55)";
  ctx.shadowBlur = 8 * u;
  ctx.shadowOffsetY = 1 * u;
  ctx.fillText(text, x, y);
  ctx.shadowColor = "transparent";
}

/** `ctx.letterSpacing` where the browser has it, px. */
function setLetterSpacing(ctx: CanvasRenderingContext2D, px: number): void {
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${px}px`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** `#rrggbb` → `rgba(r, g, b, a)`. */
export function hexWithAlpha(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
