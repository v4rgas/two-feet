import type { FootId } from "../../shared";
import type { PresentationConfig } from "../presentation.config";
import type { RenderFrame } from "../render-frame";
import "./hud.css";
import type { PadLayout } from "./hud-model";
import {
  AirtimeModel,
  balanceInDanger,
  balanceMarkerX,
  grindLabel,
  isPressingTail,
  nextTrailIntensity,
  PopupModel,
  padLayout,
  spinIndicator,
  stanceLabel,
} from "./hud-model";

/** Travel of the stick dot from the pad centre at full deflection, px. */
const DOT_TRAVEL_PX = 30;
const KEY_LABELS = { left: "WASD", right: "← ↑ ↓ →" } as const;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  parent: HTMLElement,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  parent.appendChild(node);
  return node;
}

/** One foot pad widget. `side` is fixed (key cluster); the foot it shows depends on stance. */
class FootPad {
  private readonly root: HTMLDivElement;
  private readonly dot: HTMLDivElement;
  private readonly ring: HTMLDivElement;
  private readonly role: HTMLSpanElement;
  private readonly trail: HTMLDivElement[] = [];
  /** Ring buffer of past dot positions, px (x, y interleaved). */
  private readonly history: Float32Array;
  private historyHead = 0;
  private trailIntensity = 0;
  private foot: FootId | null = null;
  private detached: boolean | null = null;
  private lastDotX = Number.NaN;
  private lastDotY = Number.NaN;
  private lastRing = -1;

  constructor(
    parent: HTMLElement,
    side: "left" | "right",
    private readonly config: PresentationConfig,
  ) {
    this.root = el("div", "skate-pad", parent);
    this.root.dataset.side = side;
    const box = el("div", "skate-pad-box", this.root);
    const trailLength = config.hud.flickTrailLength;
    for (let i = 0; i < trailLength; i += 1) this.trail.push(el("div", "skate-pad-trail", box));
    this.history = new Float32Array(Math.max(1, trailLength) * 2);
    this.ring = el("div", "skate-pad-ring", box);
    this.dot = el("div", "skate-pad-dot", box);
    const caption = el("div", "skate-pad-caption", this.root);
    el("span", "skate-pad-keys", caption).textContent = KEY_LABELS[side];
    this.role = el("span", "skate-pad-role", caption);
  }

  update(frame: RenderFrame, foot: FootId, dtS: number): void {
    const { palette, hud } = this.config;
    if (foot !== this.foot) {
      this.foot = foot;
      this.root.style.setProperty(
        "--pad-color",
        foot === "front" ? palette.frontFoot : palette.backFoot,
      );
      this.role.textContent = foot;
    }
    const detached = frame.rider[foot].contact !== "attached";
    if (detached !== this.detached) {
      this.detached = detached;
      this.root.dataset.detached = String(detached);
    }

    const intent = frame.intents[foot];
    // Stick y = toward the nose = screen up; x = +Z = screen right (camera behind the board).
    const dx = Math.round(intent.stick.x * DOT_TRAVEL_PX);
    const dy = Math.round(-intent.stick.y * DOT_TRAVEL_PX);
    if (dx !== this.lastDotX || dy !== this.lastDotY) {
      this.lastDotX = dx;
      this.lastDotY = dy;
      this.dot.style.transform = `translate(${dx}px, ${dy}px)`;
      this.ring.style.transform = this.dot.style.transform;
    }
    const ring = isPressingTail(foot, intent.stick.y, hud) ? 1 : 0;
    if (ring !== this.lastRing) {
      this.lastRing = ring;
      this.ring.style.opacity = String(ring);
    }

    const v = intent.stickVelocityPerS;
    this.trailIntensity = nextTrailIntensity(this.trailIntensity, Math.hypot(v.x, v.y), dtS, hud);
    this.updateTrail(dx, dy);
  }

  private updateTrail(dx: number, dy: number): void {
    const n = this.trail.length;
    if (n === 0) return;
    this.history[this.historyHead * 2] = dx;
    this.history[this.historyHead * 2 + 1] = dy;
    this.historyHead = (this.historyHead + 1) % n;
    for (let i = 0; i < n; i += 1) {
      const node = this.trail[i];
      if (node === undefined) continue;
      // i = 0 is the most recent sample.
      const slot = (this.historyHead - 1 - i + n * 2) % n;
      const opacity = this.trailIntensity * (1 - (i + 1) / (n + 1));
      if (opacity <= 0.01) {
        if (node.style.opacity !== "0") node.style.opacity = "0";
        continue;
      }
      node.style.opacity = opacity.toFixed(2);
      node.style.transform = `translate(${this.history[slot * 2]}px, ${this.history[slot * 2 + 1]}px)`;
    }
  }

  dispose(): void {
    this.root.remove();
  }
}

/**
 * DOM HUD (STYLE.md §HUD): two foot pads laid out like the keys, a trick popup and an
 * airtime readout. Reads the `RenderFrame` only.
 */
export class Hud {
  private readonly root: HTMLDivElement;
  private readonly leftPad: FootPad;
  private readonly rightPad: FootPad;
  private readonly popup: HTMLDivElement;
  private readonly airtime: HTMLDivElement;
  private readonly airtimeValue: HTMLSpanElement;
  private readonly airtimeFill: HTMLDivElement;
  private readonly stance: HTMLDivElement;
  private lastStance = "";
  private readonly spin: HTMLDivElement;
  private lastSpin = "";
  private readonly balance: HTMLDivElement;
  private readonly balanceName: HTMLDivElement;
  private readonly balanceMark: HTMLDivElement;
  private balanceLabel = "";
  private lastBalanceKey = "";
  private readonly config: PresentationConfig;
  private readonly popupModel: PopupModel;
  private readonly airtimeModel: AirtimeModel;
  private layout: PadLayout | null = null;
  private lastPopupOpacity = -1;
  private lastAirtimeText = "";
  private lastAirOpacity = -1;

  constructor(parent: HTMLElement, config: PresentationConfig) {
    this.root = el("div", "skate-hud", parent);
    const { palette } = config;
    const vars: Record<string, string> = {
      "--ink": palette.ink,
      "--warn": palette.warn,
      "--concrete-100": palette.concrete100,
      "--concrete-600": palette.concrete600,
    };
    for (const [name, value] of Object.entries(vars)) this.root.style.setProperty(name, value);

    this.popup = el("div", "skate-popup", this.root);
    this.airtime = el("div", "skate-airtime", this.root);
    const row = el("div", "skate-airtime-row", this.airtime);
    el("span", "", row).textContent = "air";
    this.airtimeValue = el("span", "skate-airtime-value", row);
    const bar = el("div", "skate-airtime-bar", this.airtime);
    this.airtimeFill = el("div", "skate-airtime-fill", bar);

    this.balance = el("div", "skate-balance", this.root);
    this.balanceName = el("div", "skate-balance-name", this.balance);
    const track = el("div", "skate-balance-track", this.balance);
    this.balanceMark = el("div", "skate-balance-mark", track);
    this.config = config;

    this.stance = el("div", "skate-stance", this.root);
    this.spin = el("div", "skate-spin", this.root);

    this.leftPad = new FootPad(this.root, "left", config);
    this.rightPad = new FootPad(this.root, "right", config);
    this.popupModel = new PopupModel(config.hud);
    this.airtimeModel = new AirtimeModel(config.hud);
  }

  update(frame: RenderFrame, dtS: number): void {
    this.layout = padLayout(frame.stance);
    const stanceKey = `${frame.stance}/${frame.assistLevel ?? ""}`;
    if (stanceKey !== this.lastStance) {
      this.lastStance = stanceKey;
      this.stance.textContent = stanceLabel(frame.stance, frame.assistLevel);
      this.stance.dataset.stance = frame.stance;
    }
    const spin = spinIndicator(
      frame.intents.spin,
      frame.rider.windUpRad,
      frame.rider.bodySpinRateRadps,
    );
    if (spin !== this.lastSpin) {
      this.lastSpin = spin;
      this.spin.textContent = spin;
    }
    this.leftPad.update(frame, this.layout.left, dtS);
    this.rightPad.update(frame, this.layout.right, dtS);
    this.updatePopup(frame, dtS);
    this.updateAirtime(frame, dtS);
    this.updateBalance(frame);
  }

  /** Grind balance bar (M4): shown while locked on an edge; the marker drifts with it. */
  private updateBalance(frame: RenderFrame): void {
    const label = grindLabel(frame.recentEvents, this.balanceLabel);
    if (label !== this.balanceLabel) {
      this.balanceLabel = label;
      this.balanceName.textContent = label;
    }
    const grind = frame.rider.grind;
    const on = grind !== null;
    const x = on ? balanceMarkerX(grind.balance, frame.stance) : 0;
    const danger = on && balanceInDanger(grind.balance, this.config.hud);
    const key = `${on}|${x.toFixed(3)}|${danger}`;
    if (key === this.lastBalanceKey) return;
    this.lastBalanceKey = key;
    this.balance.dataset.on = String(on);
    this.balance.dataset.danger = String(danger);
    // Half the track (100 px) at full balance.
    this.balanceMark.style.transform = `translateX(${(x * 98).toFixed(1)}px)`;
  }

  private updatePopup(frame: RenderFrame, dtS: number): void {
    const popup = this.popupModel;
    popup.advance(dtS);
    const before = popup.message;
    const beforeAge = popup.ageS;
    for (const event of frame.recentEvents) popup.onEvent(event);
    if (popup.message !== null && (popup.message !== before || popup.ageS < beforeAge)) {
      this.popup.textContent = popup.message.text;
      this.popup.dataset.tone = popup.message.tone;
    }
    const opacity = Math.round(popup.opacity * 100) / 100;
    if (opacity !== this.lastPopupOpacity) {
      this.lastPopupOpacity = opacity;
      // Slight rise while fading in: reads as a pop without being flashy.
      const rise = (1 - Math.min(1, popup.ageS / 0.2)) * 8;
      this.popup.style.opacity = String(opacity);
      this.popup.style.transform = `translateY(${rise.toFixed(1)}px)`;
    }
  }

  private updateAirtime(frame: RenderFrame, dtS: number): void {
    const board = frame.currentBoard;
    // On a grind edge the board is off the ground but not in the air.
    const onEdge = frame.rider.grind !== null;
    const live = onEdge ? null : (frame.air?.airtimeS ?? (board.grounded ? null : board.airtimeS));
    this.airtimeModel.update(live, dtS);
    const text = `${this.airtimeModel.shownS.toFixed(2)} s`;
    if (text !== this.lastAirtimeText) {
      this.lastAirtimeText = text;
      this.airtimeValue.textContent = text;
      this.airtimeFill.style.transform = `scaleX(${this.airtimeModel.fill.toFixed(3)})`;
    }
    const opacity = Math.round(this.airtimeModel.opacity * 100) / 100;
    if (opacity !== this.lastAirOpacity) {
      this.lastAirOpacity = opacity;
      this.airtime.style.opacity = String(opacity);
    }
  }

  dispose(): void {
    this.leftPad.dispose();
    this.rightPad.dispose();
    this.root.remove();
  }
}
