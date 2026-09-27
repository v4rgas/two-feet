import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { flatMaterial } from "./materials";

/**
 * Simple low-poly skate shoe (STYLE.md: flat-shaded, no textures): a cream sole slab, a
 * chamfered upper that is tall at the heel and low at the toe, and a dark ankle opening.
 *
 * SHOE FRAME (metres): origin = CENTRE OF THE SOLE'S BOTTOM FACE, +X = toe, +Y = up,
 * +Z = the shoe's left side (right-handed). Setting the origin on a deck point places
 * the sole flat on the grip tape.
 *
 * One merged, non-indexed `BufferGeometry` with a draw group per material, in
 * `SHOE_MATERIAL` order; pair it with `createShoeMaterials` (all parts share opacity, so a
 * detached shoe fades as one). Build once and reuse: nothing here runs per frame.
 */

/** Shoe dimensions, m. */
export interface ShoeSize {
  /** Heel to toe, sole included. */
  readonly lengthM: number;
  /** Width of the sole. */
  readonly widthM: number;
  /** Top of the collar above the sole's bottom face. */
  readonly heightM: number;
  readonly soleThicknessM: number;
  /** How far the sole sticks out past the upper, all around. */
  readonly soleFlareM: number;
}

export interface ShoeColors {
  readonly upper: string;
  readonly sole: string;
  /** The ankle opening. */
  readonly lace: string;
}

/** Draw-group / material index of each shoe part. */
export const SHOE_MATERIAL = { upper: 0, sole: 1, lace: 2 } as const;

/**
 * Upper side profile, heel (u = 0) to toe (u = 1), `h` as a fraction of the height above
 * the sole. Shape design data of the asset, not tuning.
 */
const UPPER_PROFILE: readonly { u: number; h: number }[] = [
  { u: 0, h: 1 },
  { u: 0.4, h: 1 },
  { u: 0.75, h: 0.55 },
  { u: 1, h: 0.3 },
];
/** Chamfer of the upper's edges, m (reads as rounded at low poly counts). */
const UPPER_CHAMFER_M = 0.01;
/** Ankle opening: heel-side span along the upper (u) and inset from the sides. */
const ANKLE = { u0: 0.08, u1: 0.36, insetFrac: 0.28, liftM: 0.001 };

/** Point (in the shoe frame) where the leg leaves the collar. */
export function shoeAnkleLocal(size: ShoeSize): { readonly x: number; readonly y: number } {
  return { x: uToX(size, (ANKLE.u0 + ANKLE.u1) / 2), y: size.heightM };
}

/** Builds the shoe geometry (see the frame above). */
export function buildShoeGeometry(size: ShoeSize): THREE.BufferGeometry {
  const parts = [buildUpper(size), buildSole(size), buildAnkle(size)].map((g) => {
    const flat = g.index === null ? g : g.toNonIndexed();
    flat.deleteAttribute("uv");
    return flat;
  });
  const geometry = mergeGeometries(parts, true);
  for (const part of parts) part.dispose();
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/** Flat-shaded materials in `SHOE_MATERIAL` order, all at the same opacity. */
export function createShoeMaterials(colors: ShoeColors, opacity = 1): THREE.MeshStandardMaterial[] {
  const materials = [
    flatMaterial(colors.upper, opacity),
    flatMaterial(colors.sole, opacity),
    flatMaterial(colors.lace, opacity),
  ];
  if (opacity < 1) for (const m of materials) m.depthWrite = false;
  return materials;
}

// ── parts ────────────────────────────────────────────────────────────────────────────

/** Heel-to-toe coordinate of the upper (inside the sole flare) → shoe X. */
function uToX(size: ShoeSize, u: number): number {
  const half = size.lengthM / 2 - size.soleFlareM;
  return -half + u * 2 * half;
}

/** A rounded rectangle (top view) extruded `thicknessM` up from y = 0. */
function buildSole(size: ShoeSize): THREE.BufferGeometry {
  const hx = size.lengthM / 2;
  const hz = size.widthM / 2;
  const r = hz * 0.9;
  const shape = new THREE.Shape();
  shape.moveTo(-hx + r, -hz);
  shape.lineTo(hx - r, -hz);
  shape.quadraticCurveTo(hx, -hz, hx, 0);
  shape.quadraticCurveTo(hx, hz, hx - r, hz);
  shape.lineTo(-hx + r, hz);
  shape.quadraticCurveTo(-hx, hz, -hx, 0);
  shape.quadraticCurveTo(-hx, -hz, -hx + r, -hz);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: size.soleThicknessM,
    bevelEnabled: false,
    curveSegments: 3,
  });
  // Shape lives in XY (Y = across) and extrudes along +Z: lay it flat, extruding up.
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, size.soleThicknessM, 0);
  return geometry;
}

/** Side profile (XY) extruded across the shoe, with chamfered edges. */
function buildUpper(size: ShoeSize): THREE.BufferGeometry {
  const c = UPPER_CHAMFER_M;
  const bottom = size.soleThicknessM + c;
  const rise = size.heightM - c - bottom;
  const top = UPPER_PROFILE.map(
    (p) =>
      new THREE.Vector2(
        uToX(size, p.u) + (p.u === 0 ? c : p.u === 1 ? -c : 0),
        bottom + p.h * rise,
      ),
  );
  const first = top[0] ?? new THREE.Vector2();
  const last = top[top.length - 1] ?? new THREE.Vector2();
  const shape = new THREE.Shape([
    new THREE.Vector2(first.x, bottom),
    new THREE.Vector2(last.x, bottom),
    ...[...top].reverse(),
  ]);
  const halfWidth = size.widthM / 2 - size.soleFlareM;
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 2 * (halfWidth - c),
    bevelEnabled: true,
    bevelThickness: c,
    bevelSize: c,
    bevelSegments: 1,
  });
  geometry.translate(0, 0, -(halfWidth - c));
  return geometry;
}

/** A dark flat patch on top of the heel: the opening the leg goes into. */
function buildAnkle(size: ShoeSize): THREE.BufferGeometry {
  const x0 = uToX(size, ANKLE.u0);
  const x1 = uToX(size, ANKLE.u1);
  const halfWidth = (size.widthM / 2 - size.soleFlareM) * (1 - ANKLE.insetFrac);
  const geometry = new THREE.PlaneGeometry(x1 - x0, 2 * halfWidth);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate((x0 + x1) / 2, size.heightM + ANKLE.liftM, 0);
  return geometry;
}
