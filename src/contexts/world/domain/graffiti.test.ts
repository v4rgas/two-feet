import { describe, expect, it } from "vitest";
import { Quat, Transform, Vec3 } from "../../../shared";
import {
  createGraffiti,
  graffitiOnFace,
  graffitiOnGround,
  graffitiOnObstacleSurface,
} from "./graffiti";
import { Level } from "./level";
import type { Obstacle } from "./obstacle";
import { ObstacleShape } from "./obstacle";

const LEDGE: Obstacle = {
  id: "ledge",
  name: "Ledge",
  surface: "ledge",
  transform: Transform.create(Vec3.create(5, 0, 2), Quat.fromAxisAngle(Vec3.UNIT_Y, Math.PI / 2)),
  shape: ObstacleShape.ledge({ lengthM: 4, depthM: 0.5, heightM: 0.4, edgeChamferM: 0.03 }),
};

describe("graffiti placements", () => {
  it("graffitiOnFace puts the piece on the middle of the chosen side, in the world frame", () => {
    const g = graffitiOnFace(LEDGE, { pieceId: "penguin-throwup", face: "+z", sizeM: 0.6 });
    // Local +Z of a ledge turned 90° about +Y is world +X.
    expect(g.normal.x).toBeCloseTo(1);
    expect(g.positionM.x).toBeCloseTo(5 + 0.25);
    expect(g.positionM.z).toBeCloseTo(2);
    // Middle of the vertical face (below the chamfer).
    expect(g.positionM.y).toBeCloseTo((0.4 - 0.03) / 2);
  });

  it("shifts along the face and sets the height when asked", () => {
    const g = graffitiOnFace(LEDGE, {
      pieceId: "tag",
      face: "-z",
      sizeM: 0.5,
      alongM: 1,
      heightM: 0.2,
      rotationRad: 0.1,
    });
    expect(g.normal.x).toBeCloseTo(-1);
    expect(g.positionM.y).toBeCloseTo(0.2);
    // Local +X (along) is world −Z after the turn.
    expect(g.positionM.z).toBeCloseTo(2 - 1);
    expect(g.rotationRad).toBe(0.1);
  });

  it("throws for a side with no face", () => {
    const bank: Obstacle = {
      ...LEDGE,
      id: "bank",
      shape: ObstacleShape.bank({ angleRad: 0.35, lengthM: 3, widthM: 4 }),
    };
    // A bank's −X side is its slope: no face looks straight that way.
    expect(() => graffitiOnFace(bank, { pieceId: "x", face: "-x", sizeM: 1 })).toThrow(/no -x/);
  });

  it("validates placements and normalises the normal; Level keeps them (default [])", () => {
    expect(() =>
      createGraffiti({ pieceId: "", positionM: Vec3.ZERO, normal: Vec3.UNIT_Y, sizeM: 1 }),
    ).toThrow(/pieceId/);
    expect(() =>
      createGraffiti({ pieceId: "a", positionM: Vec3.ZERO, normal: Vec3.ZERO, sizeM: 1 }),
    ).toThrow(/normal/);
    const g = createGraffiti({
      pieceId: "a",
      positionM: Vec3.ZERO,
      normal: Vec3.create(0, 0, 3),
      sizeM: 1,
    });
    expect(g.normal.z).toBeCloseTo(1);
    const spawn = { positionM: Vec3.ZERO, headingRad: 0 };
    expect(Level.create({ id: "l", name: "L", obstacles: [], spawn }).graffiti).toEqual([]);
    const level = Level.create({ id: "l", name: "L", obstacles: [LEDGE], spawn, graffiti: [g] });
    expect(level.graffiti).toHaveLength(1);
    expect(() =>
      Level.create({ id: "l", name: "L", obstacles: [], spawn, graffiti: [{ ...g, sizeM: 0 }] }),
    ).toThrow(/Level "l"/);
  });

  it("graffitiOnGround lies flat on the ground (normal +Y), at y = 0 unless told", () => {
    const g = graffitiOnGround({ pieceId: "w", xM: 3, zM: -2, sizeM: 2, rotationRad: 0.3 });
    expect(g.normal).toEqual(Vec3.UNIT_Y);
    expect(g.positionM).toEqual(Vec3.create(3, 0, -2));
    expect(g.rotationRad).toBe(0.3);
    expect(graffitiOnGround({ pieceId: "w", xM: 0, zM: 0, sizeM: 1, yM: 0.6 }).positionM.y).toBe(
      0.6,
    );
  });

  it("graffitiOnObstacleSurface lands on a bank's slope with the slope's normal", () => {
    const angle = 0.35;
    const bank: Obstacle = {
      id: "bank",
      name: "Bank",
      surface: "ramp",
      transform: Transform.create(Vec3.create(10, 0, 0), Quat.IDENTITY),
      shape: ObstacleShape.bank({ angleRad: angle, lengthM: 3, widthM: 4 }),
    };
    const run = 3 * Math.cos(angle);
    // Half-way up, seen from above (world X/Z): the slope's normal, on the surface.
    const g = graffitiOnObstacleSurface(bank, {
      pieceId: "p",
      sizeM: 1,
      xM: 10 + run / 2,
      zM: 0,
      frame: "world",
    });
    expect(g.normal.y).toBeCloseTo(Math.cos(angle), 3);
    expect(Math.abs(g.normal.x)).toBeCloseTo(Math.sin(angle), 3);
    expect(g.positionM.y).toBeGreaterThan(0.1);
    expect(g.positionM.y).toBeLessThan(3 * Math.sin(angle));
    expect(() =>
      graffitiOnObstacleSurface(bank, { pieceId: "p", sizeM: 1, xM: 50, zM: 0, frame: "world" }),
    ).toThrow(/no upward surface/);
  });

  it("graffitiOnObstacleSurface follows a quarter pipe's curve (steeper higher up)", () => {
    const qp: Obstacle = {
      id: "qp",
      name: "QP",
      surface: "ramp",
      transform: Transform.IDENTITY,
      shape: ObstacleShape.quarterPipe({
        radiusM: 2.2,
        heightM: 1.2,
        widthM: 4,
        deckDepthM: 1,
        copingRadiusM: 0.03,
      }),
    };
    const low = graffitiOnObstacleSurface(qp, { pieceId: "p", sizeM: 1, xM: 0.6, zM: 0 });
    const high = graffitiOnObstacleSurface(qp, { pieceId: "p", sizeM: 1, xM: 1.4, zM: 0 });
    expect(high.positionM.y).toBeGreaterThan(low.positionM.y);
    expect(high.normal.y).toBeLessThan(low.normal.y);
    expect(low.normal.y).toBeGreaterThan(0.5);
  });
});
