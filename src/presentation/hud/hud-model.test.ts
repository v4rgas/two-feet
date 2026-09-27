import { describe, expect, it } from "vitest";
import type { DomainEvent } from "../../shared";
import { Vec3 } from "../../shared";
import { PRESENTATION_CONFIG } from "../presentation.config";
import {
  AirtimeModel,
  isPressingTail,
  nextTrailIntensity,
  PopupModel,
  padLayout,
  popupForEvent,
  popupOpacity,
} from "./hud-model";

const HUD = PRESENTATION_CONFIG.hud;
const ROTATION = { rollRad: 0, yawRad: 0, pitchRad: 0 };
const landed: DomainEvent = {
  type: "TrickLanded",
  tick: 1,
  timeS: 0,
  trickId: "kickflip",
  name: "Kickflip",
  stance: "regular",
  rotation: ROTATION,
  airtimeS: 0.5,
};
const trickBailed: DomainEvent = {
  type: "TrickBailed",
  tick: 1,
  timeS: 0,
  trickId: null,
  reason: "upsideDown",
  rotation: ROTATION,
  airtimeS: 0.5,
};
const riderBailed: DomainEvent = { type: "RiderBailed", tick: 1, timeS: 0, reason: "upsideDown" };

describe("padLayout", () => {
  it("keeps WASD on the left and arrows on the right; the foot swaps with stance", () => {
    expect(padLayout("regular")).toEqual({ left: "front", right: "back" });
    expect(padLayout("goofy")).toEqual({ left: "back", right: "front" });
  });
});

describe("isPressingTail", () => {
  it("rings only for the back foot held toward the tail", () => {
    expect(isPressingTail("back", -1, HUD)).toBe(true);
    expect(isPressingTail("back", -0.2, HUD)).toBe(false);
    expect(isPressingTail("front", -1, HUD)).toBe(false);
  });
});

describe("popup", () => {
  it("fades in, holds and fades out over ~1.2 s", () => {
    expect(HUD.popupDurationS).toBeCloseTo(1.2);
    expect(popupOpacity(0, HUD)).toBe(0);
    expect(popupOpacity(HUD.popupFadeInS / 2, HUD)).toBeCloseTo(0.5);
    expect(popupOpacity(0.5, HUD)).toBe(1);
    expect(popupOpacity(HUD.popupDurationS - HUD.popupFadeOutS / 2, HUD)).toBeCloseTo(0.5);
    expect(popupOpacity(HUD.popupDurationS, HUD)).toBe(0);
    expect(popupOpacity(-0.1, HUD)).toBe(0);
  });

  it("maps events to messages", () => {
    expect(popupForEvent(landed)).toEqual({ text: "Kickflip", tone: "trick" });
    expect(popupForEvent(trickBailed)).toEqual({ text: "bail", tone: "bail" });
    expect(popupForEvent(riderBailed)?.tone).toBe("bail");
    expect(
      popupForEvent({ type: "BoardLeftGround", tick: 0, timeS: 0, velocityMps: Vec3.ZERO }),
    ).toBeNull();
  });

  it("does not restart a bail popup for the second bail event of the same landing", () => {
    const popup = new PopupModel(HUD);
    popup.onEvent(trickBailed);
    popup.advance(0.3);
    popup.onEvent(riderBailed);
    expect(popup.ageS).toBeCloseTo(0.3);
    popup.onEvent(landed);
    expect(popup.message?.text).toBe("Kickflip");
    expect(popup.ageS).toBe(0);
  });
});

describe("flick trail", () => {
  it("lights up on a fast stick and decays over the hold time", () => {
    expect(nextTrailIntensity(0, HUD.flickTrailMinSpeedPerS + 1, 1 / 60, HUD)).toBe(1);
    expect(nextTrailIntensity(1, 0, HUD.flickTrailHoldS / 2, HUD)).toBeCloseTo(0.5);
    expect(nextTrailIntensity(0.1, 0, 1, HUD)).toBe(0);
  });
});

describe("AirtimeModel", () => {
  it("shows live airtime, then holds it and fades after landing", () => {
    const air = new AirtimeModel(HUD);
    air.update(null, 0.016);
    expect(air.opacity).toBe(0);
    air.update(0.4, 0.016);
    expect(air.shownS).toBe(0.4);
    expect(air.opacity).toBe(1);
    air.update(null, HUD.airtimeHoldS / 2);
    expect(air.shownS).toBe(0.4);
    expect(air.opacity).toBeCloseTo(0.5);
    air.update(null, HUD.airtimeHoldS);
    expect(air.opacity).toBe(0);
  });
});
