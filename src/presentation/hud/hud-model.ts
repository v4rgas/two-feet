import { footForCluster } from "../../contexts/input";
import type { DomainEvent, FootId, Stance } from "../../shared";
import type { PresentationConfig } from "../presentation.config";

/**
 * Pure HUD logic (no DOM): which pad shows which foot, popup timing and text, flick trail
 * and airtime readout. The DOM widgets in `hud.ts` only draw what these return.
 */

type HudConfig = PresentationConfig["hud"];

/** Which foot each on-screen pad shows. The WASD pad is always left, arrows always right. */
export interface PadLayout {
  readonly left: FootId;
  readonly right: FootId;
}

const LAYOUTS: Readonly<Record<Stance, PadLayout>> = Object.freeze({
  regular: Object.freeze({
    left: footForCluster("regular", "left"),
    right: footForCluster("regular", "right"),
  }),
  goofy: Object.freeze({
    left: footForCluster("goofy", "left"),
    right: footForCluster("goofy", "right"),
  }),
});

/** Pad layout for a stance (STYLE.md: pads match the keys; colors stay with front/back). */
export function padLayout(stance: Stance): PadLayout {
  return LAYOUTS[stance];
}

/** Stance label: the stance and its ollie keys (MECHANICS.md), so the active one is obvious. */
export function stanceLabel(stance: Stance): string {
  return stance === "regular" ? "regular · ollie ↓+S, let go ↓" : "goofy · ollie S+↓, let go S";
}

/** True when the pad should show the "holding the tail" ring. */
export function isPressingTail(foot: FootId, stickY: number, config: HudConfig): boolean {
  return foot === "back" && stickY <= config.tailRingStickY;
}

/** Popup opacity in [0, 1] at `ageS` after it appeared: fade in, hold, fade out. */
export function popupOpacity(ageS: number, config: HudConfig): number {
  const { popupDurationS: total, popupFadeInS: fadeIn, popupFadeOutS: fadeOut } = config;
  if (ageS < 0 || ageS >= total) return 0;
  if (ageS < fadeIn) return ageS / fadeIn;
  const fadeOutStart = total - fadeOut;
  if (ageS > fadeOutStart) return (total - ageS) / fadeOut;
  return 1;
}

/** What the trick popup should display. */
export interface PopupMessage {
  readonly text: string;
  readonly tone: "trick" | "bail";
}

const BAIL_MESSAGE: PopupMessage = Object.freeze({ text: "bail", tone: "bail" });

/**
 * Picks the popup message for one domain event, or null if the event does not show one.
 * `TrickLanded` → trick name; `TrickBailed` / `RiderBailed` → "bail".
 */
export function popupForEvent(event: DomainEvent): PopupMessage | null {
  switch (event.type) {
    case "TrickLanded":
      return { text: event.name, tone: "trick" };
    case "TrickBailed":
    case "RiderBailed":
      return BAIL_MESSAGE;
    default:
      return null;
  }
}

/**
 * Popup state machine. A bail right after another bail (e.g. `TrickBailed` then
 * `RiderBailed` for the same landing) does not restart the popup.
 */
export class PopupModel {
  message: PopupMessage | null = null;
  ageS = Number.POSITIVE_INFINITY;

  constructor(private readonly config: HudConfig) {}

  onEvent(event: DomainEvent): void {
    const next = popupForEvent(event);
    if (next === null) return;
    const showing = this.ageS < this.config.popupDurationS;
    if (showing && next.tone === "bail" && this.message?.tone === "bail") return;
    this.message = next;
    this.ageS = 0;
  }

  advance(dtS: number): void {
    this.ageS += dtS;
  }

  get opacity(): number {
    return this.message === null ? 0 : popupOpacity(this.ageS, this.config);
  }
}

/**
 * Flick trail intensity in [0, 1]: jumps to 1 when the stick moves faster than the flick
 * threshold, then decays linearly over `flickTrailHoldS`.
 */
export function nextTrailIntensity(
  current: number,
  stickSpeedPerS: number,
  dtS: number,
  config: HudConfig,
): number {
  if (stickSpeedPerS >= config.flickTrailMinSpeedPerS) return 1;
  if (config.flickTrailHoldS <= 0) return 0;
  return Math.max(0, current - dtS / config.flickTrailHoldS);
}

/** Airtime readout: the live airtime while airborne, held for a while after landing. */
export class AirtimeModel {
  /** Value to show, s. */
  shownS = 0;
  /** Readout opacity in [0, 1]. */
  opacity = 0;
  private sinceLandingS = Number.POSITIVE_INFINITY;

  constructor(private readonly config: HudConfig) {}

  /** `airtimeS` is the live airtime, or null while grounded. */
  update(airtimeS: number | null, dtS: number): void {
    if (airtimeS !== null && airtimeS > 0) {
      this.shownS = airtimeS;
      this.sinceLandingS = 0;
      this.opacity = 1;
      return;
    }
    this.sinceLandingS += dtS;
    const hold = this.config.airtimeHoldS;
    this.opacity = this.sinceLandingS >= hold ? 0 : 1 - this.sinceLandingS / hold;
  }

  /** Bar fill in [0, 1]. */
  get fill(): number {
    return Math.min(1, this.shownS / this.config.airtimeFullScaleS);
  }
}
