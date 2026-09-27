import { describe, expect, it } from "vitest";
import { Vec3 } from "../../../shared";
import { BOARD_CONFIG, BoardSpec } from "../../board";
import { deckTopPointLocal, flatHalfLengthM, tailTipLocal } from "../domain/deck-surface";

/**
 * The rider domain recomputes deck geometry from `DeckGeometry` numbers (it may not
 * import the board context). These checks pin its formulas to board's `BoardSpec`.
 */
describe("rider deck-surface matches BoardSpec", () => {
  const spec = BoardSpec.create(BOARD_CONFIG.spec);

  it("grip-tape points (flat section, kicks and beyond the tips)", () => {
    for (const along of [-0.5, -0.4, -0.35, -0.26, -0.2, 0, 0.12, 0.3, 0.4, 0.6]) {
      for (const across of [-0.105, 0, 0.05]) {
        const expected = BoardSpec.deckTopPointLocal(spec, along, across);
        expect(Vec3.equals(deckTopPointLocal(spec, along, across), expected, 1e-12)).toBe(true);
      }
    }
  });

  it("tail tip and flat length", () => {
    expect(Vec3.equals(tailTipLocal(spec), BoardSpec.tailTipLocal(spec), 1e-12)).toBe(true);
    expect(flatHalfLengthM(spec)).toBeCloseTo(BoardSpec.flatLengthM(spec) / 2, 12);
  });
});
