import { padLayout } from "../hud/hud-model";
import type { PresentationConfig } from "../presentation.config";
import type { RenderFrame } from "../render-frame";
import { loadFont, loadImage, publicUrl } from "../textures/browser-assets";
import type { CinematicConfig } from "./cinematic.config";
import type { LowerThird, TrickCards } from "./lower-thirds";
import { LowerThirdsModel } from "./lower-thirds";
import type { EndCard, TextOverlay, VisibleOverlay } from "./promo-overlays";
import { PromoOverlayModel } from "./promo-overlays";
import "./video-hud.css";

/**
 * Layout reference: sizes below are px for a 720-px SHORT side and scale with it, so a
 * 1280×720, a 1920×1080 and a 1080×1350 (portrait) frame all get the same proportions.
 */
const REF_SHORT_SIDE = 720;
const MARGIN = 56;
const PAD_SIZE = 58;
const PAD_GAP = 14;
/** STYLE.md "Wordmark": TWO FEET is tracked 0.04 em. */
const WORDMARK_SPACING_EM = 0.04;

/** v4rgas brand (STYLE.md "Banners"): a black field, white type, muted ".com". */
const V4RGAS_BLACK = "#000000";
const V4RGAS_WHITE = "#ffffff";
const V4RGAS_MUTED = "#d3d3d3";
const SPACE_MONO = '"Space Mono", ui-monospace, monospace';
const INTER = "Inter, system-ui, sans-serif";

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

/** What a clip shows besides the picture (a promo's text; the montage uses the defaults). */
export interface ClipHudOptions {
  readonly tricks?: TrickCards;
  readonly overlays?: readonly TextOverlay[];
}

/**
 * The montage's "video" HUD, drawn on a 2D canvas so the SAME pixels are shown over the
 * game and composited into the recording: a trick lower-third, a clip title card, the
 * intro's wordmark card, a promo's text overlays and end card, optional foot pads and the
 * fade between clips. While it exists, the DOM game HUD is hidden (the `skate-montage`
 * body class) and the debug overlay stays off.
 */
export class VideoHud {
  readonly overlay: HTMLCanvasElement;
  readonly model: LowerThirdsModel;
  readonly promo: PromoOverlayModel;
  private readonly ctx: CanvasRenderingContext2D;
  private stickFront = { x: 0, y: 0 };
  private stickBack = { x: 0, y: 0 };
  private layout = padLayout("regular");
  private fade = 0;
  private endCard: EndCard | null = null;
  private penguin: HTMLImageElement | null = null;

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
    this.promo = new PromoOverlayModel(config.lowerThird);
  }

  /** Loads what the promo text and end card draw with (Space Mono, the pixel penguin). */
  async preload(): Promise<void> {
    await Promise.all([
      loadFont("Space Mono", "700", publicUrl("fonts/SpaceMono-Bold.latin.woff2")),
      loadFont("Space Mono", "400"),
    ]);
    this.penguin = await loadImage(publicUrl("sponsors/v4rgas/penguin.png")).catch(() => null);
  }

  startClip(title: string, index: number, total: number, options: ClipHudOptions = {}): void {
    this.endCard = null;
    this.model.startClip(title, index, total, options.tricks);
    this.promo.start(options.overlays ?? []);
  }

  /** A full-frame card (no game picture) with optional overlays on top. */
  startCard(card: EndCard, overlays: readonly TextOverlay[] = []): void {
    this.endCard = card;
    this.model.startClip("", 0, 1, { show: false, caption: "" });
    this.promo.start(overlays);
  }

  /**
   * Advances by `dtS` of video time: reads the frame's events and sticks (null on a card)
   * and starts the overlays that item time `itemTimeS` has reached.
   */
  update(frame: RenderFrame | null, dtS: number, fadeToBlack: number, itemTimeS = 0): void {
    this.model.advance(dtS);
    this.promo.advance(itemTimeS, dtS);
    if (frame !== null) {
      for (const event of frame.recentEvents) this.model.onEvent(event);
      this.stickFront = frame.intents.front.stick;
      this.stickBack = frame.intents.back.stick;
      this.layout = padLayout(frame.stance);
    }
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

  /** Draws the game frame (`gl`, scaled to fill; not on a card) plus this HUD into `out`. */
  composite(gl: HTMLCanvasElement, out: CanvasRenderingContext2D): void {
    const { width, height } = out.canvas;
    if (this.endCard === null) out.drawImage(gl, 0, 0, width, height);
    this.draw(out, width, height);
  }

  /** The HUD itself, at any resolution. */
  draw(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const u = Math.min(w, h) / REF_SHORT_SIDE;
    if (this.endCard !== null) this.drawEndCard(ctx, this.endCard, u, w, h);
    this.drawTitle(ctx, u);
    const card = this.model.current;
    if (card !== null) {
      this.drawLowerThird(ctx, u, h, card, this.model.opacity, this.model.entrance);
    }
    this.drawTitleCard(ctx, u, w, h);
    for (const v of this.promo.visible) this.drawPromoOverlay(ctx, v, u, w, h);
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
    ctx.font = `700 ${22 * u}px ${INTER}`;
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
    ctx.font = `800 ${titleSize}px ${INTER}`;
    setSpacing(ctx, titleSize * WORDMARK_SPACING_EM);
    ctx.fillStyle = p.concrete100;
    shadowText(ctx, card.title, cx, top + titleSize * 0.8, u);
    setSpacing(ctx, 0);
    // The accent: a short bar in the deck colour, like the lower-thirds' edge.
    const barY = top + titleSize * 0.8 + 20 * u;
    ctx.fillStyle = p.deck;
    ctx.fillRect(cx - 28 * u, barY, 56 * u, 5 * u);
    // The pun, in the credit face.
    const taglineY = barY + 39 * u;
    ctx.font = `400 ${20 * u}px ${SPACE_MONO}`;
    ctx.fillStyle = p.concrete100;
    shadowText(ctx, card.tagline, cx, taglineY, u);
    // The credit, with the pixel penguin (crisp nearest-neighbour pixels).
    ctx.font = `400 ${14 * u}px ${SPACE_MONO}`;
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
    ctx.font = `400 ${13 * u}px ${SPACE_MONO}`;
    ctx.fillStyle = this.presentation.palette.ink;
    ctx.fillText(hint, w - MARGIN * 0.6 * u, h - MARGIN * 0.6 * u);
    ctx.restore();
  }

  private drawLowerThird(
    ctx: CanvasRenderingContext2D,
    u: number,
    h: number,
    card: LowerThird,
    opacity: number,
    entrance: number,
  ): void {
    if (opacity <= 0) return;
    const p = this.presentation.palette;
    const slide = (1 - entrance) ** 2 * 36 * u;
    const text = card.tone === "bail" ? card.text.toLowerCase() : card.text;
    // A long line name shrinks to fit a narrow (portrait) frame.
    const maxNameW = ctx.canvas.width - 2 * MARGIN * u - 36 * u;
    const baseSize = (card.tone === "bail" ? 34 : 46) * u;
    const nameSize = fitFontPx(ctx, text, `800 %px ${INTER}`, maxNameW, baseSize, 0);
    const captionSize = 17 * u;
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.font = `800 ${nameSize}px ${INTER}`;
    const nameW = ctx.measureText(text).width;
    ctx.font = `600 ${captionSize}px ${INTER}`;
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
    ctx.font = `800 ${nameSize}px ${INTER}`;
    ctx.fillText(text, x + padX, top + 13 * u);
    if (caption !== "") {
      ctx.fillStyle = p.concrete600;
      ctx.font = `600 ${captionSize}px ${INTER}`;
      setSpacing(ctx, 1.5 * u);
      ctx.fillText(caption, x + padX, top + 13 * u + nameSize + 8 * u);
    }
    ctx.restore();
  }

  private drawPromoOverlay(
    ctx: CanvasRenderingContext2D,
    v: VisibleOverlay,
    u: number,
    w: number,
    h: number,
  ): void {
    const o = v.overlay;
    if (o.kind === "lowerThird") {
      const card: LowerThird = { text: o.text, caption: o.caption ?? "", tone: "trick" };
      this.drawLowerThird(ctx, u, h, card, v.opacity, v.entrance);
      return;
    }
    const p = this.presentation.palette;
    ctx.save();
    // A soft ink scrim from the top edge keeps light text readable over the bright plaza.
    const scrimH = (o.kind === "wordmark" ? (o.atY ?? 0.2) + 0.16 : 0.2) * h;
    const scrim = ctx.createLinearGradient(0, 0, 0, scrimH);
    scrim.addColorStop(0, hexWithAlpha(p.ink, 0.5));
    scrim.addColorStop(1, hexWithAlpha(p.ink, 0));
    ctx.globalAlpha = v.opacity;
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, w, scrimH);
    const rise = (1 - v.entrance) ** 2 * 14 * u;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = p.concrete100;
    if (o.kind === "wordmark") {
      const y = (o.atY ?? 0.2) * h + rise;
      const size = fitFontPx(
        ctx,
        o.text,
        `800 %px ${INTER}`,
        0.86 * w,
        128 * u,
        WORDMARK_SPACING_EM,
      );
      ctx.font = `800 ${size}px ${INTER}`;
      setSpacing(ctx, WORDMARK_SPACING_EM * size);
      softShadow(ctx, u);
      ctx.fillText(o.text, w / 2, y);
      setSpacing(ctx, 0);
      // The deck-red bar under the wordmark (the intro's title card).
      const barY = y + size * 0.5;
      ctx.shadowColor = "transparent";
      ctx.fillStyle = p.deck;
      ctx.fillRect(w / 2 - 0.29 * size, barY, 0.58 * size, 0.052 * size);
      if (o.sub !== undefined) {
        const subSize = size * 0.24;
        ctx.fillStyle = p.concrete100;
        ctx.font = `400 ${subSize}px ${SPACE_MONO}`;
        softShadow(ctx, u);
        ctx.fillText(o.sub, w / 2, barY + 0.052 * size + subSize * 1.1);
      }
    } else {
      const size = fitFontPx(ctx, o.text, `700 %px ${INTER}`, 0.86 * w, 40 * u, 0);
      ctx.font = `700 ${size}px ${INTER}`;
      softShadow(ctx, u);
      ctx.fillText(o.text, w / 2, 0.085 * h + rise);
    }
    ctx.restore();
  }

  /**
   * The closing card: the intro's title card on the v4rgas black (STYLE.md "Wordmark"):
   * TWO FEET, a short deck-red bar, the tagline, the pixel penguin beside the credit, the
   * site, and a small line at the bottom.
   */
  private drawEndCard(
    ctx: CanvasRenderingContext2D,
    card: EndCard,
    u: number,
    w: number,
    h: number,
  ): void {
    const p = this.presentation.palette;
    ctx.save();
    ctx.fillStyle = V4RGAS_BLACK;
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    const cx = w / 2;
    const titleSize = fitFontPx(
      ctx,
      card.title,
      `800 %px ${INTER}`,
      0.84 * w,
      124 * u,
      WORDMARK_SPACING_EM,
    );
    const taglineSize = 30 * u;
    const creditSize = 28 * u;
    const urlSize = 40 * u;
    const penguinPx =
      card.penguin && this.penguin !== null ? 32 * Math.max(1, Math.floor((64 * u) / 32)) : 0;
    const barH = 7 * u;
    const gap = 30 * u;
    const rowH = Math.max(penguinPx, creditSize);
    const stackH =
      titleSize * 0.74 +
      gap * 0.7 +
      barH +
      gap +
      taglineSize +
      gap * 1.6 +
      rowH +
      gap * 1.4 +
      urlSize;
    let y = (h - stackH) / 2;
    // The wordmark.
    y += titleSize * 0.74;
    ctx.fillStyle = p.concrete100;
    ctx.font = `800 ${titleSize}px ${INTER}`;
    setSpacing(ctx, WORDMARK_SPACING_EM * titleSize);
    ctx.fillText(card.title, cx, y);
    setSpacing(ctx, 0);
    // The deck-red bar.
    y += gap * 0.7;
    ctx.fillStyle = p.deck;
    ctx.fillRect(cx - 40 * u, y, 80 * u, barH);
    y += barH + gap + taglineSize * 0.8;
    // The pun, in the credit face.
    if (card.tagline !== "") {
      ctx.fillStyle = p.concrete100;
      ctx.font = `400 ${taglineSize}px ${SPACE_MONO}`;
      ctx.fillText(card.tagline, cx, y);
    }
    y += taglineSize * 0.2 + gap * 1.6;
    // The pixel penguin beside the credit (crisp nearest-neighbour pixels).
    ctx.font = `700 ${creditSize}px ${SPACE_MONO}`;
    const creditW = ctx.measureText(card.credit).width;
    const spacing = penguinPx > 0 ? 16 * u : 0;
    const left = cx - (penguinPx + spacing + creditW) / 2;
    if (penguinPx > 0 && this.penguin !== null) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.penguin, Math.round(left), Math.round(y), penguinPx, penguinPx);
      ctx.imageSmoothingEnabled = true;
    }
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = V4RGAS_MUTED;
    ctx.fillText(card.credit, left + penguinPx + spacing, y + rowH / 2);
    y += rowH + gap * 1.4 + urlSize * 0.8;
    // "v4rgas" in white, ".com" muted (the banner's lockup), centred as one line.
    ctx.textBaseline = "alphabetic";
    ctx.font = `700 ${urlSize}px ${SPACE_MONO}`;
    const dot = card.url.lastIndexOf(".");
    const name = dot > 0 ? card.url.slice(0, dot) : card.url;
    const tld = dot > 0 ? card.url.slice(dot) : "";
    const nameW = ctx.measureText(name).width;
    const tldW = ctx.measureText(tld).width;
    const x0 = cx - (nameW + tldW) / 2;
    ctx.fillStyle = V4RGAS_WHITE;
    ctx.fillText(name, x0, y);
    ctx.fillStyle = V4RGAS_MUTED;
    ctx.fillText(tld, x0 + nameW, y);
    if (card.line !== "") {
      ctx.textAlign = "center";
      const lineSize = fitFontPx(ctx, card.line, `600 %px ${INTER}`, 0.84 * w, 21 * u, 0.06);
      ctx.font = `600 ${lineSize}px ${INTER}`;
      setSpacing(ctx, 0.06 * lineSize);
      ctx.fillStyle = p.concrete600;
      ctx.fillText(card.line, cx, h - MARGIN * 1.4 * u);
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

/**
 * The largest font size ≤ `maxPx` at which `text` fits in `maxWidth` (`font` has "%" where
 * the size goes; `spacingEm` is the letter spacing it will be drawn with).
 */
function fitFontPx(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: string,
  maxWidth: number,
  maxPx: number,
  spacingEm: number,
): number {
  const probe = 100;
  ctx.save();
  ctx.font = font.replace("%", String(probe));
  setSpacing(ctx, 0);
  const width = ctx.measureText(text).width + spacingEm * probe * Math.max(0, text.length - 1);
  ctx.restore();
  return Math.min(maxPx, (probe * maxWidth) / Math.max(1, width));
}

function setSpacing(ctx: CanvasRenderingContext2D, px: number): void {
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${px}px`;
}

function softShadow(ctx: CanvasRenderingContext2D, u: number): void {
  ctx.shadowColor = "rgba(28, 27, 25, 0.6)";
  ctx.shadowBlur = 16 * u;
  ctx.shadowOffsetY = 2 * u;
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
