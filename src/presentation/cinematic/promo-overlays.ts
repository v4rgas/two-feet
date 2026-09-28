import { cardOpacity } from "./lower-thirds";

/*
 * PROMO TEXT OVERLAYS (video HUD). A promo video carries its message in on-screen text
 * (social feeds autoplay muted): a big wordmark title, a small kicker line, a lower-third
 * and a full-frame end card. Plain data plus a pure timing model; `VideoHud` draws them.
 * Times: an overlay starts when the item's CLIP time (simulation s) reaches `fromS`, so it
 * lands on the action; it then holds for `holdS` of VIDEO time (steady through slow motion).
 */

interface OverlayTiming {
  /** Item (clip) time it appears at, simulation s (cards: video s from the card start). */
  readonly fromS: number;
  /** How long it stays fully visible, video s. */
  readonly holdS: number;
  /** Fade-in, video s (default: the lower-third's). 0 = on at once (a hook frame). */
  readonly fadeInS?: number;
  /** Fade-out, video s (default: the lower-third's). */
  readonly fadeOutS?: number;
}

/** The big title: "TWO FEET" in heavy caps, a small line under it. */
export interface WordmarkOverlay extends OverlayTiming {
  readonly kind: "wordmark";
  readonly text: string;
  readonly sub?: string;
  /** Vertical centre of the title as a fraction of the frame height (default 0.2). */
  readonly atY?: number;
}

/** A short line at the top centre ("You control each foot."). */
export interface KickerOverlay extends OverlayTiming {
  readonly kind: "kicker";
  readonly text: string;
  /** Vertical centre as a fraction of the frame height (default 0.085; stack lines below). */
  readonly atY?: number;
}

/** A lower-third card with a fixed text (the trick lower-third is automatic, from events). */
export interface LowerThirdOverlay extends OverlayTiming {
  readonly kind: "lowerThird";
  readonly text: string;
  readonly caption?: string;
}

export type TextOverlay = WordmarkOverlay | KickerOverlay | LowerThirdOverlay;

/** The closing card: a full frame over black. */
export interface EndCard {
  /** The game's wordmark, e.g. "TWO FEET". */
  readonly title: string;
  /** The pun under the wordmark's bar, e.g. "two feet. one board." (Space Mono), or "". */
  readonly tagline: string;
  /** Credit line beside the penguin, e.g. "a game by v4rgas" (Space Mono). */
  readonly credit: string;
  /** Site, e.g. "v4rgas.com": the part after the last "." is drawn muted. */
  readonly url: string;
  /** Small line at the bottom, or "". */
  readonly line: string;
  /** Draw the v4rgas 32 × 32 pixel penguin (nearest-neighbour) beside the credit. */
  readonly penguin: boolean;
}

/** Default fades of overlays, video s. */
export interface OverlayFades {
  readonly fadeInS: number;
  readonly fadeOutS: number;
}

/** One overlay to draw now, with its opacity and entrance (0 → 1 over its fade-in). */
export interface VisibleOverlay {
  readonly overlay: TextOverlay;
  readonly opacity: number;
  readonly entrance: number;
}

/** Which overlays show, and how much, as an item plays. Pure (tests drive it). */
export class PromoOverlayModel {
  private overlays: readonly TextOverlay[] = [];
  /** Video age of each started overlay, s (NaN = not started yet). */
  private ages: number[] = [];

  constructor(private readonly fades: OverlayFades) {}

  /** A new item: its overlays, none started. */
  start(overlays: readonly TextOverlay[]): void {
    this.overlays = overlays;
    this.ages = overlays.map(() => Number.NaN);
  }

  /** Advances by `dtS` of video; starts overlays whose `fromS` the item time has reached. */
  advance(itemTimeS: number, dtS: number): void {
    this.overlays.forEach((o, i) => {
      const age = this.ages[i] ?? Number.NaN;
      if (!Number.isNaN(age)) this.ages[i] = age + dtS;
      else if (itemTimeS >= o.fromS - 1e-9) this.ages[i] = 0;
    });
  }

  get visible(): VisibleOverlay[] {
    const out: VisibleOverlay[] = [];
    this.overlays.forEach((overlay, i) => {
      const age = this.ages[i] ?? Number.NaN;
      if (Number.isNaN(age)) return;
      const fadeIn = overlay.fadeInS ?? this.fades.fadeInS;
      const fadeOut = overlay.fadeOutS ?? this.fades.fadeOutS;
      const opacity = cardOpacity(age, fadeIn, overlay.holdS, fadeOut);
      if (opacity <= 0) return;
      const entrance = fadeIn <= 0 ? 1 : Math.min(1, age / fadeIn);
      out.push({ overlay, opacity, entrance });
    });
    return out;
  }
}
