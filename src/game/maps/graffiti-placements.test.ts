import { describe, expect, it } from "vitest";
import { BOARD_CONFIG } from "../../contexts/board";
import { RapierPhysicsWorld } from "../../contexts/board/infrastructure/rapier-physics-world";
import type { GraffitiPlacement, Level } from "../../contexts/world";
import {
  Level as LevelFactory,
  levelGrindEdges,
  obstacleCollider,
  obstacleGeometry,
} from "../../contexts/world";
import { decalFrame, projectDecal } from "../../presentation/graffiti/graffiti-decals";
import { graffitiPieceById } from "../../presentation/graffiti/graffiti-registry";
import { PRESENTATION_CONFIG } from "../../presentation/presentation.config";
import { buildLevelMesh } from "../../presentation/scene/level-mesh";
import { Transform, Vec3 } from "../../shared";
import { createBarrierDemoLevel } from "../dev/barrier-demo";
import { MAPS } from "./maps";

/*
 * Every map's graffiti, checked against the real level: each piece is a known generated
 * piece, lands on concrete (ground, a wall, a bank, a transition), keeps clear of the grind
 * edges and coping, and graffiti never touches physics (same obstacles, same colliders).
 */

const LEVELS: readonly Level[] = [
  ...MAPS.all.map((m) => m.createLevel()),
  createBarrierDemoLevel(),
];

/** The level's paintable world triangles (body and edge faces of every obstacle). */
function surfaces(level: Level): number[] {
  const out: number[] = [];
  for (const o of level.obstacles) {
    for (const piece of obstacleGeometry(o).pieces) {
      const v = piece.verticesM.map((p) => Transform.toWorldPoint(o.transform, p));
      for (const face of piece.faces) {
        if (face.tone !== "body" && face.tone !== "edge") continue;
        const [a, ...rest] = face.indices.map((i) => v[i]);
        if (a === undefined) continue;
        for (let k = 0; k + 1 < rest.length; k += 1) {
          const b = rest[k];
          const c = rest[k + 1];
          if (b === undefined || c === undefined) continue;
          out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
        }
      }
    }
  }
  return out;
}

/** Fraction of the piece's art (its UV square) that the projection covers. */
function coverage(uvs: readonly number[]): number {
  let area = 0;
  for (let i = 0; i + 5 < uvs.length; i += 6) {
    const [u0, v0, u1, v1, u2, v2] = uvs.slice(i, i + 6) as [
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    area += Math.abs((u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0)) / 2;
  }
  return area;
}

const aspectOf = (g: GraffitiPlacement): number => graffitiPieceById(g.pieceId)?.aspect ?? 1;

describe.each(LEVELS.map((l) => [l.id, l] as const))("graffiti on %s", (_id, level) => {
  const pieces = level.graffiti ?? [];
  const tris = surfaces(level);

  it("uses only generated pieces from the registry", () => {
    expect(pieces.length).toBeGreaterThan(0);
    for (const g of pieces) expect(graffitiPieceById(g.pieceId), g.pieceId).toBeDefined();
  });

  it("every piece lands on concrete and follows it (≥ 70 % of the art on a surface)", () => {
    for (const g of pieces) {
      const out = { positions: [] as number[], uvs: [] as number[] };
      projectDecal(g, aspectOf(g), tris, PRESENTATION_CONFIG, out);
      expect(coverage(out.uvs), `${g.pieceId} at ${JSON.stringify(g.positionM)}`).toBeGreaterThan(
        0.7,
      );
    }
  });

  it("keeps clear of every grind edge and coping (≥ 3 cm outside each piece)", () => {
    const edges = levelGrindEdges(level.obstacles);
    const margin = 0.03;
    const depth = PRESENTATION_CONFIG.graffiti.projectHalfDepthM;
    for (const g of pieces) {
      const f = decalFrame(g, aspectOf(g));
      for (const e of edges) {
        for (let i = 0; i <= 40; i += 1) {
          const t = i / 40;
          const p = Vec3.sub(Vec3.lerp(e.startM, e.endM, t), f.centre);
          const dot = (v: { x: number; y: number; z: number }): number => Vec3.dot(p, v);
          const inside =
            Math.abs(dot(f.right)) < f.halfWidthM + margin &&
            Math.abs(dot(f.up)) < f.halfHeightM + margin &&
            Math.abs(dot(f.normal)) < depth + margin;
          expect(inside, `${g.pieceId} covers grind edge of ${e.obstacleId}`).toBe(false);
        }
      }
    }
  });

  it("never changes physics: same obstacles and colliders with or without graffiti", async () => {
    const bare = LevelFactory.create({
      id: level.id,
      name: level.name,
      obstacles: level.obstacles,
      spawn: level.spawn,
      graffiti: [],
    });
    expect(bare.obstacles).toEqual(level.obstacles);
    expect(bare.obstacles.map((o) => obstacleCollider(o))).toEqual(
      level.obstacles.map((o) => obstacleCollider(o)),
    );
    const count = async (l: Level) => {
      const physics = await RapierPhysicsWorld.create(BOARD_CONFIG);
      for (const o of l.obstacles) physics.addStaticCollider(obstacleCollider(o));
      const stats = physics.stats();
      physics.dispose();
      return stats;
    };
    expect(await count(level)).toEqual(await count(bare));
    // Rendering: one merged mesh per piece (no per-placement draw calls), no other change.
    const names = (l: Level): string[] => {
      const out: string[] = [];
      const mesh = buildLevelMesh(l, PRESENTATION_CONFIG);
      mesh.group.traverse((o) => {
        out.push(o.name);
      });
      mesh.dispose();
      return out;
    };
    const withArt = names(level);
    const graffitiMeshes = withArt.filter((n) => n.startsWith("graffiti:"));
    expect(graffitiMeshes.length).toBe(new Set(pieces.map((g) => g.pieceId)).size);
    expect(withArt.filter((n) => !n.startsWith("graffiti:"))).toEqual(names(bare));
  });
});
