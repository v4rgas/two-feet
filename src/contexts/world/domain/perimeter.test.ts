import { describe, expect, it } from "vitest";
import { Transform, Vec3 } from "../../../shared";
import { Level } from "./level";
import type { BarrierShape, Obstacle } from "./obstacle";
import { perimeterBarriers } from "./perimeter";

const BOUNDS = { minXM: -20, maxXM: 20, minZM: -10, maxZM: 10 };

function barrier(o: Obstacle): BarrierShape {
  if (o.shape.kind !== "barrier") throw new Error(`${o.id} is not a barrier`);
  return o.shape;
}

/** The world ends of a barrier's centre line, and its front (+Z) direction. */
function ends(o: Obstacle): { a: Vec3; b: Vec3; front: Vec3 } {
  const half = barrier(o).lengthM / 2;
  return {
    a: Transform.toWorldPoint(o.transform, Vec3.create(-half, 0, 0)),
    b: Transform.toWorldPoint(o.transform, Vec3.create(half, 0, 0)),
    front: Transform.toWorldDirection(o.transform, Vec3.UNIT_Z),
  };
}

describe("perimeterBarriers", () => {
  it("rings the bounds with segments near the target length, fronts facing inward", () => {
    const ring = perimeterBarriers(BOUNDS, { segmentLengthM: 4 });
    expect(ring.length).toBeGreaterThan(20);
    for (const o of ring) {
      const { a, b, front } = ends(o);
      const mid = Vec3.scale(Vec3.add(a, b), 0.5);
      // Front points toward the centre of the bounds.
      expect(Vec3.dot(front, Vec3.sub(Vec3.ZERO, mid))).toBeGreaterThan(0);
      expect(Math.abs(front.y)).toBeLessThan(1e-9);
      expect(barrier(o).lengthM).toBeGreaterThan(3);
      expect(barrier(o).lengthM).toBeLessThan(5.5);
      expect(o.surface).toBe("ground");
      // Inside the bounds (outer face on the bounds line at most).
      for (const p of [a, b]) {
        expect(p.x).toBeGreaterThanOrEqual(BOUNDS.minXM - 1e-9);
        expect(p.x).toBeLessThanOrEqual(BOUNDS.maxXM + 1e-9);
        expect(p.z).toBeGreaterThanOrEqual(BOUNDS.minZM - 1e-9);
        expect(p.z).toBeLessThanOrEqual(BOUNDS.maxZM + 1e-9);
      }
    }
    // Unique ids: a valid level.
    expect(() =>
      Level.create({
        id: "ring",
        name: "Ring",
        obstacles: ring,
        spawn: { positionM: Vec3.ZERO, headingRad: 0 },
      }),
    ).not.toThrow();
  });

  it("covers each full side without gaps or overlaps (north/south full width)", () => {
    const ring = perimeterBarriers(BOUNDS);
    const south = ring.filter((o) => o.id.includes("-south-"));
    const total = south.reduce((s, o) => s + barrier(o).lengthM, 0);
    expect(total).toBeCloseTo(40);
    const west = ring.filter((o) => o.id.includes("-west-"));
    // East/west fit between the north and south rows (no corner overlap).
    expect(west.reduce((s, o) => s + barrier(o).lengthM, 0)).toBeCloseTo(20 - 2 * 0.3);
  });

  it("leaves openings where asked", () => {
    const ring = perimeterBarriers(BOUNDS, {
      openings: [{ side: "south", centerM: 0, widthM: 6 }],
      sides: ["south"],
    });
    for (const o of ring) {
      const { a, b } = ends(o);
      const lo = Math.min(a.x, b.x);
      const hi = Math.max(a.x, b.x);
      expect(hi <= -3 + 1e-9 || lo >= 3 - 1e-9).toBe(true);
    }
    const total = ring.reduce((s, o) => s + barrier(o).lengthM, 0);
    expect(total).toBeCloseTo(34);
  });

  it("hands out banners in ring order, cycling, with null for a plain segment", () => {
    const ring = perimeterBarriers(BOUNDS, {
      banners: ["bipbop", "v4rgas", null],
      bannerSides: "both",
    });
    const ids = ring.map((o) => barrier(o).banner?.sponsorId ?? null);
    expect(ids.slice(0, 6)).toEqual(["bipbop", "v4rgas", null, "bipbop", "v4rgas", null]);
    expect(barrier(ring[0] as Obstacle).banner?.sides).toBe("both");
  });

  it("rejects bounds too small for the barriers", () => {
    expect(() => perimeterBarriers({ minXM: 0, maxXM: 0.4, minZM: 0, maxZM: 10 })).toThrow(
      RangeError,
    );
  });
});
