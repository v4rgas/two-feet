import { describe, expect, it } from "vitest";
import { tutorialCard } from "./tutorial-card";

const caps = (card: ReturnType<typeof tutorialCard>) =>
  card?.keys.filter((k) => k.kind === "cap").map((k) => (k.kind === "cap" ? k.label : ""));

describe("tutorial cards", () => {
  it("the keys follow the stance (goofy mirrors the pads: S + ↓)", () => {
    const ollie = { step: "ollie", failures: 0, outroS: 0 } as const;
    expect(caps(tutorialCard(ollie, "regular"))).toEqual(["↓", "S", "↓", "W", "Space"]);
    expect(caps(tutorialCard(ollie, "goofy"))).toEqual(["S", "↓", "S", "↑", "Space"]);
    const kf = { step: "kickflip", failures: 0, outroS: 0 } as const;
    expect(caps(tutorialCard(kf, "regular"))).toEqual(["A", "Space"]);
    expect(caps(tutorialCard(kf, "goofy"))).toEqual(["→", "Space"]);
  });

  it("the hint line only after a failure; progress counts the steps; the outro credits", () => {
    const first = tutorialCard({ step: "ollie", failures: 0, outroS: 0 }, "regular");
    expect(first?.hint).toBeNull();
    expect(first?.progress).toBe("2 / 3");
    const again = tutorialCard({ step: "ollie", failures: 1, outroS: 0 }, "regular");
    expect(again?.hint).toBe("Let go of ↓ to pop — keep holding S");
    const outro = tutorialCard({ step: "outro", failures: 0, outroS: 0 }, "regular");
    expect(outro?.title).toBe("Nice. Welcome to the Street Course.");
    expect(outro?.footnote).toBe("a game by v4rgas");
    expect(tutorialCard({ step: "done", failures: 0, outroS: 0 }, "regular")).toBeNull();
  });
});
