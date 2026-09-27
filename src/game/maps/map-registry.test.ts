import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "../game.config";
import { createMapRegistry } from "./map-registry";
import { MAPS } from "./maps";

const REAL = import.meta.glob("../../maps/*/map.ts", { eager: true });
const FIXTURES = import.meta.glob("./__fixtures__/maps/*/map.ts", { eager: true });

describe("map registry", () => {
  it("finds the shipped maps: the street first (the default), flat is the tutorial map", () => {
    const ids = MAPS.all.map((m) => m.id);
    expect(ids[0]).toBe("street");
    expect(ids).toContain("flat");
    expect(ids).toContain("el-toro");
    expect(ids).not.toContain("park");
    expect(MAPS.defaultMap.id).toBe(GAME_CONFIG.maps.defaultMapId);
    expect(MAPS.tutorialMap.id).toBe("flat");
    expect(MAPS.get("street")?.name).toBe("Street Course");
    expect(MAPS.get("nope")).toBeUndefined();
  });

  it("every map builds its level with its own id and spawn", () => {
    for (const map of MAPS.all) {
      const level = map.createLevel();
      expect(level.id).toBe(map.id);
      expect(level.spawn).toEqual(map.spawn);
      expect(map.description.length).toBeGreaterThan(0);
    }
  });

  it("a dummy map folder registers: it shows in the list (the menu's source)", () => {
    const registry = createMapRegistry({ ...REAL, ...FIXTURES }, "street");
    expect(registry.all.map((m) => m.id)).toContain("dummy");
    expect(registry.get("dummy")?.createLevel().obstacles).toHaveLength(1);
    expect(registry.all[0]?.id).toBe("street");
  });

  it("rejects a duplicate id, a module without a map, a missing default", () => {
    expect(() =>
      createMapRegistry(
        { a: REAL["../../maps/street/map.ts"], b: REAL["../../maps/street/map.ts"] },
        "street",
      ),
    ).toThrow(/Duplicate/);
    expect(() => createMapRegistry({ ...REAL, x: { notAMap: 1 } }, "street")).toThrow(
      /no MapDefinition/,
    );
    expect(() => createMapRegistry(FIXTURES, "street")).toThrow(/default map/);
  });
});
