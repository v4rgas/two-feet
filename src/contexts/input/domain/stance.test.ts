import { describe, expect, it } from "vitest";
import { clusterForFoot, footForCluster } from "./stance";

describe("stance mapping", () => {
  it("regular: WASD drives the front foot, arrows the back foot", () => {
    expect(footForCluster("regular", "left")).toBe("front");
    expect(footForCluster("regular", "right")).toBe("back");
  });

  it("goofy: WASD drives the back foot, arrows the front foot", () => {
    expect(footForCluster("goofy", "left")).toBe("back");
    expect(footForCluster("goofy", "right")).toBe("front");
  });

  it("clusterForFoot is the inverse", () => {
    for (const stance of ["regular", "goofy"] as const) {
      for (const cluster of ["left", "right"] as const) {
        expect(clusterForFoot(stance, footForCluster(stance, cluster))).toBe(cluster);
      }
    }
  });
});
