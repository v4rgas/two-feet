import { describe, expect, it } from "vitest";
import { BOARD_CONFIG } from "../board.config";
import { BoardSpec } from "./board-spec";

describe("BoardSpec", () => {
  const spec = BoardSpec.create(BOARD_CONFIG.spec);

  it("accepts the realistic defaults", () => {
    expect(BoardSpec.totalMassKg(spec)).toBeGreaterThan(1.5);
    expect(BoardSpec.totalMassKg(spec)).toBeLessThan(4);
  });

  it("rejects impossible values", () => {
    expect(() => BoardSpec.create({ ...spec, deck: { ...spec.deck, lengthM: -1 } })).toThrow(
      RangeError,
    );
    expect(() =>
      BoardSpec.create({ ...spec, trucks: { ...spec.trucks, wheelbaseM: 0.79 } }),
    ).toThrow(RangeError);
  });

  it("puts wheels under the deck, touching the ground at rest", () => {
    const wheel = BoardSpec.wheelCenterLocal(spec, "noseRightWheel");
    expect(wheel.x).toBeCloseTo(spec.trucks.wheelbaseM / 2);
    expect(wheel.z).toBeGreaterThan(0);
    const wheelBottomWorldY = BoardSpec.restHeightM(spec) + wheel.y - spec.wheels.radiusM;
    expect(wheelBottomWorldY).toBeCloseTo(0, 9);
  });

  it("raises the kicked tail above the flat deck, but low enough to strike the ground", () => {
    const tail = BoardSpec.tailTipLocal(spec);
    expect(tail.x).toBeCloseTo(-spec.deck.lengthM / 2);
    expect(tail.y).toBeGreaterThan(0);
    const flatTop = BoardSpec.deckTopPointLocal(spec, 0, 0);
    expect(flatTop.y).toBeCloseTo(spec.deck.thicknessM / 2);
  });
});
