import { describe, expect, it } from "vitest";
import { Vec3 } from "../../../shared";
import { groundObstacle } from "./ground";
import { Level } from "./level";

describe("level", () => {
  const ground = groundObstacle({ halfSizeM: 100, thicknessM: 1 });
  const level = Level.create({
    id: "flat",
    name: "Flat",
    obstacles: [ground],
    spawn: { positionM: Vec3.ZERO, headingRad: 0 },
  });

  it("the ground slab is one `ground` box whose top is at y = 0", () => {
    expect(level.obstacles).toHaveLength(1);
    expect(ground.id).toBe("ground");
    expect(ground.surface).toBe("ground");
    if (ground.shape.kind !== "box") throw new Error("expected a box");
    expect(ground.transform.positionM.y + ground.shape.halfExtentsM.y).toBeCloseTo(0);
    expect(ground.shape.halfExtentsM.x).toBe(100);
  });

  it("rejects duplicate obstacle ids", () => {
    expect(() => Level.create({ ...level, obstacles: [ground, ground] })).toThrow(/duplicate/);
  });

  it("rejects a non-finite spawn heading", () => {
    expect(() =>
      Level.create({ ...level, spawn: { positionM: Vec3.ZERO, headingRad: Number.NaN } }),
    ).toThrow(/heading/);
  });
});
