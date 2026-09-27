import * as THREE from "three";
import { flatMaterial } from "./materials";

/**
 * Procedural low-poly skate shoe (STYLE.md: flat-shaded, no textures): a classic low-top
 * suede cupsole. Cream flared sole with a toe spring, bulbous toe box, padded collar,
 * tongue, a few ink lace bars and a cream side stripe.
 *
 * SHOE FRAME (metres): origin = CENTRE OF THE SOLE'S BOTTOM FACE, +X = toe, +Y = up,
 * +Z = the shoe's left side (right-handed). Setting the origin on a deck point places
 * the sole flat on the grip tape. Only the toe spring lifts off y = 0 (toward +X).
 *
 * One merged, non-indexed `BufferGeometry` with a draw group per material, in
 * `SHOE_MATERIAL` order; pair it with `createShoeMaterials` (all parts share opacity, so a
 * detached shoe fades as one). Build once and reuse: nothing here runs per frame.
 */

/** Shoe dimensions, m. */
export interface ShoeSize {
  /** Heel to toe, sole included. */
  readonly lengthM: number;
  /** Widest point of the sole (the ball of the foot). */
  readonly widthM: number;
  /** Top of the padded collar above the sole's bottom face. */
  readonly heightM: number;
  readonly soleThicknessM: number;
  /** How far the sole sticks out past the upper, all around. */
  readonly soleFlareM: number;
  /** Lift of the sole's toe tip off the ground. */
  readonly toeSpringM: number;
}

export interface ShoeColors {
  readonly upper: string;
  readonly sole: string;
  /** Laces and the ankle opening. */
  readonly lace: string;
}

/** Draw-group / material index of each shoe part. */
export const SHOE_MATERIAL = { upper: 0, sole: 1, lace: 2 } as const;
const MATERIAL_COUNT = 3;

/**
 * Upper profile, heel (u = 0) to toe (u = 1). `w`: half width as a fraction of the sole's
 * half width; `h`: top of the upper as a fraction of `heightM`; `p`: cross-section
 * exponent (small = boxy flat top at the heel, larger = rounded toe box).
 * Shape design data of the asset, not tuning.
 */
const PROFILE: readonly { u: number; w: number; h: number; p: number }[] = [
  { u: 0, w: 0, h: 0.7, p: 0.35 },
  { u: 0.025, w: 0.52, h: 0.72, p: 0.35 },
  { u: 0.07, w: 0.74, h: 0.73, p: 0.35 },
  { u: 0.14, w: 0.8, h: 0.73, p: 0.35 },
  { u: 0.25, w: 0.8, h: 0.76, p: 0.4 },
  { u: 0.4, w: 0.82, h: 0.74, p: 0.5 },
  { u: 0.55, w: 0.9, h: 0.67, p: 0.6 },
  { u: 0.7, w: 1, h: 0.61, p: 0.7 },
  { u: 0.81, w: 0.98, h: 0.58, p: 0.75 },
  { u: 0.9, w: 0.86, h: 0.53, p: 0.75 },
  { u: 0.96, w: 0.62, h: 0.44, p: 0.8 },
  { u: 1, w: 0, h: 0.33, p: 0.8 },
];
/** Segments of the upper's cross-section arch (side to side over the top). */
const ARCH_SEGMENTS = 6;
/** The upper starts this far inside the sole (no seam), m. */
const UPPER_SINK_M = 0.003;
/** Toe spring starts at this fraction of the length (heel = 0). */
const TOE_SPRING_START_U = 0.68;

/** Collar (padded ankle ring) against the heel: radii as fractions of length / width. */
const COLLAR = {
  radiusXFrac: 0.16,
  radiusZFrac: 0.31,
  tubeFrac: 0.12,
  sideDipM: 0.007,
  segments: 10,
};
/** Tongue: from u0 (rear, sticking up in the ankle opening) to u1 (lying on the vamp). */
const TONGUE = { u0: 0.28, u1: 0.66, halfWidthFrac: 0.2, thicknessM: 0.006, lipFrac: 1.03 };
/** Lace bars along u, and their half span as a fraction of the width. */
const LACES = { us: [0.39, 0.47, 0.55, 0.63], halfSpanFrac: 0.23, depthM: 0.006, heightM: 0.003 };
/** Side stripe path: u and height fraction (0 = sole top, 1 = upper top) of its centre. */
const STRIPE: readonly { u: number; y: number; half: number }[] = [
  { u: 0.06, y: 0.3, half: 0.1 },
  { u: 0.16, y: 0.36, half: 0.11 },
  { u: 0.27, y: 0.45, half: 0.1 },
  { u: 0.38, y: 0.56, half: 0.08 },
  { u: 0.48, y: 0.66, half: 0.06 },
  { u: 0.55, y: 0.74, half: 0.03 },
];
const STRIPE_OFFSET_M = 0.0015;

/** Point (in the shoe frame, before toe spring) where the leg leaves the collar. */
export function shoeAnkleLocal(size: ShoeSize): { readonly x: number; readonly y: number } {
  return { x: collarCenterX(size), y: size.heightM };
}

/** The collar's rear sits on the heel of the upper. */
function collarCenterX(size: ShoeSize): number {
  const rx = COLLAR.radiusXFrac * size.lengthM;
  const tube = COLLAR.tubeFrac * size.widthM;
  return -size.lengthM / 2 + size.soleFlareM + rx + tube * 0.4;
}

/** Builds the shoe geometry (see the frame above). */
export function buildShoeGeometry(size: ShoeSize): THREE.BufferGeometry {
  const b = new TriangleBuilder();
  buildSole(b, size);
  buildUpper(b, size);
  buildCollar(b, size);
  buildTongueAndLaces(b, size);
  buildStripes(b, size);
  const geometry = b.toGeometry();
  applyToeSpring(geometry, size);
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

function uToX(size: ShoeSize, u: number): number {
  return (u - 0.5) * size.lengthM;
}

/** Linear interpolation of the upper profile at u. */
function profileAt(u: number): { w: number; h: number; p: number } {
  for (let i = 1; i < PROFILE.length; i++) {
    const a = PROFILE[i - 1];
    const c = PROFILE[i];
    if (a !== undefined && c !== undefined && u <= c.u) {
      const t = (u - a.u) / (c.u - a.u);
      return { w: a.w + (c.w - a.w) * t, h: a.h + (c.h - a.h) * t, p: a.p + (c.p - a.p) * t };
    }
  }
  const last = PROFILE[PROFILE.length - 1];
  return { w: last?.w ?? 0, h: last?.h ?? 0, p: last?.p ?? 1 };
}

/** Top of the upper (centre line) at u, m. */
function upperTopY(size: ShoeSize, u: number): number {
  return Math.max(profileAt(u).h * size.heightM, size.soleThicknessM + 0.004);
}

/**
 * A point of the upper's surface at u, arch angle θ ∈ [0, π] (0 = +Z side, π = −Z side).
 * Superellipse cross-section from the sole top up to `upperTopY`.
 */
function upperPoint(size: ShoeSize, u: number, theta: number): THREE.Vector3 {
  const { w, p } = profileAt(u);
  const halfWidth = Math.max(0, (w * size.widthM) / 2 - size.soleFlareM);
  const flare = 1 - (2 * size.soleFlareM) / size.lengthM;
  const base = size.soleThicknessM - UPPER_SINK_M;
  const c = Math.cos(theta);
  const s = Math.abs(Math.sin(theta));
  return new THREE.Vector3(
    uToX(size, u) * flare,
    base + (upperTopY(size, u) - base) * s ** p,
    halfWidth * Math.sign(c) * Math.abs(c) ** p,
  );
}

function buildUpper(b: TriangleBuilder, size: ShoeSize): void {
  const rings = PROFILE.map((st) => {
    const ring: THREE.Vector3[] = [];
    for (let k = 0; k <= ARCH_SEGMENTS; k++)
      ring.push(upperPoint(size, st.u, (k / ARCH_SEGMENTS) * Math.PI));
    return ring;
  });
  b.loft(SHOE_MATERIAL.upper, rings, false);
}

/** The sole outline (closed, counter-clockwise from the heel) at height y, inset by d. */
function soleRing(size: ShoeSize, y: number, d: number): THREE.Vector3[] {
  const half = size.lengthM / 2;
  const scaleX = (half - d) / half;
  const right: THREE.Vector3[] = [];
  const left: THREE.Vector3[] = [];
  for (const st of PROFILE.slice(1, -1)) {
    const x = uToX(size, st.u) * scaleX;
    const z = Math.max(0, (st.w * size.widthM) / 2 - d);
    right.push(new THREE.Vector3(x, y, z));
    left.push(new THREE.Vector3(x, y, -z));
  }
  return [
    new THREE.Vector3(-half + d, y, 0),
    ...right,
    new THREE.Vector3(half - d, y, 0),
    ...left.reverse(),
  ];
}

function buildSole(b: TriangleBuilder, size: ShoeSize): void {
  const t = size.soleThicknessM;
  const rings = [soleRing(size, 0, 0.003), soleRing(size, t * 0.3, 0), soleRing(size, t, 0.001)];
  b.loft(SHOE_MATERIAL.sole, rings, true, true);
  // Thin ink foxing line around the sole.
  const line = [soleRing(size, t * 0.52, -0.0008), soleRing(size, t * 0.62, -0.0008)];
  b.loft(SHOE_MATERIAL.lace, line, true);
}

/** Padded collar: an elliptical tube around the ankle opening, filled with ink inside. */
function buildCollar(b: TriangleBuilder, size: ShoeSize): void {
  const cx = collarCenterX(size);
  const rx = COLLAR.radiusXFrac * size.lengthM;
  const rz = COLLAR.radiusZFrac * size.widthM;
  const tube = COLLAR.tubeFrac * size.widthM;
  const cy = size.heightM - tube * Math.SQRT1_2;
  const n = COLLAR.segments;
  const tubeSides = 4;
  const rings: THREE.Vector3[][] = [];
  for (let i = 0; i < n; i++) {
    const phi = (i / n) * Math.PI * 2;
    const cos = Math.cos(phi);
    const sin = Math.sin(phi);
    const outward = new THREE.Vector3(cos / rx, 0, sin / rz).normalize();
    // Lower on the sides (under the ankle bones), high at the heel and by the tongue.
    const y = cy - COLLAR.sideDipM * sin * sin;
    const center = new THREE.Vector3(cx + rx * cos, y, rz * sin);
    const ring: THREE.Vector3[] = [];
    for (let k = 0; k < tubeSides; k++) {
      const a = (k / tubeSides) * Math.PI * 2 + Math.PI / 4;
      ring.push(
        center
          .clone()
          .addScaledVector(outward, Math.cos(a) * tube)
          .add(new THREE.Vector3(0, Math.sin(a) * tube, 0)),
      );
    }
    rings.push(ring);
  }
  b.loft(SHOE_MATERIAL.upper, rings, true, false, true);
  // Ankle opening: a dark ellipse just inside the collar.
  const opening: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const phi = (i / n) * Math.PI * 2;
    opening.push(
      new THREE.Vector3(
        cx + (rx - tube) * Math.cos(phi),
        cy - COLLAR.sideDipM - tube * 0.2,
        (rz - tube) * Math.sin(phi),
      ),
    );
  }
  b.fan(SHOE_MATERIAL.lace, opening, new THREE.Vector3(0, 1, 0));
}

function buildTongueAndLaces(b: TriangleBuilder, size: ShoeSize): void {
  const th = TONGUE.thicknessM;
  const us = [TONGUE.u0, 0.33, 0.43, 0.54, TONGUE.u1];
  const bottomAt = (u: number): number =>
    u <= TONGUE.u0 + 1e-9 ? size.heightM * TONGUE.lipFrac - th : upperTopY(size, u) - 0.0015;
  const sections = us.map((u) => {
    const x = uToX(size, u);
    const y = bottomAt(u);
    const hw = TONGUE.halfWidthFrac * size.widthM * (u > 0.5 ? 0.85 : 1);
    return [
      new THREE.Vector3(x, y, hw),
      new THREE.Vector3(x, y + th, hw * 0.9),
      new THREE.Vector3(x, y + th, -hw * 0.9),
      new THREE.Vector3(x, y, -hw),
    ];
  });
  b.loft(SHOE_MATERIAL.upper, sections, true, true);

  const box = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const matrix = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const du = 0.01;
  for (const u of LACES.us) {
    const x = uToX(size, u);
    const y0 = bottomAt(u - du);
    const y1 = bottomAt(u + du);
    const slope = Math.atan2(y1 - y0, 2 * du * size.lengthM);
    q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), slope);
    matrix.compose(
      new THREE.Vector3(x, bottomAt(u) + th + LACES.heightM / 2, 0),
      q,
      new THREE.Vector3(LACES.depthM, LACES.heightM, 2 * LACES.halfSpanFrac * size.widthM),
    );
    b.addGeometry(SHOE_MATERIAL.lace, box, matrix);
  }
  box.dispose();
}

/** Cream side stripes (one per side) following the upper's surface. */
function buildStripes(b: TriangleBuilder, size: ShoeSize): void {
  for (const side of [1, -1]) {
    const rows: THREE.Vector3[][] = [[], [], []];
    for (const s of STRIPE) {
      const { p } = profileAt(s.u);
      [s.y - s.half, s.y, s.y + s.half].forEach((yf, r) => {
        const theta = Math.asin(Math.min(1, Math.max(0, yf)) ** (1 / p));
        const point = upperPoint(size, s.u, side > 0 ? theta : Math.PI - theta);
        point.z += side * STRIPE_OFFSET_M;
        point.y += STRIPE_OFFSET_M * 0.5;
        rows[r]?.push(point);
      });
    }
    const hint = new THREE.Vector3(0, 0, side);
    for (let r = 0; r < rows.length - 1; r++) {
      const lo = rows[r] ?? [];
      const hi = rows[r + 1] ?? [];
      for (let i = 0; i < lo.length - 1; i++) {
        b.quad(SHOE_MATERIAL.sole, lo[i], lo[i + 1], hi[i + 1], hi[i], hint);
      }
    }
  }
}

/** Lifts the front of the shoe: quadratic in x from `TOE_SPRING_START_U` to the tip. */
function applyToeSpring(geometry: THREE.BufferGeometry, size: ShoeSize): void {
  const position = geometry.getAttribute("position");
  const x0 = uToX(size, TOE_SPRING_START_U);
  const span = size.lengthM / 2 - x0;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    if (x > x0) position.setY(i, position.getY(i) + size.toeSpringM * ((x - x0) / span) ** 2);
  }
  position.needsUpdate = true;
}

// ── triangle soup ────────────────────────────────────────────────────────────────────

/**
 * Collects triangles per material. Every triangle is wound so its normal points along an
 * outward hint (the builders are simple convex-ish lofts), and degenerate ones are dropped.
 */
class TriangleBuilder {
  private readonly buckets: number[][] = Array.from({ length: MATERIAL_COUNT }, () => []);
  private readonly ab = new THREE.Vector3();
  private readonly ac = new THREE.Vector3();
  private readonly n = new THREE.Vector3();

  tri(m: number, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, hint: THREE.Vector3): void {
    this.ab.subVectors(b, a);
    this.ac.subVectors(c, a);
    this.n.crossVectors(this.ab, this.ac);
    if (this.n.lengthSq() < 1e-14) return;
    const flip = this.n.dot(hint) < 0;
    const out = this.buckets[m];
    if (out === undefined) return;
    for (const v of flip ? [a, c, b] : [a, b, c]) out.push(v.x, v.y, v.z);
  }

  quad(
    m: number,
    a: THREE.Vector3 | undefined,
    b: THREE.Vector3 | undefined,
    c: THREE.Vector3 | undefined,
    d: THREE.Vector3 | undefined,
    hint: THREE.Vector3,
  ): void {
    if (a === undefined || b === undefined || c === undefined || d === undefined) return;
    this.tri(m, a, b, c, hint);
    this.tri(m, a, c, d, hint);
  }

  /** Fan-fills a closed polygon from its centroid, facing `normal`. */
  fan(m: number, ring: readonly THREE.Vector3[], normal: THREE.Vector3): void {
    const center = centroid(ring);
    ring.forEach((v, i) => {
      const next = ring[(i + 1) % ring.length];
      if (next !== undefined) this.tri(m, center, v, next, normal);
    });
  }

  /**
   * Skins consecutive rings (equal vertex counts). `closed`: each ring is a loop;
   * `caps`: fan-fill the first and last ring; `wrap`: also join the last ring to the first.
   * Outward = away from the local ring centroids.
   */
  loft(
    m: number,
    rings: readonly THREE.Vector3[][],
    closed: boolean,
    caps = false,
    wrap = false,
  ): void {
    const centers = rings.map(centroid);
    const count = wrap ? rings.length : rings.length - 1;
    const hint = new THREE.Vector3();
    const core = new THREE.Vector3();
    for (let r = 0; r < count; r++) {
      const r1 = (r + 1) % rings.length;
      const a = rings[r] ?? [];
      const b = rings[r1] ?? [];
      core.addVectors(centers[r] ?? core, centers[r1] ?? core).multiplyScalar(0.5);
      const n = closed ? a.length : a.length - 1;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % a.length;
        const pa = a[i];
        const pb = a[j];
        const pc = b[j];
        const pd = b[i];
        if (!pa || !pb || !pc || !pd) continue;
        hint.copy(pa).add(pb).add(pc).add(pd).multiplyScalar(0.25).sub(core);
        this.quad(m, pa, pb, pc, pd, hint);
      }
    }
    if (caps && rings.length > 1) {
      const first = rings[0] ?? [];
      const last = rings[rings.length - 1] ?? [];
      const c0 = centers[0] ?? new THREE.Vector3();
      const c1 = centers[1] ?? new THREE.Vector3();
      const cn = centers[rings.length - 1] ?? new THREE.Vector3();
      const cm = centers[rings.length - 2] ?? new THREE.Vector3();
      this.fan(m, first, c0.clone().sub(c1));
      this.fan(m, last, cn.clone().sub(cm));
    }
  }

  /** Appends a (non-indexed) geometry transformed by `matrix`. */
  addGeometry(m: number, geometry: THREE.BufferGeometry, matrix: THREE.Matrix4): void {
    const position = geometry.getAttribute("position");
    const out = this.buckets[m];
    if (out === undefined) return;
    const v = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i).applyMatrix4(matrix);
      out.push(v.x, v.y, v.z);
    }
  }

  toGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const all: number[] = [];
    this.buckets.forEach((bucket, m) => {
      geometry.addGroup(all.length / 3, bucket.length / 3, m);
      for (const value of bucket) all.push(value);
    });
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(all, 3));
    return geometry;
  }
}

function centroid(points: readonly THREE.Vector3[]): THREE.Vector3 {
  const c = new THREE.Vector3();
  for (const p of points) c.add(p);
  return points.length > 0 ? c.divideScalar(points.length) : c;
}
