import * as THREE from "three";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";
import type { Level, Obstacle } from "../../contexts/world";
import type { SurfaceType } from "../../shared";
import type { PresentationConfig } from "../presentation.config";
import { flatMaterial } from "./materials";

/** Built level geometry (one mesh per obstacle, plus slab joints on ground boxes). */
export interface LevelMesh {
  readonly group: THREE.Group;
  dispose(): void;
}

function surfaceColor(surface: SurfaceType, palette: PresentationConfig["palette"]): string {
  switch (surface) {
    case "ground":
      return palette.concrete100;
    case "ramp":
    case "ledge":
      return palette.concrete300;
    case "grindable":
      return palette.metal;
  }
}

function obstacleGeometry(obstacle: Obstacle): THREE.BufferGeometry {
  const shape = obstacle.shape;
  if (shape.kind === "box") {
    const h = shape.halfExtentsM;
    return new THREE.BoxGeometry(h.x * 2, h.y * 2, h.z * 2);
  }
  return new ConvexGeometry(shape.pointsM.map((p) => new THREE.Vector3(p.x, p.y, p.z)));
}

/** Concrete slab joints on the top face of a ground box, in the box's local frame. */
function slabJoints(obstacle: Obstacle, config: PresentationConfig): THREE.BufferGeometry | null {
  if (obstacle.surface !== "ground" || obstacle.shape.kind !== "box") return null;
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

/** Builds meshes for every obstacle of the level (STYLE.md: flat-shaded concrete). */
export function buildLevelMesh(level: Level, config: PresentationConfig): LevelMesh {
  const group = new THREE.Group();
  group.name = `level:${level.id}`;
  const materials: THREE.Material[] = [];
  const jointMaterial = new THREE.LineBasicMaterial({
    color: config.palette.concrete600,
    transparent: true,
    opacity: config.ground.slabJointOpacity,
  });
  materials.push(jointMaterial);

  for (const obstacle of level.obstacles) {
    const material = flatMaterial(surfaceColor(obstacle.surface, config.palette));
    materials.push(material);
    const mesh = new THREE.Mesh(obstacleGeometry(obstacle), material);
    mesh.name = obstacle.id;
    const { positionM: p, rotation: q } = obstacle.transform;
    mesh.position.set(p.x, p.y, p.z);
    mesh.quaternion.set(q.x, q.y, q.z, q.w);
    mesh.receiveShadow = true;
    // STYLE.md: only the board and obstacles cast shadows. The ground itself does not need to.
    mesh.castShadow = obstacle.surface !== "ground";
    const joints = slabJoints(obstacle, config);
    if (joints !== null) mesh.add(new THREE.LineSegments(joints, jointMaterial));
    group.add(mesh);
  }

  return {
    group,
    dispose(): void {
      group.traverse((node) => {
        if (node instanceof THREE.Mesh || node instanceof THREE.LineSegments)
          node.geometry.dispose();
      });
      for (const m of materials) m.dispose();
    },
  };
}
