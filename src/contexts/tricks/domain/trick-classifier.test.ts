import { describe, expect, it } from "vitest";
import type { Kick } from "../../../shared";
import { TAU } from "../../../shared";
import { TRICK_TABLE, TRICKS_CONFIG } from "../tricks.config";
import type { TrickInput } from "./trick-classifier";
import { classifyTrick, nearestStep } from "./trick-classifier";

/*
 * The classifier against MECHANICS.md "Names the recognizer must produce", cell by cell.
 * Inputs are rider-normalised rotations (+ = kickflip / backside), so stance and kick
 * mirroring is tested in `default-trick-recognizer.test.ts`.
 */

const TOL = TRICKS_CONFIG.tolerances;

/** Flip channel: rider-normalised full turns. */
const FLIPS = {
  none: 0,
  kickflip: 1,
  heelflip: -1,
  "double kickflip": 2,
  "double heelflip": -2,
} as const;
/** Shove channel: rider-normalised half turns. */
const SHOVES = { none: 0, BS: 1, FS: -1, "BS 360": 2, "FS 360": -2 } as const;
type Flip = keyof typeof FLIPS;
type Shove = keyof typeof SHOVES;

/** MECHANICS.md's table, spelled out literally. "—" cells get `<flip> + <shove>`. */
const EXPECTED: Record<Flip, Record<Shove, string>> = {
  none: {
    none: "Ollie",
    BS: "BS Pop Shove-it",
    FS: "FS Pop Shove-it",
    "BS 360": "360 Shove-it",
    "FS 360": "FS 360 Shove-it",
  },
  kickflip: {
    none: "Kickflip",
    BS: "Varial Kickflip",
    FS: "Hardflip",
    "BS 360": "360 Flip",
    "FS 360": "Kickflip + FS 360 Shove-it",
  },
  heelflip: {
    none: "Heelflip",
    BS: "Inward Heelflip",
    FS: "Varial Heelflip",
    "BS 360": "Heelflip + 360 Shove-it",
    "FS 360": "Laser Flip",
  },
  "double kickflip": {
    none: "Double Kickflip",
    BS: "Double Kickflip + BS Shove-it",
    FS: "Double Kickflip + FS Shove-it",
    "BS 360": "Double Kickflip + 360 Shove-it",
    "FS 360": "Double Kickflip + FS 360 Shove-it",
  },
  "double heelflip": {
    none: "Double Heelflip",
    BS: "Double Heelflip + BS Shove-it",
    FS: "Double Heelflip + FS Shove-it",
    "BS 360": "Double Heelflip + 360 Shove-it",
    "FS 360": "Double Heelflip + FS 360 Shove-it",
  },
};

function input(flip: Flip, shove: Shove, extra: Partial<TrickInput> = {}): TrickInput {
  return {
    // Slightly off the ideal, inside the tolerance, like a real landing.
    flipRad: FLIPS[flip] * TAU + 0.4,
    shoveRad: SHOVES[shove] * Math.PI - 0.4,
    bodyRad: 0.3,
    kick: "tail",
    fakie: false,
    switchStance: false,
    ...extra,
  };
}

const CELLS = (Object.keys(FLIPS) as Flip[]).flatMap((flip) =>
  (Object.keys(SHOVES) as Shove[]).map((shove) => ({ flip, shove })),
);

describe("classifyTrick: flip × shove matrix", () => {
  it.each(CELLS)("$flip × $shove", ({ flip, shove }) => {
    const c = classifyTrick(input(flip, shove), TRICK_TABLE, TOL);
    expect(c.name).toBe(EXPECTED[flip][shove]);
    expect(c.complete).toBe(true);
    expect(c.flip.step.units).toBe(FLIPS[flip]);
    expect(c.shove.step.units).toBe(SHOVES[shove]);
  });

  it.each(CELLS)("nollie $flip × $shove", ({ flip, shove }) => {
    const c = classifyTrick(input(flip, shove, { kick: "nose" }), TRICK_TABLE, TOL);
    const base = EXPECTED[flip][shove];
    expect(c.name).toBe(base === "Ollie" ? "Nollie" : `Nollie ${base}`);
    expect(c.id.startsWith("nollie-")).toBe(true);
  });

  it("ids are unique over the whole matrix", () => {
    const ids = CELLS.map(
      ({ flip, shove }) => classifyTrick(input(flip, shove), TRICK_TABLE, TOL).id,
    );
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("classifyTrick: prefixes", () => {
  const cases: [string, Flip, Shove, Partial<TrickInput>, string][] = [
    ["fakie ollie", "none", "none", { fakie: true }, "Fakie Ollie"],
    ["fakie kickflip", "kickflip", "none", { fakie: true }, "Fakie Kickflip"],
    ["switch heelflip", "heelflip", "none", { switchStance: true }, "Switch Heelflip"],
    [
      "switch fakie ollie",
      "none",
      "none",
      { switchStance: true, fakie: true },
      "Switch Fakie Ollie",
    ],
    ["fakie nollie", "none", "none", { fakie: true, kick: "nose" }, "Fakie Nollie"],
    ["BS 180", "none", "none", { bodyRad: Math.PI }, "BS 180"],
    ["FS 180", "none", "none", { bodyRad: -Math.PI }, "FS 180"],
    ["360 (BS)", "none", "none", { bodyRad: TAU - 0.3 }, "360"],
    ["360 (FS)", "none", "none", { bodyRad: -TAU + 0.3 }, "360"],
    ["BS 180 kickflip", "kickflip", "none", { bodyRad: Math.PI + 0.2 }, "BS 180 Kickflip"],
    [
      "nollie FS 180 heelflip",
      "heelflip",
      "none",
      { kick: "nose", bodyRad: -Math.PI },
      "Nollie FS 180 Heelflip",
    ],
    ["nollie BS 180", "none", "none", { kick: "nose", bodyRad: Math.PI }, "Nollie BS 180"],
    [
      "fakie FS 180 varial heelflip",
      "heelflip",
      "FS",
      { fakie: true, bodyRad: -Math.PI },
      "Fakie FS 180 Varial Heelflip",
    ],
    [
      "switch fakie nollie 360 tre flip (every prefix)",
      "kickflip",
      "BS 360",
      { switchStance: true, fakie: true, kick: "nose", bodyRad: TAU },
      "Switch Fakie Nollie 360 360 Flip",
    ],
  ];
  it.each(cases)("%s", (_label, flip, shove, extra, name) => {
    const c = classifyTrick(input(flip, shove, extra), TRICK_TABLE, TOL);
    expect(c.name).toBe(name);
    expect(c.complete).toBe(true);
  });

  it("builds the id from the prefixes and the cell", () => {
    const c = classifyTrick(
      input("heelflip", "none", { kick: "nose", bodyRad: -Math.PI }),
      TRICK_TABLE,
      TOL,
    );
    expect(c.id).toBe("nollie-fs180-heelflip");
    expect(classifyTrick(input("none", "none"), TRICK_TABLE, TOL).id).toBe("ollie");
  });
});

describe("classifyTrick: tolerances and under-rotation", () => {
  const kicks: Kick[] = ["tail", "nose"];

  it.each(kicks)("%s: roll within ±flipRad of 2π counts; beyond it is incomplete", (kick) => {
    const at = (flipRad: number) =>
      classifyTrick({ ...input("none", "none", { kick }), flipRad }, TRICK_TABLE, TOL);
    expect(at(TAU - TOL.flipRad + 1e-6).complete).toBe(true);
    expect(at(TAU + TOL.flipRad - 1e-6).complete).toBe(true);
    const under = at(TAU - TOL.flipRad - 0.05);
    expect(under.complete).toBe(false);
    expect(under.name).toContain("Kickflip");
    expect(under.flip.errorRad).toBeLessThan(0);
  });

  it("an under-rotated heelflip keeps the closest name", () => {
    const c = classifyTrick({ ...input("none", "none"), flipRad: -TAU + 1.2 }, TRICK_TABLE, TOL);
    expect(c.complete).toBe(false);
    expect(c.name).toBe("Heelflip");
  });

  it("a half flip snaps to the nearer of none and one turn (incomplete)", () => {
    const c = classifyTrick({ ...input("none", "none"), flipRad: 2.5 }, TRICK_TABLE, TOL);
    expect(c.complete).toBe(false);
    expect(c.name).toBe("Ollie");
  });

  it("an under-rotated shove (a 90° board) is incomplete", () => {
    const c = classifyTrick(
      { ...input("none", "none"), shoveRad: Math.PI / 2 + 0.1 },
      TRICK_TABLE,
      TOL,
    );
    expect(c.complete).toBe(false);
    expect(c.name).toBe("BS Pop Shove-it");
  });

  it("a body spin stopped at 90° is incomplete", () => {
    const c = classifyTrick(
      { ...input("none", "none"), bodyRad: -Math.PI / 2 - 0.2 },
      TRICK_TABLE,
      TOL,
    );
    expect(c.complete).toBe(false);
    expect(c.name).toBe("FS 180");
  });

  it("a triple flip beyond the table snaps to the double and is incomplete", () => {
    const c = classifyTrick({ ...input("none", "none"), flipRad: 3 * TAU }, TRICK_TABLE, TOL);
    expect(c.name).toBe("Double Kickflip");
    expect(c.complete).toBe(false);
  });
});

describe("nearestStep", () => {
  it("throws on an empty channel", () => {
    expect(() => nearestStep([], 0, TAU, 0.6)).toThrow(RangeError);
  });

  it("reports the signed error from the nearest step", () => {
    const m = nearestStep(TRICK_TABLE.shoves, -Math.PI - 0.2, Math.PI, 0.6);
    expect(m.step.id).toBe("fs");
    expect(m.errorRad).toBeCloseTo(-0.2);
    expect(m.complete).toBe(true);
  });
});

describe("TRICK_TABLE", () => {
  it("has unique ids and every cell points at existing steps", () => {
    const ids = TRICK_TABLE.tricks.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of TRICK_TABLE.tricks) {
      expect(TRICK_TABLE.flips.some((f) => f.id === t.flip)).toBe(true);
      expect(TRICK_TABLE.shoves.some((s) => s.id === t.shove)).toBe(true);
    }
    for (const channel of [TRICK_TABLE.flips, TRICK_TABLE.shoves, TRICK_TABLE.bodies]) {
      expect(channel.some((s) => s.units === 0)).toBe(true);
    }
  });
});
