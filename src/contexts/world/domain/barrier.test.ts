import { describe, expect, it } from "vitest";
import { Quat, Transform, Vec3 } from "../../../shared";
import { WORLD_CONFIG } from "../world.config";
import { obstacleGrindEdges } from "./grind-edges";
import type { Obstacle } from "./obstacle";
import { ObstacleShape } from "./obstacle";
import type { ConvexPiece } from "./obstacle-geometry";
import { obstacleCollider, shapeGeometry } from "./obstacle-geometry";

const B = WORLD_CONFIG.geometry.barrier;

function newell(points: readonly Vec3[]): Vec3 {
  let n = Vec3.ZERO;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (a !== undefined && b !== undefined) n = Vec3.add(n, Vec3.cross(a, b));
  }
  return n;
}

function facePoints(piece: ConvexPiece, indices: readonly number[]): Vec3[] {
  return indices.map((i) => {
    const v = piece.verticesM[i];
    if (v === undefined) throw new Error(`bad index ${i}`);
    return v;
  });
}

function mean(points: readonly Vec3[]): Vec3 {
  return Vec3.scale(
    points.reduce((s, p) => Vec3.add(s, p), Vec3.ZERO),
    1 / points.length,
  );
}

/** Every face planar and outward, every piece convex and closed. */
function expectWellFormed(piece: ConvexPiece): void {
  const c = mean(piece.verticesM);
  const edges = new Map<string, number>();
  for (const face of piece.faces) {
    const pts = facePoints(piece, face.indices);
    const n = Vec3.normalize(newell(pts));
    const fc = mean(pts);
    expect(Vec3.dot(n, Vec3.sub(fc, c))).toBeGreaterThan(0);
    for (const v of piece.verticesM) expect(Vec3.dot(n, Vec3.sub(v, fc))).toBeLessThan(1e-9);
    face.indices.forEach((a, k) => {
      const key = `${a}>${face.indices[(k + 1) % face.indices.length]}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    });
  }
  for (const [key, count] of edges) {
    const [a, b] = key.split(">");
    expect(count).toBe(1);
    expect(edges.get(`${b}>${a}`)).toBe(1);
  }
}

const PLAIN = ObstacleShape.barrier({ lengthM: 4, heightM: 0.9, thicknessM: 0.3 });
const FRONT = ObstacleShape.barrier({
  lengthM: 4,
  heightM: 0.9,
  thicknessM: 0.3,
  banner: { sponsorId: "bipbop" },
});
const BOTH = ObstacleShape.barrier({
  lengthM: 4,
  heightM: 0.9,
  thicknessM: 0.3,
  banner: { sponsorId: "v4rgas", sides: "both" },
});

function bannerFaces(piece: ConvexPiece): Vec3[] {
  return piece.faces
    .filter((f) => f.tone === "banner")
    .map((f) => Vec3.normalize(newell(facePoints(piece, f.indices))));
}

describe("barrier geometry", () => {
  it("is one chamfered concrete block, length × thickness × height, standing on y = 0", () => {
    const { pieces } = shapeGeometry("ground", PLAIN);
    expect(pieces).toHaveLength(1);
    const [block] = pieces;
    if (block === undefined) throw new Error("no block");
    expectWellFormed(block);
    const xs = block.verticesM.map((v) => v.x);
    const ys = block.verticesM.map((v) => v.y);
    const zs = block.verticesM.map((v) => v.z);
    expect(Math.min(...xs)).toBeCloseTo(-2);
    expect(Math.max(...xs)).toBeCloseTo(2);
    expect(Math.min(...ys)).toBeCloseTo(0);
    expect(Math.max(...ys)).toBeCloseTo(0.9);
    expect(Math.min(...zs)).toBeCloseTo(-0.15);
    expect(Math.max(...zs)).toBeCloseTo(0.15);
    expect(block.faces.filter((f) => f.tone === "edge")).toHaveLength(2); // the chamfers
    expect(block.faces.some((f) => f.tone === "banner")).toBe(false);
  });

  it("a front banner is a thin plate proud of the +Z face, its outer face in the banner tone", () => {
    const { pieces } = shapeGeometry("ground", FRONT);
    expect(pieces).toHaveLength(2);
    const plate = pieces[1];
    if (plate === undefined) throw new Error("no plate");
    expectWellFormed(plate);
    const normals = bannerFaces(plate);
    expect(normals).toHaveLength(1);
    expect(normals[0]?.z).toBeCloseTo(1);
    const zs = plate.verticesM.map((v) => v.z);
    expect(Math.min(...zs)).toBeCloseTo(0.15);
    expect(Math.max(...zs)).toBeCloseTo(0.15 + B.bannerPanelThicknessM);
    const ys = plate.verticesM.map((v) => v.y);
    expect(Math.max(...ys)).toBeLessThan(0.9 - B.edgeChamferM); // below the chamfer
    expect(Math.min(...ys)).toBeGreaterThan(0);
  });

  it("banner sides 'both' adds a second plate facing −Z", () => {
    const { pieces } = shapeGeometry("ground", BOTH);
    expect(pieces).toHaveLength(3);
    const normals = pieces.flatMap(bannerFaces).map((n) => Math.round(n.z));
    expect(normals.sort()).toEqual([-1, 1]);
    for (const p of pieces) expectWellFormed(p);
  });

  it("is solid ground, never grindable: every piece is `ground` and there are no grind edges", () => {
    for (const shape of [PLAIN, FRONT, BOTH]) {
      const obstacle: Obstacle = {
        id: "b",
        name: "Barrier",
        surface: "ground",
        transform: Transform.create(Vec3.create(3, 0, -2), Quat.fromAxisAngle(Vec3.UNIT_Y, 1)),
        shape,
      };
      const collider = obstacleCollider(obstacle);
      expect(collider.shape.kind).toBe("compound");
      if (collider.shape.kind === "compound") {
        expect(collider.shape.parts.every((p) => p.surface === "ground")).toBe(true);
      }
      expect(obstacleGrindEdges(obstacle)).toEqual([]);
    }
  });

  it("skips the plate when the barrier is too small for it", () => {
    const tiny = ObstacleShape.barrier({
      lengthM: 0.2,
      heightM: 0.2,
      thicknessM: 0.2,
      banner: { sponsorId: "bipbop" },
    });
    expect(shapeGeometry("ground", tiny).pieces).toHaveLength(1);
  });

  it("rejects bad parameters", () => {
    expect(() => ObstacleShape.barrier({ lengthM: 0, heightM: 1, thicknessM: 0.3 })).toThrow(
      /lengthM/,
    );
    expect(() => ObstacleShape.barrier({ lengthM: 2, heightM: -1, thicknessM: 0.3 })).toThrow(
      /heightM/,
    );
    expect(() =>
      ObstacleShape.barrier({
        lengthM: 2,
        heightM: 1,
        thicknessM: 0.3,
        banner: { sponsorId: " " },
      }),
    ).toThrow(/sponsorId/);
  });
});
