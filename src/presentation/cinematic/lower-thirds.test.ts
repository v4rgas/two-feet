import { describe, expect, it } from "vitest";
import type { DomainEvent } from "../../shared";
import { CINEMATIC_CONFIG } from "./cinematic.config";
import { cardOpacity, LowerThirdsModel } from "./lower-thirds";

describe("video lower-thirds", () => {
  it("fades a card in, holds it, fades it out", () => {
    expect(cardOpacity(-1, 0.2, 1, 0.5)).toBe(0);
    expect(cardOpacity(0.1, 0.2, 1, 0.5)).toBeCloseTo(0.5);
    expect(cardOpacity(0.8, 0.2, 1, 0.5)).toBe(1);
    expect(cardOpacity(1.45, 0.2, 1, 0.5)).toBeCloseTo(0.5);
    expect(cardOpacity(2, 0.2, 1, 0.5)).toBe(0);
  });

  it("shows the landed trick (no airtime caption), and a clip title card with a counter", () => {
    const m = new LowerThirdsModel(CINEMATIC_CONFIG.lowerThird);
    m.startClip("Kickflip · 5-stair", 0, 6);
    expect(m.counter).toBe("01 / 06");
    m.advance(0.5);
    expect(m.titleOpacity).toBe(1);
    expect(m.opacity).toBe(0);
    m.onEvent({ type: "TrickLanded", name: "Kickflip", airtimeS: 0.8 } as DomainEvent);
    m.advance(0.3);
    expect(m.current).toEqual({ text: "Kickflip", caption: "", tone: "trick" });
    expect(m.opacity).toBe(1);
    m.advance(10);
    expect(m.opacity).toBe(0);
    expect(m.titleOpacity).toBe(0);
    m.onEvent({ type: "RiderBailed", reason: "upsideDown" } as DomainEvent);
    expect(m.current?.tone).toBe("bail");
  });
});
