import * as THREE from "three";
import type { FaceTone, Level, Obstacle, ObstacleGeometry } from "../../contexts/world";
import { obstacleGeometry } from "../../contexts/world";
import { Transform } from "../../shared";
import type { PresentationConfig } from "../presentation.config";
import { flatMaterial } from "./materials";

/** Built level geometry (one merged mesh per tone, the ground slabs, their joints). */
export interface LevelMesh {
  readonly group: THREE.Group;
  dispose(): void;
}

const TONES: readonly FaceTone[] = ["body", "edge", "metal"];

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

/** A flat-shaded geometry from triangle positions, or null when there are none. */
function toGeometry(positions: readonly number[]): THREE.BufferGeometry | null {
  if (positions.length === 0) return null;
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
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
 * (concrete-100 ground, concrete-300 obstacles), concrete-600 edges and coping, metal
 * rails. Every obstacle's faces are merged, in world space, into ONE mesh per tone, so a
 * big course (the street course has ~20 obstacles) is still three draw calls plus the
 * ground. Built once per level; nothing here runs per frame.
 */
export function buildLevelMesh(level: Level, config: PresentationConfig): LevelMesh {
  const { palette } = config;
  const group = new THREE.Group();
  group.name = `level:${level.id}`;
  const ground = flatMaterial(palette.concrete100);
  const toneMaterials: Record<FaceTone, THREE.MeshStandardMaterial> = {
    body: flatMaterial(palette.concrete300),
    edge: flatMaterial(palette.concrete600),
    metal: flatMaterial(palette.metal),
  };
  const jointMaterial = new THREE.LineBasicMaterial({
    color: palette.concrete600,
    transparent: true,
    opacity: config.ground.slabJointOpacity,
  });
  const materials: THREE.Material[] = [ground, ...Object.values(toneMaterials), jointMaterial];

  const merged: Record<FaceTone, number[]> = { body: [], edge: [], metal: [] };
  for (const obstacle of level.obstacles) {
    const geometry = obstacleGeometry(obstacle);
    if (!isGroundSlab(obstacle)) {
      for (const tone of TONES) appendTone(merged[tone], geometry, tone, obstacle.transform);
      continue;
    }
    // Ground slabs: their own lighter mesh (receives shadows, casts none) and joints.
    const node = new THREE.Group();
    node.name = obstacle.id;
    const { positionM: p, rotation: q } = obstacle.transform;
    node.position.set(p.x, p.y, p.z);
    node.quaternion.set(q.x, q.y, q.z, q.w);
    const positions: number[] = [];
    appendTone(positions, geometry, "body", Transform.IDENTITY);
    const slab = toGeometry(positions);
    if (slab !== null) {
      const mesh = new THREE.Mesh(slab, ground);
      mesh.name = `${obstacle.id}:body`;
      mesh.receiveShadow = true;
      node.add(mesh);
    }
    const joints = slabJoints(obstacle, config);
    if (joints !== null) node.add(new THREE.LineSegments(joints, jointMaterial));
    group.add(node);
  }

  for (const tone of TONES) {
    const geometry = toGeometry(merged[tone]);
    if (geometry === null) continue;
    const mesh = new THREE.Mesh(geometry, toneMaterials[tone]);
    mesh.name = `obstacles:${tone}`;
    mesh.receiveShadow = true;
    // STYLE.md: only the board and obstacles cast shadows.
    mesh.castShadow = true;
    group.add(mesh);
  }

  return {
    group,
    dispose(): void {
      group.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments)
          child.geometry.dispose();
      });
      for (const m of materials) m.dispose();
    },
  };
}
