import { describe, expect, it } from "vitest";
import type { SurfaceType } from "../../../shared";
import { degToRad, Transform, Vec3 } from "../../../shared";
import { WORLD_CONFIG } from "../world.config";
import type { Obstacle, ObstacleShape as Shape } from "./obstacle";
import { ObstacleShape } from "./obstacle";
import type { ConvexPiece } from "./obstacle-geometry";
import {
  bankLedgeRunM,
  funboxBankRunM,
  kickerLipAngleRad,
  kinkedRailTopLine,
  obstacleCollider,
  quarterPipeLipAngleRad,
  quarterPipeLipXM,
  shapeGeometry,
  stairsFootXM,
  stairsHeightM,
  transitionPoints,
} from "./obstacle-geometry";
import { createSkateparkLevel } from "./skatepark";

const G = WORLD_CONFIG.geometry;

function centroid(points: readonly Vec3[]): Vec3 {
  let sum = Vec3.ZERO;
  for (const p of points) sum = Vec3.add(sum, p);
  return Vec3.scale(sum, 1 / points.length);
}

function facePoints(piece: ConvexPiece, indices: readonly number[]): Vec3[] {
  return indices.map((i) => {
    const v = piece.verticesM[i];
    if (v === undefined) throw new Error(`bad index ${i}`);
    return v;
  });
}

/** Newell normal of a polygon (unnormalised; its length is twice the area). */
function newell(points: readonly Vec3[]): Vec3 {
  let n = Vec3.ZERO;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (a === undefined || b === undefined) continue;
    n = Vec3.add(n, Vec3.cross(a, b));
  }
  return n;
}

interface Box3 {
  min: Vec3;
  max: Vec3;
}

function bounds(points: readonly Vec3[]): Box3 {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const zs = points.map((p) => p.z);
  return {
    min: Vec3.create(Math.min(...xs), Math.min(...ys), Math.min(...zs)),
    max: Vec3.create(Math.max(...xs), Math.max(...ys), Math.max(...zs)),
  };
}

function allVertices(pieces: readonly ConvexPiece[]): Vec3[] {
  return pieces.flatMap((p) => [...p.verticesM]);
}

/** Every face planar, outward and non-degenerate; the piece convex. */
function expectWellFormed(piece: ConvexPiece): void {
  const c = centroid(piece.verticesM);
  expect(piece.faces.length).toBeGreaterThanOrEqual(4);
  for (const face of piece.faces) {
    const pts = facePoints(piece, face.indices);
    expect(pts.length).toBeGreaterThanOrEqual(3);
    const n = newell(pts);
    expect(Vec3.length(n)).toBeGreaterThan(1e-8); // not degenerate
    const unit = Vec3.normalize(n);
    const fc = centroid(pts);
    // Outward: the normal points away from the piece's centroid.
    expect(Vec3.dot(unit, Vec3.sub(fc, c))).toBeGreaterThan(0);
    // Planar, and every vertex of the piece is on the inner side (convex).
    for (const p of pts) expect(Math.abs(Vec3.dot(unit, Vec3.sub(p, fc)))).toBeLessThan(1e-9);
    for (const v of piece.verticesM) expect(Vec3.dot(unit, Vec3.sub(v, fc))).toBeLessThan(1e-9);
  }
  // Closed surface: every edge is used exactly once in each direction.
  const edges = new Map<string, number>();
  for (const face of piece.faces) {
    face.indices.forEach((a, k) => {
      const b = face.indices[(k + 1) % face.indices.length];
      edges.set(`${a}>${b}`, (edges.get(`${a}>${b}`) ?? 0) + 1);
    });
  }
  for (const [key, count] of edges) {
    const [a, b] = key.split(">");
    expect(count).toBe(1);
    expect(edges.get(`${b}>${a}`)).toBe(1);
  }
}

const QP = ObstacleShape.quarterPipe({
  radiusM: 2.2,
  heightM: 1.3,
  widthM: 5,
  deckDepthM: 1.2,
  copingRadiusM: 0.03,
});
const KICKER = ObstacleShape.kicker({ lengthM: 1.4, heightM: 0.32, widthM: 1.2 });
const BANK = ObstacleShape.bank({ angleRad: degToRad(20), lengthM: 3, widthM: 6 });
const LEDGE = ObstacleShape.ledge({ lengthM: 4, depthM: 0.5, heightM: 0.4, edgeChamferM: 0.03 });
const RAIL = ObstacleShape.rail({ lengthM: 4, heightM: 0.35, barRadiusM: 0.024, profile: "round" });
const STAIRS = ObstacleShape.stairs({
  stepCount: 5,
  riseM: 0.16,
  runM: 0.32,
  widthM: 3.5,
  topDepthM: 8,
  hubba: { widthM: 0.45, heightM: 0.35, edgeRadiusM: 0.02 },
  handrail: { heightM: 0.8, barRadiusM: 0.024, offsetM: 0.3 },
});

const FUNBOX = ObstacleShape.funbox({
  topLengthM: 5,
  topWidthM: 3,
  heightM: 0.5,
  bankAngleRad: degToRad(20),
  sides: { plusX: "bank", minusX: "bank", plusZ: "ledge", minusZ: "bank" },
  edgeChamferM: 0.03,
  topRail: { zM: -0.7, lengthM: 3.4, heightM: 0.3, barRadiusM: 0.024 },
  bankRail: { side: "plusX", zM: 0.6, flatM: 1.2, heightM: 0.3, barRadiusM: 0.024 },
});
const HIP = ObstacleShape.funbox({
  topLengthM: 2,
  topWidthM: 2,
  heightM: 0.7,
  bankAngleRad: degToRad(22),
  sides: { plusX: "wall", minusX: "bank", plusZ: "wall", minusZ: "bank" },
  edgeChamferM: 0.03,
});
const KINKED = ObstacleShape.kinkedRail({
  flatTopM: 2.2,
  downRunM: 0.99,
  dropM: 0.45,
  flatBottomM: 2.5,
  heightM: 0.35,
  barRadiusM: 0.024,
});
const BANK_LEDGE = ObstacleShape.bankLedge({
  angleRad: degToRad(25),
  bankHeightM: 0.6,
  widthM: 5,
  ledgeHeightM: 0.3,
  ledgeDepthM: 0.6,
  edgeChamferM: 0.03,
});
const STAIRS_BOTH = ObstacleShape.stairs({
  stepCount: 7,
  riseM: 0.15,
  runM: 0.33,
  widthM: 4,
  topDepthM: 7,
  backSlopeRad: degToRad(14),
  hubba: { widthM: 0.45, heightM: 0.28, edgeRadiusM: 0.02, flatTopM: 0.9, bothSides: true },
  handrail: { heightM: 0.38, barRadiusM: 0.024, offsetM: 0.3, centered: true, overhangM: 0 },
});

const ALL: readonly [string, Shape, SurfaceType][] = [
  ["funbox", FUNBOX, "ramp"],
  ["hip (funbox with two banks)", HIP, "ramp"],
  ["kinked rail", KINKED, "grindable"],
  ["bank to ledge", BANK_LEDGE, "ramp"],
  ["stairs with two hubbas and a centred handrail", STAIRS_BOTH, "ground"],
  ["quarterPipe", QP, "ramp"],
  ["kicker", KICKER, "ramp"],
  ["bank", BANK, "ramp"],
  ["ledge", LEDGE, "ledge"],
  ["rail", RAIL, "grindable"],
  ["square rail", { ...RAIL, profile: "square" }, "grindable"],
  ["stairs", STAIRS, "ground"],
  ["box", ObstacleShape.box({ halfExtentsM: Vec3.create(1, 0.5, 2) }), "ground"],
];

describe("obstacle geometry: every piece is a closed convex polyhedron with outward faces", () => {
  for (const [name, shape, surface] of ALL) {
    it(name, () => {
      const { pieces } = shapeGeometry(surface, shape);
      expect(pieces.length).toBeGreaterThan(0);
      for (const piece of pieces) expectWellFormed(piece);
    });
  }
});

/** The top face of a ramp piece (the riding surface): normal up-ish, not a Z cap. */
function topPlane(piece: ConvexPiece): { point: Vec3; normal: Vec3 } {
  for (const face of piece.faces) {
    const pts = facePoints(piece, face.indices);
    const n = Vec3.normalize(newell(pts));
    if (n.y > 0.01 && Math.abs(n.z) < 0.5) return { point: centroid(pts), normal: n };
  }
  throw new Error("no top face");
}

/** Signed height of `p` above a plane (along its normal), m. */
function above(plane: { point: Vec3; normal: Vec3 }, p: Vec3): number {
  return Vec3.dot(plane.normal, Vec3.sub(p, plane.point));
}

const at2 = (p: readonly [number, number] | undefined, z = 0): Vec3 => {
  if (p === undefined) throw new Error("missing point");
  return Vec3.create(p[0], p[1], z);
};

describe("quarter pipe", () => {
  const { pieces } = shapeGeometry("ramp", QP);
  const ramp = pieces.filter((p) => p.surface === "ramp");
  const transition = ramp.slice(0, -1);
  const deck = ramp[ramp.length - 1];
  const coping = pieces.filter((p) => p.surface === "grindable");
  const lipX = quarterPipeLipXM(QP);
  const lipAngle = quarterPipeLipAngleRad(QP);
  const points = transitionPoints(QP.radiusM, lipAngle, G.maxSegmentAngleRad);

  it("has the right dimensions: deck at the height, coping just proud of it, width", () => {
    if (deck === undefined) throw new Error("no deck");
    const d = bounds(deck.verticesM);
    expect(d.max.y).toBeCloseTo(QP.heightM, 9);
    expect(d.max.x).toBeCloseTo(lipX + QP.deckDepthM, 9);
    const all = bounds(allVertices(pieces));
    expect(all.max.y).toBeCloseTo(QP.heightM + G.copingRevealM, 9);
    expect(all.max.z - all.min.z).toBeCloseTo(QP.widthM, 9);
    // Nothing sticks out in front of the toe above the ground.
    for (const v of allVertices(pieces)) if (v.x < 0) expect(v.y).toBeLessThanOrEqual(1e-12);
    expect(lipX).toBeCloseTo(Math.sqrt(QP.radiusM ** 2 - (QP.radiusM - QP.heightM) ** 2), 9);
  });

  it("splits the transition into segments no wider than the max angle, chords of the circle", () => {
    expect(transition.length).toBe(Math.ceil(lipAngle / G.maxSegmentAngleRad));
    expect(points.length).toBe(transition.length + 1);
    for (const p of points.slice(0, -1)) {
      expect(Math.hypot(p[0], p[1] - QP.radiusM)).toBeCloseTo(QP.radiusM, 9);
    }
    transition.forEach((piece, i) => {
      const plane = topPlane(piece);
      // Each top face is the chord between two consecutive points on the circle.
      expect(above(plane, at2(points[i]))).toBeCloseTo(0, 9);
      expect(
        above(plane, at2(i + 1 === transition.length ? [lipX, QP.heightM] : points[i + 1])),
      ).toBeCloseTo(0, 9);
    });
  });

  it("has continuous seams, with each piece's end edges buried under its neighbour", () => {
    // The first chord starts at the toe, flush with the ground; the last ends at the lip,
    // flush with the deck top.
    const first = transition[0];
    const last = transition[transition.length - 1];
    if (first === undefined || last === undefined || deck === undefined) throw new Error("pieces");
    expect(above(topPlane(first), Vec3.ZERO)).toBeCloseTo(0, 9);
    expect(above(topPlane(last), Vec3.create(lipX, QP.heightM, 0))).toBeCloseTo(0, 9);
    expect(above(topPlane(deck), Vec3.create(lipX, QP.heightM, 0))).toBeCloseTo(0, 9);
    for (let i = 0; i + 1 < transition.length; i += 1) {
      const a = transition[i];
      const b = transition[i + 1];
      if (a === undefined || b === undefined) throw new Error("missing piece");
      const seam = at2(points[i + 1]);
      // Continuous: both top faces pass through the seam point.
      expect(above(topPlane(a), seam)).toBeCloseTo(0, 9);
      expect(above(topPlane(b), seam)).toBeCloseTo(0, 9);
      // Buried: every vertex of b lies at least `seamBuryM` below a's riding surface
      // wherever it is behind the seam, and vice versa (no exposed seam edges).
      for (const v of b.verticesM) {
        if (v.x < seam.x - 1e-9) expect(above(topPlane(a), v)).toBeLessThan(-G.seamBuryM + 1e-9);
      }
      // Forward extensions stop at the lip, so near it they are buried less deeply.
      const lipLimited = a.verticesM.some((v) => Math.abs(v.x - lipX) < 1e-9);
      for (const v of a.verticesM) {
        if (v.x > seam.x + 1e-9 && v.y > 0) {
          expect(above(topPlane(b), v)).toBeLessThan(lipLimited ? -1e-9 : -G.seamBuryM + 1e-9);
        }
      }
      expect(Math.max(...a.verticesM.map((v) => v.x))).toBeLessThanOrEqual(lipX + 1e-9);
    }
    // The first piece's back edge is buried under the ground.
    expect(Math.min(...first.verticesM.map((v) => v.y))).toBeLessThan(-G.seamBuryM + 1e-9);
  });

  it("the transition's top faces point up and into the ramp (−X), steeper toward the lip", () => {
    let lastSlope = -1;
    for (const piece of transition) {
      const n = topPlane(piece).normal;
      expect(n.x).toBeLessThan(0);
      const slope = Math.atan2(-n.x, n.y);
      expect(slope).toBeGreaterThan(lastSlope);
      lastSlope = slope;
    }
    expect(lastSlope).toBeLessThan(lipAngle);
  });

  it("has a grindable coping flush with the wall, standing just proud of the deck", () => {
    expect(coping).toHaveLength(1);
    const c = coping[0];
    if (c === undefined) throw new Error("no coping");
    expect(c.faces.every((f) => f.tone === "edge")).toBe(true);
    // Every coping vertex is behind the wall's tangent line at the lip (flush, no bump).
    const wall = {
      point: Vec3.create(lipX, QP.heightM, 0),
      normal: Vec3.create(-Math.sin(lipAngle), Math.cos(lipAngle), 0),
    };
    const worst = Math.max(...c.verticesM.map((v) => above(wall, v)));
    expect(worst).toBeCloseTo(-G.copingInsetM, 9);
    expect(bounds(c.verticesM).max.y).toBeCloseTo(QP.heightM + G.copingRevealM, 9);
  });
});

describe("bank, kicker", () => {
  it("bank: a single wedge rising to lengthM·sin(angle), its toe buried", () => {
    const { pieces } = shapeGeometry("ramp", BANK);
    expect(pieces).toHaveLength(1);
    const b = bounds(allVertices(pieces));
    expect(b.max.y).toBeCloseTo(3 * Math.sin(degToRad(20)), 9);
    expect(b.max.x).toBeCloseTo(3 * Math.cos(degToRad(20)), 9);
    const piece = pieces[0];
    if (piece === undefined) throw new Error("no piece");
    const plane = topPlane(piece);
    expect(above(plane, Vec3.ZERO)).toBeCloseTo(0, 9); // the slope meets the ground at x = 0
    expect(b.min.y).toBeLessThan(-G.seamBuryM + 1e-9);
    expect(Math.acos(plane.normal.y)).toBeCloseTo(degToRad(20), 9);
  });

  it("kicker: tangent to the ground at the toe, lip at (length, height)", () => {
    const { pieces } = shapeGeometry("ramp", KICKER);
    const b = bounds(allVertices(pieces));
    expect(b.max.x).toBeCloseTo(KICKER.lengthM, 9);
    expect(b.max.y).toBeCloseTo(KICKER.heightM, 9);
    const first = pieces[0];
    const last = pieces[pieces.length - 1];
    if (first === undefined || last === undefined) throw new Error("no piece");
    // The first segment is nearly flat (tangent to the ground) and starts at the toe.
    expect(Math.acos(topPlane(first).normal.y)).toBeLessThan(G.maxSegmentAngleRad);
    expect(above(topPlane(first), Vec3.ZERO)).toBeCloseTo(0, 9);
    expect(above(topPlane(last), Vec3.create(KICKER.lengthM, KICKER.heightM, 0))).toBeCloseTo(0, 9);
    expect(kickerLipAngleRad(KICKER)).toBeGreaterThan(degToRad(20));
    expect(kickerLipAngleRad(KICKER)).toBeLessThan(degToRad(35));
  });
});

describe("ledge, rail", () => {
  it("ledge: length × depth × height, with two chamfered top edges in the edge tone", () => {
    const { pieces } = shapeGeometry("ledge", LEDGE);
    const b = bounds(allVertices(pieces));
    expect(b.max.x - b.min.x).toBeCloseTo(4, 9);
    expect(b.max.z - b.min.z).toBeCloseTo(0.5, 9);
    expect(b.max.y).toBeCloseTo(0.4, 9);
    const edges = pieces.flatMap((p) => p.faces.filter((f) => f.tone === "edge"));
    expect(edges).toHaveLength(2);
    expect(pieces.every((p) => p.surface === "ledge")).toBe(true);
  });

  it("rail: a grindable bar whose top is at the height, on two posts", () => {
    for (const profile of ["round", "square"] as const) {
      const { pieces } = shapeGeometry("grindable", { ...RAIL, profile });
      const bar = pieces.filter((p) => p.surface === "grindable");
      expect(bar).toHaveLength(1);
      const b = bounds(bar[0]?.verticesM ?? []);
      expect(b.max.y).toBeCloseTo(RAIL.heightM, 9);
      expect(b.max.x - b.min.x).toBeCloseTo(RAIL.lengthM, 9);
      expect(pieces.filter((p) => p.surface === "ground")).toHaveLength(2);
    }
  });
});

describe("stairs", () => {
  const { pieces } = shapeGeometry("ground", STAIRS);
  const steps = pieces.filter(
    (p) => p.surface === "ground" && p.faces.every((f) => f.tone === "body"),
  );
  const h = stairsHeightM(STAIRS);

  it("has a platform and one solid box per tread, stepping down by the rise", () => {
    expect(steps).toHaveLength(STAIRS.stepCount); // platform + (n − 1) treads
    steps.forEach((piece, i) => {
      const b = bounds(piece.verticesM);
      expect(b.min.y).toBe(0);
      expect(b.max.y).toBeCloseTo(h - i * STAIRS.riseM, 9);
      if (i > 0) {
        expect(b.min.x).toBeCloseTo((i - 1) * STAIRS.runM, 9);
        expect(b.max.x).toBeCloseTo(i * STAIRS.runM, 9);
      } else {
        expect(b.min.x).toBeCloseTo(-STAIRS.topDepthM, 9);
        expect(b.max.x).toBeCloseTo(0, 9);
      }
    });
    expect(h).toBeCloseTo(0.8, 9);
    expect(stairsFootXM(STAIRS)).toBeCloseTo(1.6, 9);
  });

  it("puts a hubba (ledge) with a grindable steel edge on +Z, a grindable handrail on −Z", () => {
    const hubba = pieces.filter((p) => p.surface === "ledge");
    expect(hubba).toHaveLength(1);
    const hb = bounds(hubba[0]?.verticesM ?? []);
    expect(hb.min.z).toBeCloseTo(STAIRS.widthM / 2, 9);
    expect(hb.max.y).toBeCloseTo(h + 0.35, 9);
    const grind = pieces.filter((p) => p.surface === "grindable");
    expect(grind).toHaveLength(3); // hubba edge (slope + flat) + handrail bar
    const edges = grind.filter((p) => bounds(p.verticesM).min.z > 0);
    const rails = grind.filter((p) => bounds(p.verticesM).max.z < 0);
    expect(edges).toHaveLength(2);
    expect(rails).toHaveLength(1);
    // The handrail's top follows the nosings: 0.8 m (square to the line) above them.
    const railTopAtTop = Math.max(...(rails[0]?.verticesM ?? []).map((v) => v.y));
    expect(railTopAtTop).toBeGreaterThan(h + 0.8);
  });
});

/** The top facet of a bar (the face whose normal points most upward). */
function barTop(piece: ConvexPiece): { point: Vec3; normal: Vec3 } {
  const faces = faceNormals(piece).sort((a, b) => b.n.y - a.n.y);
  const top = faces[0];
  if (top === undefined) throw new Error("no faces");
  return { point: centroid(top.points), normal: top.n };
}

/** Outward unit normals of a piece's faces, with their tones and points. */
function faceNormals(piece: ConvexPiece): { n: Vec3; tone: string; points: Vec3[] }[] {
  return piece.faces.map((f) => {
    const points = facePoints(piece, f.indices);
    return { n: Vec3.normalize(newell(points)), tone: f.tone, points };
  });
}

describe("funbox", () => {
  const { pieces } = shapeGeometry("ramp", FUNBOX);
  const ramp = pieces.filter((p) => p.surface === "ramp");
  const core = ramp[0] as ConvexPiece;
  const run = funboxBankRunM(FUNBOX);
  const a = degToRad(20);
  const normals = faceNormals(core);
  const crestT = G.bankCrestRadiusM * Math.tan(a / 2);
  const toeT = G.bankToeRadiusM * Math.tan(a / 2);
  const toeSegments = Math.ceil(a / G.maxSegmentAngleRad - 1e-9);
  // Bank sides of FUNBOX: outward direction and half the top along it.
  const banks = [
    { out: Vec3.UNIT_X, half: 2.5 },
    { out: Vec3.create(-1, 0, 0), half: 2.5 },
    { out: Vec3.create(0, 0, -1), half: 1.5 },
  ];
  /** The toe fillet pieces of the bank facing `out`, from the ground up. */
  const filletOf = (out: Vec3): ConvexPiece[] =>
    ramp.slice(1).filter((p) => {
      const n = topPlane(p).normal;
      return Vec3.dot(Vec3.normalize(Vec3.create(n.x, 0, n.z)), out) > 0.9 || n.y > 0.9999;
    });

  it("one convex core (top, banks, rounded crests) plus a rounded toe fillet per bank", () => {
    expect(ramp).toHaveLength(1 + 3 * toeSegments);
    const b = bounds(core.verticesM);
    expect(b.max.y).toBeCloseTo(0.5, 9);
    expect(b.min.y).toBeCloseTo(-G.seamBuryM, 9); // the sharp toes are under the ground
    expect(b.max.z).toBeCloseTo(1.5, 9); // the ledge side is a wall
    // The flat top: the top's size less the rounded crest on each bank side (and the
    // chamfer on the ledge side).
    const top = normals.find((f) => f.n.y > 0.9999);
    if (top === undefined) throw new Error("no top face");
    const tb = bounds(top.points);
    expect(tb.max.x - tb.min.x).toBeCloseTo(5 - 2 * crestT, 9);
    expect(tb.max.z).toBeCloseTo(1.5 - 0.03, 9);
    expect(tb.min.z).toBeCloseTo(-1.5 + crestT, 9);
  });

  it("each bank is a straight face at the bank angle between the rounded crest and toe", () => {
    const straight = normals.filter((f) => Math.abs(Math.acos(f.n.y) - a) < 1e-9);
    expect(straight).toHaveLength(3);
    for (const { out, half } of banks) {
      const face = straight.find((f) => Vec3.dot(f.n, out) > 0.3);
      if (face === undefined) throw new Error("missing bank face");
      const plane = { point: centroid(face.points), normal: face.n };
      // Its plane runs through the sharp top edge and the sharp toe line.
      expect(above(plane, Vec3.add(Vec3.scale(out, half), Vec3.create(0, 0.5, 0)))).toBeCloseTo(
        0,
        9,
      );
      expect(above(plane, Vec3.scale(out, half + run))).toBeCloseTo(0, 9);
    }
    // The crest facets turn from flat to the bank angle, each by at most `maxSegmentAngleRad`.
    const crest = normals.filter(
      (f) => f.n.y < 0.9999 && Math.acos(f.n.y) < a - 1e-9 && f.tone === "body",
    );
    expect(crest.length).toBeGreaterThanOrEqual(3 * Math.ceil(a / G.maxSegmentAngleRad - 1e-9) - 3);
  });

  it("the toe fillets meet the ground tangentially, have continuous seams, and bury every end edge", () => {
    for (const { out, half } of banks) {
      const fillet = filletOf(out);
      expect(fillet).toHaveLength(toeSegments);
      // Sort from the ground up (outermost first).
      fillet.sort((p, q) => Math.acos(topPlane(p).normal.y) - Math.acos(topPlane(q).normal.y));
      const first = fillet[0] as ConvexPiece;
      const lastPiece = fillet[fillet.length - 1] as ConvexPiece;
      // Leaves the ground at s = run + R·tan(a/2), nearly flat.
      const groundPoint = Vec3.scale(out, half + run + toeT);
      expect(above(topPlane(first), groundPoint)).toBeCloseTo(0, 9);
      expect(Math.acos(topPlane(first).normal.y)).toBeLessThan(G.maxSegmentAngleRad);
      expect(bounds(first.verticesM).min.y).toBeLessThan(-G.seamBuryM + 1e-9);
      // Its last chord meets the straight bank R·tan(a/2) up the slope from the sharp toe.
      const bankFace = normals.find(
        (f) => Math.abs(Math.acos(f.n.y) - a) < 1e-9 && Vec3.dot(f.n, out) > 0.3,
      );
      if (bankFace === undefined) throw new Error("no bank face");
      const bankPlane = { point: centroid(bankFace.points), normal: bankFace.n };
      const tangent = Vec3.add(
        Vec3.scale(out, half + run - toeT * Math.cos(a)),
        Vec3.create(0, toeT * Math.sin(a), 0),
      );
      expect(above(topPlane(lastPiece), tangent)).toBeCloseTo(0, 9);
      expect(above(bankPlane, tangent)).toBeCloseTo(0, 9);
      // Its inner end runs on under the bank's straight face, buried ≥ seamBuryM.
      const innerMost = lastPiece.verticesM.reduce((m, v) =>
        Vec3.dot(v, out) < Vec3.dot(m, out) ? v : m,
      );
      expect(above(bankPlane, innerMost)).toBeLessThan(-G.seamBuryM + 1e-9);
      for (let i = 0; i + 1 < fillet.length; i += 1) {
        const p = topPlane(fillet[i] as ConvexPiece);
        const q = fillet[i + 1] as ConvexPiece;
        // Continuous: both top faces pass through the seam (on the arc) …
        const seamS = half + run + toeT - G.bankToeRadiusM * Math.sin(((i + 1) * a) / toeSegments);
        const seamY = G.bankToeRadiusM * (1 - Math.cos(((i + 1) * a) / toeSegments));
        const seam = Vec3.add(Vec3.scale(out, seamS), Vec3.create(0, seamY, 0));
        expect(above(p, seam)).toBeCloseTo(0, 9);
        expect(above(topPlane(q), seam)).toBeCloseTo(0, 9);
        // … and q's outer end (its top face's outermost edge) is buried under p's surface.
        const qTop = faceNormals(q).find((f) => f.n.y > 0.5);
        if (qTop === undefined) throw new Error("no top face");
        const outer = qTop.points.reduce((m, v) => (Vec3.dot(v, out) > Vec3.dot(m, out) ? v : m));
        expect(above(p, outer)).toBeLessThan(-G.seamBuryM + 1e-9);
      }
      // The bank's own sharp toe lies ≥ seamBuryM under the fillet (no exposed kink).
      const sharpToe = Vec3.scale(out, half + run);
      // (The surface there is the highest of the chords that reach over it.)
      const depths = fillet
        .filter((p) => {
          const along = p.verticesM.map((v) => Vec3.dot(v, out));
          return Math.min(...along) <= half + run && Math.max(...along) >= half + run;
        })
        .map((p) => above(topPlane(p), sharpToe));
      expect(Math.min(...depths)).toBeLessThan(-G.seamBuryM);
    }
  });

  it("the ledge side has a 45° chamfer in the edge tone along its top edge", () => {
    const chamfer = normals.filter((f) => f.tone === "edge");
    expect(chamfer).toHaveLength(1);
    const n = chamfer[0]?.n ?? Vec3.ZERO;
    expect(n.y).toBeCloseTo(Math.SQRT1_2, 9);
    expect(n.z).toBeCloseTo(Math.SQRT1_2, 9);
  });

  it("carries a flat top rail and a down rail (a bar per straight run) on posts", () => {
    const bars = pieces.filter((p) => p.surface === "grindable");
    expect(bars).toHaveLength(3); // top rail + the down rail's flat part and run down
    const topBar = bars[0] as ConvexPiece;
    const tb = bounds(topBar.verticesM);
    expect(tb.max.y).toBeCloseTo(0.5 + 0.3, 9);
    expect(tb.max.x - tb.min.x).toBeCloseTo(3.4, 9);
    // The run down follows the bank and ends over its toe, 0.3 m above the ground.
    const down = barTop(bars[2] as ConvexPiece);
    expect(Math.acos(down.normal.y)).toBeCloseTo(a, 9);
    expect(down.normal.x).toBeGreaterThan(0);
    expect(above(down, Vec3.create(2.5 + run, 0.3, 0.6))).toBeCloseTo(0, 9);
    expect(pieces.filter((p) => p.surface === "ground")).toHaveLength(4); // 2 posts × 2 rails
  });

  it("hip: two banks meeting at a rounded ridge; walls on the other sides", () => {
    const hip = shapeGeometry("ramp", HIP).pieces;
    const hipA = degToRad(22);
    expect(hip).toHaveLength(1 + 2 * Math.ceil(hipA / G.maxSegmentAngleRad - 1e-9));
    const piece = hip[0] as ConvexPiece;
    const faces = faceNormals(piece);
    const straight = faces.filter((f) => Math.abs(Math.acos(f.n.y) - hipA) < 1e-9);
    expect(straight).toHaveLength(2);
    expect(Vec3.dot(straight[0]?.n ?? Vec3.ZERO, straight[1]?.n ?? Vec3.ZERO)).toBeLessThan(0.9);
    // The ridge: facets facing out along the diagonal (−X and −Z at once), each turning
    // at most `maxSegmentAngleRad` from the next.
    const ridge = faces.filter((f) => f.n.x < -0.05 && f.n.z < -0.05 && f.n.y < 0.9999);
    expect(ridge.length).toBeGreaterThanOrEqual(3);
    const b = bounds(piece.verticesM);
    expect(b.max.x).toBeCloseTo(1, 9);
    expect(b.max.z).toBeCloseTo(1, 9);
    expect(b.max.y).toBeCloseTo(0.7, 9);
  });
});

describe("kinked rail", () => {
  const { pieces } = shapeGeometry("grindable", KINKED);
  const line = kinkedRailTopLine(KINKED);

  it("is flat → down → flat: one grindable bar per run, its top on the line", () => {
    const bars = pieces.filter((p) => p.surface === "grindable");
    expect(bars).toHaveLength(3);
    expect(line).toHaveLength(4);
    expect(line[0]?.[1]).toBeCloseTo(0.8, 9);
    expect(line[3]?.[1]).toBeCloseTo(0.35, 9);
    bars.forEach((bar, i) => {
      const plane = barTop(bar);
      // Both ends of the run lie on its top face, so the bars meet at the kinks.
      expect(above(plane, at2(line[i]))).toBeCloseTo(0, 9);
      expect(above(plane, at2(line[i + 1]))).toBeCloseTo(0, 9);
      expect(bar.faces.every((f) => f.tone === "metal")).toBe(true);
    });
    const down = barTop(bars[1] as ConvexPiece).normal;
    expect(down.x).toBeGreaterThan(0); // it runs down toward +X
    expect(Math.acos(down.y)).toBeCloseTo(Math.atan2(0.45, 0.99), 9);
  });

  it("stands on four posts: one near each end, one under each kink", () => {
    const posts = pieces.filter((p) => p.surface === "ground");
    expect(posts).toHaveLength(4);
    for (const post of posts) expect(bounds(post.verticesM).min.y).toBe(0);
  });
});

describe("bank to ledge", () => {
  const { pieces } = shapeGeometry("ramp", BANK_LEDGE);
  const run = bankLedgeRunM(BANK_LEDGE);

  it("a 25° bank up to the ledge's face; the ledge top 0.3 m above the bank's top", () => {
    const bank = pieces.find((p) => p.surface === "ramp");
    const ledge = pieces.find((p) => p.surface === "ledge");
    if (bank === undefined || ledge === undefined) throw new Error("pieces");
    const plane = topPlane(bank);
    expect(Math.acos(plane.normal.y)).toBeCloseTo(degToRad(25), 9);
    expect(above(plane, Vec3.ZERO)).toBeCloseTo(0, 9);
    expect(above(plane, Vec3.create(run, 0.6, 0))).toBeCloseTo(0, 9);
    // The toe is buried under the ground and the top edge inside the ledge block.
    const bb = bounds(bank.verticesM);
    expect(bb.min.y).toBeLessThan(-G.seamBuryM + 1e-9);
    expect(bb.max.x).toBeGreaterThan(run);
    expect(bb.max.x).toBeLessThan(run + 0.6);
    const lb = bounds(ledge.verticesM);
    expect(lb.max.y).toBeCloseTo(0.9, 9);
    expect(lb.min.x).toBeCloseTo(run, 9);
    expect(lb.max.x - lb.min.x).toBeCloseTo(0.6, 9);
    expect(ledge.faces.filter((f) => f.tone === "edge")).toHaveLength(2);
  });
});

describe("stairs with a hubba on each side and a handrail down the middle", () => {
  const { pieces } = shapeGeometry("ground", STAIRS_BOTH);

  it("mirrors the hubba to −Z and centres the handrail", () => {
    const hubbas = pieces.filter((p) => p.surface === "ledge");
    expect(hubbas).toHaveLength(2);
    const hb = hubbas.map((p) => bounds(p.verticesM));
    expect(hb.some((b) => b.min.z >= 2 - 1e-9)).toBe(true);
    expect(hb.some((b) => b.max.z <= -2 + 1e-9)).toBe(true);
    const grind = pieces.filter((p) => p.surface === "grindable");
    expect(grind).toHaveLength(5); // 2 × (flat + sloped steel edge) + the handrail
    const rail = grind.find((p) => Math.abs(bounds(p.verticesM).max.z) < 0.1);
    expect(rail).toBeDefined();
    expect(stairsHeightM(STAIRS_BOTH)).toBeCloseTo(1.05, 9);
  });
});

describe("validation", () => {
  it("rejects bad parameters in the factories", () => {
    expect(() => ObstacleShape.quarterPipe({ ...QP, heightM: 3 })).toThrow(/radiusM/);
    expect(() => ObstacleShape.quarterPipe({ ...QP, radiusM: -1 })).toThrow(/radiusM/);
    expect(() => ObstacleShape.bank({ ...BANK, angleRad: degToRad(95) })).toThrow(/angle/);
    expect(() => ObstacleShape.kicker({ ...KICKER, heightM: 2 })).toThrow(/heightM/);
    expect(() => ObstacleShape.ledge({ ...LEDGE, edgeChamferM: 0.3 })).toThrow(/edgeChamfer/);
    expect(() => ObstacleShape.rail({ ...RAIL, barRadiusM: 0.2 })).toThrow(/bar/);
    expect(() => ObstacleShape.stairs({ ...STAIRS, stepCount: 2.5 })).toThrow(/stepCount/);
    expect(() => ObstacleShape.box({ halfExtentsM: Vec3.create(1, 0, 1) })).toThrow(/halfExtents/);
    expect(() => ObstacleShape.funbox({ ...FUNBOX, bankAngleRad: degToRad(90) })).toThrow(/bank/);
    expect(() =>
      ObstacleShape.funbox({ ...FUNBOX, sides: { ...FUNBOX.sides, plusX: "wall" } }),
    ).toThrow(/bankRail.side/);
    expect(() =>
      ObstacleShape.funbox({
        ...FUNBOX,
        topRail: { zM: 0, lengthM: 9, heightM: 0.3, barRadiusM: 0.02 },
      }),
    ).toThrow(/topRail/);
    expect(() => ObstacleShape.kinkedRail({ ...KINKED, dropM: 1.2 })).toThrow(/steep/);
    expect(() => ObstacleShape.kinkedRail({ ...KINKED, flatTopM: 0 })).toThrow(/flatTopM/);
    expect(() => ObstacleShape.bankLedge({ ...BANK_LEDGE, edgeChamferM: 0.4 })).toThrow(/edge/);
  });
});

describe("obstacleCollider", () => {
  const at = Transform.create(Vec3.create(3, 0, 1), { x: 0, y: 0, z: 0, w: 1 });
  it("keeps a box a box and turns everything else into one convex part per piece", () => {
    const box: Obstacle = {
      id: "g",
      name: "g",
      surface: "ground",
      transform: at,
      shape: ObstacleShape.box({ halfExtentsM: Vec3.create(1, 1, 1) }),
    };
    expect(obstacleCollider(box).shape.kind).toBe("box");
    const qp: Obstacle = { id: "qp", name: "qp", surface: "ramp", transform: at, shape: QP };
    const collider = obstacleCollider(qp);
    const pieces = shapeGeometry("ramp", QP).pieces;
    if (collider.shape.kind !== "compound") throw new Error("expected compound");
    expect(collider.shape.parts).toHaveLength(pieces.length);
    collider.shape.parts.forEach((part, i) => {
      expect(part.surface).toBe(pieces[i]?.surface);
      expect(part.pointsM).toEqual(pieces[i]?.verticesM);
    });
    expect(collider.transform).toBe(at);
  });
});

describe("skatepark level", () => {
  const level = createSkateparkLevel();
  const park = WORLD_CONFIG.park;

  function worldBounds(o: Obstacle): Box3 {
    const pts = shapeGeometry(o.surface, o.shape).pieces.flatMap((p) =>
      p.verticesM.map((v) => Transform.toWorldPoint(o.transform, v)),
    );
    return bounds(pts);
  }

  it("has every kind of obstacle", () => {
    const kinds = new Set(level.obstacles.map((o) => o.shape.kind));
    for (const kind of ["box", "quarterPipe", "bank", "kicker", "ledge", "rail", "stairs"]) {
      expect(kinds.has(kind as Shape["kind"])).toBe(true);
    }
    expect(level.obstacles.filter((o) => o.shape.kind === "quarterPipe")).toHaveLength(2);
  });

  it("spawns on the stairs platform with at least 6 m of run-up", () => {
    const stairs = level.obstacles.find((o) => o.shape.kind === "stairs");
    if (stairs === undefined || stairs.shape.kind !== "stairs") throw new Error("no stairs");
    expect(level.spawn.positionM.y).toBeCloseTo(stairsHeightM(stairs.shape), 9);
    expect(stairs.transform.positionM.x - level.spawn.positionM.x).toBeGreaterThanOrEqual(6);
    expect(level.spawn.positionM.x).toBeGreaterThan(
      stairs.transform.positionM.x - park.stairs.topDepthM,
    );
  });

  it("a roll-up slope, part of the platform piece, leads from the ground to the platform", () => {
    const stairs = level.obstacles.find((o) => o.id === "stairs");
    if (stairs === undefined) throw new Error("no stairs");
    const platform = shapeGeometry(stairs.surface, stairs.shape).pieces[0];
    if (platform === undefined) throw new Error("no platform");
    const h = park.stairs.stepCount * park.stairs.riseM;
    const slope = platform.faces
      .map((f) => Vec3.normalize(newell(facePoints(platform, f.indices))))
      .find((n) => n.y > 0.01 && n.y < 0.999 && Math.abs(n.z) < 0.5);
    if (slope === undefined) throw new Error("no slope face");
    expect(Math.acos(slope.y)).toBeCloseTo(park.stairs.backSlopeRad, 9);
    const b = bounds(platform.verticesM);
    expect(b.max.y).toBeCloseTo(h, 9);
    expect(b.min.y).toBeLessThan(-G.seamBuryM + 1e-9); // toe buried under the ground
    expect(b.min.x).toBeLessThan(-park.stairs.topDepthM - h / Math.tan(park.stairs.backSlopeRad));
  });

  it("leaves at least 8 m of clear roll-away below the stairs", () => {
    const stairs = level.obstacles.find((o) => o.id === "stairs");
    if (stairs === undefined) throw new Error("no stairs");
    const foot = park.stairs.xM + (park.stairs.stepCount - 1) * park.stairs.runM;
    const half = park.stairs.widthM / 2 + 0.5;
    for (const o of level.obstacles) {
      if (o.id === "ground" || o.id === "stairs") continue;
      const b = worldBounds(o);
      const overlapsZ = b.max.z > park.stairs.zM - half && b.min.z < park.stairs.zM + half;
      const overlapsX = b.max.x > foot && b.min.x < foot + 8;
      expect(overlapsZ && overlapsX, `${o.id} blocks the roll-away`).toBe(false);
    }
  });

  it("the two quarter pipes face each other across the flat bottom", () => {
    const east = level.obstacles.find((o) => o.id === "qp-east");
    const west = level.obstacles.find((o) => o.id === "qp-west");
    if (east === undefined || west === undefined) throw new Error("no halfpipe");
    const intoEast = Transform.toWorldDirection(east.transform, Vec3.UNIT_X);
    const intoWest = Transform.toWorldDirection(west.transform, Vec3.UNIT_X);
    expect(Vec3.dot(intoEast, intoWest)).toBeCloseTo(-1, 9);
    expect(east.transform.positionM.x - west.transform.positionM.x).toBeCloseTo(
      park.halfpipe.flatBottomM,
      9,
    );
  });

  it("no two obstacles overlap (apart from standing on the ground)", () => {
    const boxes = level.obstacles
      .filter((o) => o.id !== "ground")
      .map((o) => ({ id: o.id, b: worldBounds(o) }));
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const c = boxes[j];
        if (a === undefined || c === undefined) continue;
        const overlap =
          a.b.max.x > c.b.min.x + 1e-6 &&
          c.b.max.x > a.b.min.x + 1e-6 &&
          a.b.max.z > c.b.min.z + 1e-6 &&
          c.b.max.z > a.b.min.z + 1e-6;
        expect(overlap, `${a.id} overlaps ${c.id}`).toBe(false);
      }
    }
  });
});
