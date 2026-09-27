import * as THREE from "three";
import type { GraffitiPlacement } from "../../contexts/world";
import type { PresentationConfig } from "../presentation.config";
import { paintGraffiti } from "./graffiti-art";
import type { GraffitiPiece } from "./graffiti-registry";
import { graffitiPieceById } from "./graffiti-registry";

/**
 * One shared decal material per graffiti piece: the piece's canvas art MULTIPLIED into
 * whatever is behind it (so the concrete, its grain and its shadows show through the
 * paint), unlit, never writing depth, pulled forward with a polygon offset. Hidden until
 * the art is painted (browser only).
 */
export class GraffitiMaterials {
  private readonly materials = new Map<string, THREE.MeshBasicMaterial>();
  private readonly textures: THREE.Texture[] = [];

  constructor(
    private readonly config: PresentationConfig,
    private readonly anisotropy: number,
  ) {}

  get(piece: GraffitiPiece): THREE.MeshBasicMaterial {
    const cached = this.materials.get(piece.id);
    if (cached !== undefined) return cached;
    const material = new THREE.MeshBasicMaterial({
      name: `graffiti:${piece.id}`,
      transparent: true,
      opacity: this.config.graffiti.opacity,
      blending: THREE.MultiplyBlending,
      premultipliedAlpha: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
      toneMapped: false,
    });
    material.visible = false;
    this.materials.set(piece.id, material);
    paintGraffiti(piece, this.config.graffiti.canvasPx)
      .then((canvas) => {
        if (canvas === null) return;
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = this.anisotropy;
        this.textures.push(texture);
        material.map = texture;
        material.visible = true;
        material.needsUpdate = true;
      })
      .catch(() => {
        // Art failed: the piece stays hidden.
      });
    return material;
  }

  dispose(): void {
    for (const m of this.materials.values()) m.dispose();
    for (const t of this.textures) t.dispose();
    this.materials.clear();
    this.textures.length = 0;
  }
}

/**
 * The four corners (bottom-left, bottom-right, top-right, top-left) of a decal quad:
 * centred on the placement, lifted `liftM` off the surface, upright (its up as close to
 * world +Y as the surface allows), turned by `rotationRad` about the normal.
 */
export function decalCorners(
  g: GraffitiPlacement,
  aspect: number,
  liftM: number,
): [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3] {
  const n = new THREE.Vector3(g.normal.x, g.normal.y, g.normal.z).normalize();
  const worldUp = Math.abs(n.y) > 0.95 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(worldUp, n).normalize();
  const up = new THREE.Vector3().crossVectors(n, right).normalize();
  const a = g.rotationRad ?? 0;
  const r = right.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a));
  const u = up.clone().multiplyScalar(Math.cos(a)).addScaledVector(right, -Math.sin(a));
  const hw = g.sizeM / 2;
  const hh = g.sizeM / aspect / 2;
  const c = new THREE.Vector3(g.positionM.x, g.positionM.y, g.positionM.z).addScaledVector(
    n,
    liftM,
  );
  const at = (sx: number, sy: number): THREE.Vector3 =>
    c
      .clone()
      .addScaledVector(r, sx * hw)
      .addScaledVector(u, sy * hh);
  return [at(-1, -1), at(1, -1), at(1, 1), at(-1, 1)];
}

/**
 * Decal meshes for a level's graffiti: every placement of the same piece merged into one
 * mesh (one draw call per piece). Unknown piece ids are skipped. Built once per level.
 */
export function buildGraffitiMeshes(
  placements: readonly GraffitiPlacement[],
  materials: GraffitiMaterials,
  config: PresentationConfig,
): THREE.Mesh[] {
  const byPiece = new Map<string, { piece: GraffitiPiece; positions: number[]; uvs: number[] }>();
  for (const g of placements) {
    const piece = graffitiPieceById(g.pieceId);
    if (piece === undefined) continue;
    let entry = byPiece.get(piece.id);
    if (entry === undefined) {
      entry = { piece, positions: [], uvs: [] };
      byPiece.set(piece.id, entry);
    }
    const [bl, br, tr, tl] = decalCorners(g, piece.aspect, config.graffiti.liftM);
    for (const p of [bl, br, tr, bl, tr, tl]) entry.positions.push(p.x, p.y, p.z);
    entry.uvs.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
  }
  const meshes: THREE.Mesh[] = [];
  for (const { piece, positions, uvs } of byPiece.values()) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, materials.get(piece));
    mesh.name = `graffiti:${piece.id}`;
    mesh.renderOrder = 1;
    meshes.push(mesh);
  }
  return meshes;
}
