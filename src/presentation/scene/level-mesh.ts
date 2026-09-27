import * as THREE from "three";
import type { FaceTone, Level, Obstacle, ObstacleGeometry } from "../../contexts/world";
import { obstacleGeometry } from "../../contexts/world";
import { Transform, Vec3 } from "../../shared";
import { buildGraffitiMeshes, GraffitiMaterials } from "../graffiti/graffiti-decals";
import type { PresentationConfig } from "../presentation.config";
import { BannerMaterials } from "../sponsors/banner-materials";
import { FALLBACK_SPONSOR_ID } from "../sponsors/sponsor-registry";
import type { TextureLibrary } from "../textures/texture-library";
import type { SurfaceTone } from "./materials";
import { SurfaceMaterials } from "./materials";
import type { Point3 } from "./world-uv";
import { bannerFaceUvs, worldBoxUvs } from "./world-uv";

/** Built level geometry (one merged mesh per tone, banners, decals, the ground slabs). */
export interface LevelMesh {
  readonly group: THREE.Group;
  dispose(): void;
}

/**
 * The materials a level is drawn with: shared surface materials (CC0 textures), banner
 * art per sponsor and graffiti decals. Built once by the renderer and reused by every
 * level, so a level change uploads no texture twice.
 */
export interface LevelAssets {
  readonly surfaces: SurfaceMaterials;
  readonly banners: BannerMaterials;
  readonly graffiti: GraffitiMaterials;
}

/** Creates the shared level assets. `textures` null = flat colours only (tests). */
export function createLevelAssets(
  config: PresentationConfig,
  textures: TextureLibrary | null,
  anisotropy: number,
): LevelAssets {
  return {
    surfaces: new SurfaceMaterials(config, textures),
    banners: new BannerMaterials(config, anisotropy),
    graffiti: new GraffitiMaterials(config, anisotropy),
  };
}

export function disposeLevelAssets(assets: LevelAssets): void {
  assets.surfaces.dispose();
  assets.banners.dispose();
  assets.graffiti.dispose();
}

/** Tones merged into one world-space mesh each (banners are grouped per sponsor). */
const MERGED_TONES: readonly (FaceTone & SurfaceTone)[] = ["body", "edge", "metal"];

/** The plain ground box gets the lightest concrete; everything built on it is darker. */
function isGroundSlab(obstacle: Obstacle): boolean {
  return obstacle.surface === "ground" && obstacle.shape.kind === "box";
}

/**
 * Appends every face of the given tone (fans: the faces are convex) to `positions`, as
 * non-indexed triangles in the frame of `transform` (world for merged meshes), so
 * `computeVertexNormals` gives flat per-face normals.
 */
function appendTone(
  positions: number[],
  geometry: ObstacleGeometry,
  tone: FaceTone,
  transform: Transform,
): void {
  for (const piece of geometry.pieces) {
    const v = piece.verticesM.map((p) => Transform.toWorldPoint(transform, p));
    for (const face of piece.faces) {
      if (face.tone !== tone) continue;
      const [i0, ...rest] = face.indices;
      const a = i0 === undefined ? undefined : v[i0];
      if (a === undefined) continue;
      for (let k = 0; k + 1 < rest.length; k += 1) {
        const bi = rest[k];
        const ci = rest[k + 1];
        const b = bi === undefined ? undefined : v[bi];
        const c = ci === undefined ? undefined : v[ci];
        if (b === undefined || c === undefined) continue;
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      }
    }
  }
}

/** Banner faces of an obstacle (world), fanned into triangles with banner UVs. */
function appendBanners(
  out: { positions: number[]; uvs: number[] },
  obstacle: Obstacle,
  geometry: ObstacleGeometry,
  artAspect: number,
): void {
  for (const piece of geometry.pieces) {
    const v = piece.verticesM.map((p) => Transform.toWorldPoint(obstacle.transform, p));
    for (const face of piece.faces) {
      if (face.tone !== "banner") continue;
      const pts = face.indices.map((i) => v[i]).filter((p): p is Vec3 => p !== undefined);
      if (pts.length < 3) continue;
      let n = Vec3.ZERO;
      pts.forEach((p, i) => {
        const q = pts[(i + 1) % pts.length];
        if (q !== undefined) n = Vec3.add(n, Vec3.cross(p, q));
      });
      const tuple = (p: Vec3): Point3 => [p.x, p.y, p.z];
      const uv = bannerFaceUvs(pts.map(tuple), tuple(n), artAspect);
      for (let k = 1; k + 1 < pts.length; k += 1) {
        for (const i of [0, k, k + 1]) {
          const p = pts[i];
          if (p === undefined) continue;
          out.positions.push(p.x, p.y, p.z);
          out.uvs.push(uv[i * 2] ?? 0, uv[i * 2 + 1] ?? 0);
        }
      }
    }
  }
}

/** A flat-shaded geometry from triangle positions (+ UVs), or null when there are none. */
function toGeometry(
  positions: readonly number[],
  uvs: ArrayLike<number>,
): THREE.BufferGeometry | null {
  if (positions.length === 0) return null;
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  out.setAttribute("uv", new THREE.Float32BufferAttribute(Array.from(uvs), 2));
  out.computeVertexNormals();
  return out;
}

/** Concrete slab joints on the top face of a ground box, in the box's local frame. */
function slabJoints(obstacle: Obstacle, config: PresentationConfig): THREE.BufferGeometry | null {
  if (!isGroundSlab(obstacle) || obstacle.shape.kind !== "box") return null;
  const { x: hx, y: hy, z: hz } = obstacle.shape.halfExtentsM;
  const step = config.ground.slabJointSpacingM;
  const y = hy + config.ground.slabJointLiftM;
  const positions: number[] = [];
  for (let x = -Math.floor(hx / step) * step; x <= hx; x += step) {
    positions.push(x, y, -hz, x, y, hz);
  }
  for (let z = -Math.floor(hz / step) * step; z <= hz; z += step) {
    positions.push(-hx, y, z, hx, y, z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

/**
 * Builds the level's meshes from the world domain's `obstacleGeometry`, the same convex
 * pieces the physics colliders are built from (ADR 0008). STYLE.md: flat-shaded concrete
 * with CC0 detail textures (UVs projected in world space, so every kind tiles at the same
 * real scale), darker edges and coping, brushed metal rails, sponsor banners on barriers,
 * graffiti decals. Every obstacle's faces are merged, in world space, into ONE mesh per
 * tone, plus one per sponsor and one per graffiti piece. Built once per level; nothing
 * here runs per frame. `assets` are shared and NOT disposed with the level (without
 * them, flat-colour assets are made for this level and disposed with it).
 */
export function buildLevelMesh(
  level: Level,
  config: PresentationConfig,
  sharedAssets?: LevelAssets,
): LevelMesh {
  const assets = sharedAssets ?? createLevelAssets(config, null, 1);
  const { surfaces } = assets;
  const group = new THREE.Group();
  group.name = `level:${level.id}`;

  const merged: Record<string, number[]> = { body: [], edge: [], metal: [] };
  const banners = new Map<string, { positions: number[]; uvs: number[] }>();
  for (const obstacle of level.obstacles) {
    const geometry = obstacleGeometry(obstacle);
    if (!isGroundSlab(obstacle)) {
      for (const tone of MERGED_TONES) {
        appendTone(merged[tone] ?? [], geometry, tone, obstacle.transform);
      }
      const shape = obstacle.shape;
      const sponsorId =
        shape.kind === "barrier"
          ? (shape.banner?.sponsorId ?? FALLBACK_SPONSOR_ID)
          : FALLBACK_SPONSOR_ID;
      let entry = banners.get(sponsorId);
      if (entry === undefined) {
        entry = { positions: [], uvs: [] };
        banners.set(sponsorId, entry);
      }
      appendBanners(entry, obstacle, geometry, assets.banners.artAspect);
      continue;
    }
    // Ground slabs: their own lighter mesh (receives shadows, casts none) and joints.
    const node = new THREE.Group();
    node.name = obstacle.id;
    const { positionM: p, rotation: q } = obstacle.transform;
    node.position.set(p.x, p.y, p.z);
    node.quaternion.set(q.x, q.y, q.z, q.w);
    const local: number[] = [];
    appendTone(local, geometry, "body", Transform.IDENTITY);
    const world: number[] = [];
    appendTone(world, geometry, "body", obstacle.transform);
    const slab = toGeometry(local, worldBoxUvs(world, surfaces.metresPerRepeat("ground")));
    if (slab !== null) {
      const mesh = new THREE.Mesh(slab, surfaces.get("ground"));
      mesh.name = `${obstacle.id}:body`;
      mesh.receiveShadow = true;
      node.add(mesh);
    }
    const joints = slabJoints(obstacle, config);
    if (joints !== null) node.add(new THREE.LineSegments(joints, surfaces.joint));
    group.add(node);
  }

  const shadowed = (mesh: THREE.Mesh): THREE.Mesh => {
    mesh.receiveShadow = true;
    // STYLE.md: only the board and obstacles cast shadows.
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };
  for (const tone of MERGED_TONES) {
    const positions = merged[tone] ?? [];
    const geometry = toGeometry(positions, worldBoxUvs(positions, surfaces.metresPerRepeat(tone)));
    if (geometry === null) continue;
    shadowed(new THREE.Mesh(geometry, surfaces.get(tone))).name = `obstacles:${tone}`;
  }
  for (const [sponsorId, { positions, uvs }] of banners) {
    const geometry = toGeometry(positions, uvs);
    if (geometry === null) continue;
    shadowed(new THREE.Mesh(geometry, assets.banners.get(sponsorId))).name = `banner:${sponsorId}`;
  }
  for (const mesh of buildGraffitiMeshes(level.graffiti ?? [], assets.graffiti, config)) {
    group.add(mesh);
  }

  return {
    group,
    dispose(): void {
      group.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments)
          child.geometry.dispose();
      });
      if (sharedAssets === undefined) disposeLevelAssets(assets);
    },
  };
}
