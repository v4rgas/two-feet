import type * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { Obstacle } from "../../contexts/world";
import {
  graffitiOnFace,
  groundObstacle,
  Level,
  ObstacleShape,
  perimeterBarriers,
} from "../../contexts/world";
import { Quat, Transform, Vec3 } from "../../shared";
import { PRESENTATION_CONFIG } from "../presentation.config";
import { buildLevelMesh, createLevelAssets, disposeLevelAssets } from "./level-mesh";

function level(): Level {
  const ledge: Obstacle = {
    id: "ledge",
    name: "Ledge",
    surface: "ledge",
    transform: Transform.create(Vec3.create(0, 0, 0), Quat.IDENTITY),
    shape: ObstacleShape.ledge({ lengthM: 4, depthM: 0.5, heightM: 0.4, edgeChamferM: 0.03 }),
  };
  return Level.create({
    id: "test",
    name: "Test",
    obstacles: [
      groundObstacle({ halfSizeM: 100, thicknessM: 1 }),
      ledge,
      ...perimeterBarriers(
        { minXM: -10, maxXM: 10, minZM: -6, maxZM: 6 },
        { banners: ["bipbop", "v4rgas", null, "no-such-brand"] },
      ),
    ],
    spawn: { positionM: Vec3.ZERO, headingRad: 0 },
    graffiti: [graffitiOnFace(ledge, { pieceId: "pixel-penguin", face: "+z", sizeM: 0.3 })],
  });
}

function byName(group: THREE.Group): Map<string, THREE.Mesh> {
  const out = new Map<string, THREE.Mesh>();
  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.set(o.name, o as THREE.Mesh);
  });
  return out;
}

describe("buildLevelMesh", () => {
  it("merges tones, groups banners per sponsor, adds decals; every surface has UVs", () => {
    const mesh = buildLevelMesh(level(), PRESENTATION_CONFIG);
    const meshes = byName(mesh.group);
    for (const name of [
      "obstacles:body",
      "obstacles:edge",
      "banner:bipbop",
      "banner:v4rgas",
      "graffiti:pixel-penguin",
      "ground:body",
    ]) {
      expect(meshes.get(name), name).toBeDefined();
      expect(meshes.get(name)?.geometry.getAttribute("uv"), name).toBeDefined();
    }
    // Plain barriers, and barriers naming an unknown sponsor, add no banner mesh: an
    // unknown id is a plain wall (its plate drawn as concrete), never a stand-in banner.
    expect([...meshes.keys()].filter((n) => n.startsWith("banner:")).sort()).toEqual([
      "banner:bipbop",
      "banner:v4rgas",
    ]);
    mesh.dispose();
  });

  it("shares the renderer's materials across levels (flat colours until textures load)", () => {
    const assets = createLevelAssets(PRESENTATION_CONFIG, null, 1);
    const a = byName(buildLevelMesh(level(), PRESENTATION_CONFIG, assets).group);
    const b = byName(buildLevelMesh(level(), PRESENTATION_CONFIG, assets).group);
    expect(a.get("obstacles:body")?.material).toBe(b.get("obstacles:body")?.material);
    expect(a.get("banner:bipbop")?.material).toBe(b.get("banner:bipbop")?.material);
    const body = a.get("obstacles:body")?.material as THREE.MeshStandardMaterial;
    expect(body.map).toBeNull();
    expect(`#${body.color.getHexString()}`).toBe(PRESENTATION_CONFIG.surfaces.body.color);
    disposeLevelAssets(assets);
  });
});
