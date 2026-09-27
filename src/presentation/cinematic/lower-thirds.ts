import type { DomainEvent } from "../../shared";
import type { CinematicConfig } from "./cinematic.config";

/**
 * VIDEO HUD MODEL (montage): the trick popup restyled as a skate-video lower-third, plus a
 * clip title card. Pure state driven by domain events and VIDEO time; drawn by
 * `drawVideoHud`.
 */

export interface LowerThird {
  readonly text: string;
  /** Small line under the name, or "". */
  readonly caption: string;
  readonly tone: "trick" | "bail";
}

/** Opacity of a card at `ageS`: fade in, hold, fade out (0 outside). */
export function cardOpacity(
  ageS: number,
  fadeInS: number,
  holdS: number,
  fadeOutS: number,
): number {
  if (ageS < 0) return 0;
  if (ageS < fadeInS) return fadeInS <= 0 ? 1 : ageS / fadeInS;
  const out = ageS - fadeInS - holdS;
  if (out <= 0) return 1;
  if (out >= fadeOutS) return 0;
  return 1 - out / fadeOutS;
}

/** How a clip shows its landed tricks. */
export interface TrickCards {
  readonly show: boolean;
  readonly caption: string;
}

export class LowerThirdsModel {
  current: LowerThird | null = null;
  ageS = Number.POSITIVE_INFINITY;
  title = "";
  /** "01 / 06" style clip counter, or "". */
  counter = "";
  titleAgeS = Number.POSITIVE_INFINITY;
  /** Landed tricks show as lower-thirds (off for a promo shot that carries its own text). */
  private showTricks = true;
  /** The small line under every trick's name (the intro's "0.61 m drop"), or "". */
  trickCaption = "";
  /** Video time since the title card was cued (it shows after its delay), s. */
  cardAgeS = Number.NEGATIVE_INFINITY;
  private cardFade = { delayS: 0, fadeInS: 0 };

  constructor(private readonly config: CinematicConfig["lowerThird"]) {}

  /**
   * A new clip: its title card starts, the previous lower-third is cleared. `tricks` says
   * whether landed tricks get a lower-third, and with which caption.
   */
  startClip(
    title: string,
    index: number,
    total: number,
    tricks: TrickCards = { show: true, caption: "" },
  ): void {
    this.showTricks = tricks.show;
    this.trickCaption = tricks.caption;
    this.title = title;
    this.counter = total > 1 ? `${pad2(index + 1)} / ${pad2(total)}` : "";
    this.titleAgeS = 0;
    this.cardAgeS = Number.NEGATIVE_INFINITY;
    this.current = null;
    this.ageS = Number.POSITIVE_INFINITY;
  }

  onEvent(event: DomainEvent): void {
    if (event.type === "TrickLanded") {
      if (this.showTricks) {
        this.show({ text: event.name, caption: this.trickCaption, tone: "trick" });
      }
    } else if (event.type === "RiderBailed") {
      this.show({ text: "bail", caption: "", tone: "bail" });
    }
  }

  advance(dtS: number): void {
    this.ageS += dtS;
    this.titleAgeS += dtS;
    this.cardAgeS += dtS;
  }

  /**
   * Cues the title card (the intro's wordmark): it fades in after `delayS` of video time
   * over `fadeInS` and stays until the clip ends. A second cue keeps the first.
   */
  cueTitleCard(delayS: number, fadeInS: number): void {
    if (this.cardAgeS !== Number.NEGATIVE_INFINITY) return;
    this.cardFade = { delayS, fadeInS };
    this.cardAgeS = 0;
  }

  /** 0 before the card is cued and during its delay, then fades in to 1 and holds. */
  get titleCardOpacity(): number {
    const { delayS, fadeInS } = this.cardFade;
    const t = this.cardAgeS - delayS;
    if (!(t > 0)) return 0;
    return fadeInS <= 0 ? 1 : Math.min(1, t / fadeInS);
  }

  get opacity(): number {
    if (this.current === null) return 0;
    const c = this.config;
    return cardOpacity(this.ageS, c.fadeInS, c.holdS, c.fadeOutS);
  }

  get titleOpacity(): number {
    if (this.title === "") return 0;
    const c = this.config;
    return cardOpacity(this.titleAgeS, c.fadeInS, c.titleHoldS, c.fadeOutS);
  }

  /** 0 → 1 over the fade-in (drives the slide-in of the card). */
  get entrance(): number {
    const f = this.config.fadeInS;
    return f <= 0 ? 1 : Math.min(1, Math.max(0, this.ageS / f));
  }

  private show(card: LowerThird): void {
    this.current = card;
    this.ageS = 0;
  }
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
