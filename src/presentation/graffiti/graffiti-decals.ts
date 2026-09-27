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

/** A decal's frame: centre on the surface, unit right / up / normal, half sizes (m). */
export interface DecalFrame {
  readonly centre: THREE.Vector3;
  readonly right: THREE.Vector3;
  readonly up: THREE.Vector3;
  readonly normal: THREE.Vector3;
  readonly halfWidthM: number;
  readonly halfHeightM: number;
}

/**
 * The frame of a placement: centred on it, the art's up as close to world +Y as the
 * surface allows (up the slope on a ramp; world −Z on flat ground), turned by
 * `rotationRad` about the normal.
 */
export function decalFrame(g: GraffitiPlacement, aspect: number): DecalFrame {
  const n = new THREE.Vector3(g.normal.x, g.normal.y, g.normal.z).normalize();
  const worldUp = Math.abs(n.y) > 0.95 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(worldUp, n).normalize();
  const up = new THREE.Vector3().crossVectors(n, right).normalize();
  const a = g.rotationRad ?? 0;
  const r = right.clone().multiplyScalar(Math.cos(a)).addScaledVector(up, Math.sin(a));
  const u = up.clone().multiplyScalar(Math.cos(a)).addScaledVector(right, -Math.sin(a));
  return {
    centre: new THREE.Vector3(g.positionM.x, g.positionM.y, g.positionM.z),
    right: r,
    up: u,
    normal: n,
    halfWidthM: g.sizeM / 2,
    halfHeightM: g.sizeM / aspect / 2,
  };
}

/**
 * The four corners (bottom-left, bottom-right, top-right, top-left) of a decal's flat
 * quad, lifted `liftM` off the surface (its extent on a flat surface).
 */
export function decalCorners(
  g: GraffitiPlacement,
  aspect: number,
  liftM: number,
): [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3] {
  const f = decalFrame(g, aspect);
  const c = f.centre.clone().addScaledVector(f.normal, liftM);
  const at = (sx: number, sy: number): THREE.Vector3 =>
    c
      .clone()
      .addScaledVector(f.right, sx * f.halfWidthM)
      .addScaledVector(f.up, sy * f.halfHeightM);
  return [at(-1, -1), at(1, -1), at(1, 1), at(-1, 1)];
}

/** A vertex in decal space: x along right, y along up, z along the normal (m). */
type DecalPoint = readonly [number, number, number];

/** Sutherland–Hodgman: keeps the part of `poly` where `coord` · sign ≤ limit. */
function clipAxis(poly: DecalPoint[], coord: 0 | 1 | 2, sign: 1 | -1, limit: number): DecalPoint[] {
  const out: DecalPoint[] = [];
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i] as DecalPoint;
    const b = poly[(i + 1) % poly.length] as DecalPoint;
    const da = limit - sign * a[coord];
    const db = limit - sign * b[coord];
    if (da >= 0) out.push(a);
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  return out;
}

/**
 * Projects one placement onto the level's surface triangles (world, 9 numbers each), like
 * a projector box: every triangle that faces the decal (its normal within
 * `graffiti.minFacing` of the decal's), clipped to the box (the art's width and height,
 * ± `projectHalfDepthM` along the normal), becomes decal triangles that follow the
 * surface: flat walls and ground, sloped banks, the facets of a curved transition. Each
 * vertex is lifted `liftM` along the decal normal (continuous across facets) and gets
 * the art's UV from its position in the box. Appends to `out`.
 */
export function projectDecal(
  g: GraffitiPlacement,
  aspect: number,
  surfaces: ArrayLike<number>,
  config: PresentationConfig,
  out: { positions: number[]; uvs: number[] },
): void {
  const f = decalFrame(g, aspect);
  const { projectHalfDepthM: depth, minFacing, liftM } = config.graffiti;
  const hw = f.halfWidthM;
  const hh = f.halfHeightM;
  const c = f.centre;
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const tn = new THREE.Vector3();
  const toDecal = (i: number): DecalPoint => {
    const x = (surfaces[i] ?? 0) - c.x;
    const y = (surfaces[i + 1] ?? 0) - c.y;
    const z = (surfaces[i + 2] ?? 0) - c.z;
    return [
      x * f.right.x + y * f.right.y + z * f.right.z,
      x * f.up.x + y * f.up.y + z * f.up.z,
      x * f.normal.x + y * f.normal.y + z * f.normal.z,
    ];
  };
  for (let t = 0; t + 8 < surfaces.length; t += 9) {
    const a = toDecal(t);
    const b = toDecal(t + 3);
    const d = toDecal(t + 6);
    // Quick reject: all three corners outside the same side of the box.
    let outside = false;
    for (const [k, lim] of [
      [0, hw],
      [1, hh],
      [2, depth],
    ] as const) {
      if (a[k] > lim && b[k] > lim && d[k] > lim) outside = true;
      if (a[k] < -lim && b[k] < -lim && d[k] < -lim) outside = true;
    }
    if (outside) continue;
    // Facing: the triangle's normal (in decal space, z = along the decal normal).
    e1.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    e2.set(d[0] - a[0], d[1] - a[1], d[2] - a[2]);
    tn.crossVectors(e1, e2);
    const len = tn.length();
    if (len < 1e-12 || tn.z / len < minFacing) continue;
    let poly: DecalPoint[] = [a, b, d];
    for (const [k, lim] of [
      [0, hw],
      [1, hh],
      [2, depth],
    ] as const) {
      poly = clipAxis(poly, k, 1, lim);
      if (poly.length < 3) break;
      poly = clipAxis(poly, k, -1, lim);
      if (poly.length < 3) break;
    }
    if (poly.length < 3) continue;
    const p0 = poly[0] as DecalPoint;
    for (let k = 1; k + 1 < poly.length; k += 1) {
      for (const p of [p0, poly[k] as DecalPoint, poly[k + 1] as DecalPoint]) {
        const z = p[2] + liftM;
        out.positions.push(
          c.x + f.right.x * p[0] + f.up.x * p[1] + f.normal.x * z,
          c.y + f.right.y * p[0] + f.up.y * p[1] + f.normal.y * z,
          c.z + f.right.z * p[0] + f.up.z * p[1] + f.normal.z * z,
        );
        out.uvs.push((p[0] / hw + 1) / 2, (p[1] / hh + 1) / 2);
      }
    }
  }
}

/**
 * Decal meshes for a level's graffiti, projected onto `surfaces` (the level's world
 * triangles, 9 numbers each: see `projectDecal`): every placement of the same piece
 * merged into one mesh (one draw call per piece). Unknown piece ids, and placements that
 * land on no surface, are skipped. Built once per level; visual only (no collider).
 */
export function buildGraffitiMeshes(
  placements: readonly GraffitiPlacement[],
  surfaces: ArrayLike<number>,
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
    projectDecal(g, piece.aspect, surfaces, config, entry);
  }
  const meshes: THREE.Mesh[] = [];
  for (const { piece, positions, uvs } of byPiece.values()) {
    if (positions.length === 0) continue;
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
