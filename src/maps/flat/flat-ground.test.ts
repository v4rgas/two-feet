import { describe, expect, it } from "vitest";
import { createFlatGroundLevel } from "./flat-ground";
import { map } from "./map";

describe("flat map", () => {
  it("is one ground slab, the spawn at the origin; the tutorial map", () => {
    const level = map.createLevel();
    expect(level.id).toBe("flat");
    expect(level.obstacles.map((o) => o.id)).toEqual(["ground"]);
    expect(level.spawn).toEqual(map.spawn);
    expect(map.spawn.positionM).toEqual({ x: 0, y: 0, z: 0 });
    expect(map.tutorial).toBe(true);
    expect(createFlatGroundLevel().spawn).toEqual(map.spawn);
  });
});
