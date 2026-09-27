/*
 * UVs for the level's flat-shaded, non-indexed triangles. Pure maths (no three), tested.
 *
 * Surfaces: "box" (triplanar-style) projection in WORLD space. Each triangle takes the
 * plane its normal faces most (top → XZ, ±X → ZY, ±Z → XY) and its world coordinates,
 * divided by the metres per texture repeat. So every obstacle kind tiles at the same real
 * scale without per-kind UV code, and textures line up across pieces and obstacles.
 *
 * Banners: the artwork face gets 0..1 across its height, and a whole number of artwork
 * tiles along its length (the art's aspect kept within a small stretch).
 */

/**
 * Box-projected UVs for triangle `positions` (x, y, z per vertex, three vertices per
 * triangle, world metres): 2 floats per vertex, in texture repeats.
 */
export function worldBoxUvs(positions: ArrayLike<number>, metresPerRepeat: number): Float32Array {
  const count = Math.floor(positions.length / 9);
  const uvs = new Float32Array(count * 6);
  const k = 1 / metresPerRepeat;
  const p = (i: number): number => positions[i] ?? 0;
  for (let t = 0; t < count; t += 1) {
    const o = t * 9;
    // Face normal (unnormalised) of the triangle.
    const e1x = p(o + 3) - p(o);
    const e1y = p(o + 4) - p(o + 1);
    const e1z = p(o + 5) - p(o + 2);
    const e2x = p(o + 6) - p(o);
    const e2y = p(o + 7) - p(o + 1);
    const e2z = p(o + 8) - p(o + 2);
    const nx = Math.abs(e1y * e2z - e1z * e2y);
    const ny = Math.abs(e1z * e2x - e1x * e2z);
    const nz = Math.abs(e1x * e2y - e1y * e2x);
    for (let v = 0; v < 3; v += 1) {
      const x = p(o + v * 3);
      const y = p(o + v * 3 + 1);
      const z = p(o + v * 3 + 2);
      let u: number;
      let w: number;
      if (ny >= nx && ny >= nz) {
        u = x;
        w = -z;
      } else if (nx >= nz) {
        u = z;
        w = y;
      } else {
        u = x;
        w = y;
      }
      uvs[t * 6 + v * 2] = u * k;
      uvs[t * 6 + v * 2 + 1] = w * k;
    }
  }
  return uvs;
}

/** A 3D point as a tuple. */
export type Point3 = readonly [number, number, number];

/**
 * UVs for the vertices of one flat banner face (seen from outside, `normal` outward):
 * u runs left → right as a viewer facing the face sees it, v bottom → top. v spans
 * 0..1; u spans a whole number of artwork tiles (≥ 1) whose aspect is closest to
 * `artAspect` (width / height). Returns 2 floats per input point.
 */
export function bannerFaceUvs(
  points: readonly Point3[],
  normal: Point3,
  artAspect: number,
): number[] {
  const [nx, , nz] = normal;
  // Right = up × n (horizontal, for a vertical face); up' = n × right.
  let rx = nz;
  let rz = -nx;
  const rl = Math.hypot(rx, rz);
  if (rl < 1e-9) {
    rx = 1;
    rz = 0;
  } else {
    rx /= rl;
    rz /= rl;
  }
  const us = points.map(([x, , z]) => x * rx + z * rz);
  const vs = points.map(([, y]) => y);
  const u0 = Math.min(...us);
  const v0 = Math.min(...vs);
  const width = Math.max(...us) - u0;
  const height = Math.max(...vs) - v0;
  const tiles = Math.max(1, Math.round(width / Math.max(height, 1e-9) / artAspect));
  const out: number[] = [];
  points.forEach((_, i) => {
    out.push((((us[i] ?? 0) - u0) / Math.max(width, 1e-9)) * tiles);
    out.push(((vs[i] ?? 0) - v0) / Math.max(height, 1e-9));
  });
  return out;
}
