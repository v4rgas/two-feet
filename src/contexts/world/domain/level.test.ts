import { describe, expect, it } from "vitest";
import { WORLD_CONFIG } from "../world.config";
import { createFlatGroundLevel } from "./flat-ground";
import { Level } from "./level";

describe("flat ground level", () => {
  const level = createFlatGroundLevel(WORLD_CONFIG.flatGround);

  it("has a single ground obstacle whose top is at y = 0", () => {
    expect(level.obstacles).toHaveLength(1);
    const [ground] = level.obstacles;
    expect(ground?.surface).toBe("ground");
    if (ground?.shape.kind !== "box") throw new Error("expected a box");
    expect(ground.transform.positionM.y + ground.shape.halfExtentsM.y).toBeCloseTo(0);
  });

  it("rejects duplicate obstacle ids", () => {
    const [ground] = level.obstacles;
    if (ground === undefined) throw new Error("expected ground");
    expect(() => Level.create({ ...level, obstacles: [ground, ground] })).toThrow(/duplicate/);
  });
});
