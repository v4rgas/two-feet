import { describe, expect, it } from "vitest";
import { Vec3 } from "../../../shared";
import { Level } from "./level";
import { isMapDefinition } from "./map-definition";

describe("isMapDefinition", () => {
  const spawn = { positionM: Vec3.ZERO, headingRad: 0 };
  const map = {
    id: "dummy",
    name: "Dummy",
    description: "A test map.",
    spawn,
    createLevel: () => Level.create({ id: "dummy", name: "Dummy", obstacles: [], spawn }),
  };

  it("accepts a map-shaped object", () => {
    expect(isMapDefinition(map)).toBe(true);
    expect(isMapDefinition({ ...map, tutorial: true })).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isMapDefinition(null)).toBe(false);
    expect(isMapDefinition("street")).toBe(false);
    expect(isMapDefinition({ ...map, createLevel: undefined })).toBe(false);
    expect(isMapDefinition({ ...map, description: 3 })).toBe(false);
  });
});
