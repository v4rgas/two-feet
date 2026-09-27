import { afterEach, describe, expect, it } from "vitest";
import type { BoardSnapshot } from "../../contexts/board";
import { BOARD_CONFIG, BoardSpec } from "../../contexts/board";
import { BoardHarness, STEP_S } from "../../contexts/board/infrastructure/board-harness";
import type { GrindEdge } from "../../contexts/world";
import { obstacleCollider, obstacleGrindEdges } from "../../contexts/world";
import { STREET_CONFIG } from "../../maps/street/street.config";
import { createStreetCourseLevel } from "../../maps/street/street-course";
import type { DomainEvent } from "../../shared";
import { Quat, Transform, Vec3 } from "../../shared";

/*
 * STREET COURSE, BOARD ONLY (real Rapier, no rider, the `?map=street` geometry — the
 * same convex pieces the renderer draws, ADR 0008). A board launched at 4–5 m/s must roll
 * over every bank and funbox transition without a bounce:
 * - never airborne on a transition (no `BoardLeftGround`): the rounded crests keep it on;
 * - four wheels down through every concave toe (the rounded fillets: no kink, no seam);
 * - no wild spin, and it rolls on afterwards.
 * It rolls off the euro-gap platform and lands, and a board dropped onto each run of the
 * kinked rail reports a `grindable` contact on that run.
 */

const LEVEL = createStreetCourseLevel();
const S = STREET_CONFIG;
const SPEC = BoardSpec.create(BOARD_CONFIG.spec);
const REST_M = BoardSpec.restHeightM(SPEC);

const harnesses: BoardHarness[] = [];
afterEach(() => {
  for (const h of harnesses.splice(0)) h.dispose();
});

function seconds(s: number): number {
  return Math.round(s / STEP_S);
}

/** The whole course (the harness brings its own ground), board at `spawn`. */
async function onCourse(spawn: Transform): Promise<{ h: BoardHarness; events: DomainEvent[] }> {
  const colliders = LEVEL.obstacles
    .filter((o) => o.id !== "ground")
    .map((o) => obstacleCollider(o));
  const h = await BoardHarness.create({ obstacles: colliders, spawn });
  harnesses.push(h);
  const events: DomainEvent[] = [];
  h.bus.subscribeAll((e) => events.push(e));
  return { h, events };
}

/** Board resting at ground point (x, y, z), nose toward `headingRad` (0 = +X, + turns to −Z). */
function at(x: number, y: number, z: number, headingRad = 0): Transform {
  return Transform.create(
    Vec3.create(x, y + REST_M, z),
    Quat.fromAxisAngle(Vec3.UNIT_Y, headingRad),
  );
}

function upDir(s: BoardSnapshot): Vec3 {
  return Transform.toWorldDirection(s.transform, Vec3.UNIT_Y);
}

interface Ride {
  readonly snaps: BoardSnapshot[];
  readonly events: DomainEvent[];
}

/** Settles, launches at `speedMps` along the nose, and records `durationS` of steps. */
async function ride(spawn: Transform, speedMps: number, durationS: number): Promise<Ride> {
  const { h, events } = await onCourse(spawn);
  h.run(seconds(0.2));
  const t = h.body.getTransform();
  h.body.resetTo(t, Transform.toWorldDirection(t, Vec3.create(speedMps, 0, 0)));
  events.length = 0;
  const snaps: BoardSnapshot[] = [];
  for (let i = 0; i < seconds(durationS); i += 1) {
    h.step();
    snaps.push(h.system.snapshot);
  }
  return { snaps, events };
}

function landings(r: Ride): Extract<DomainEvent, { type: "BoardLanded" }>[] {
  return r.events.filter(
    (e): e is Extract<DomainEvent, { type: "BoardLanded" }> => e.type === "BoardLanded",
  );
}

function takeoffs(r: Ride): DomainEvent[] {
  return r.events.filter((e) => e.type === "BoardLeftGround");
}

function maxSpin(snaps: readonly BoardSnapshot[]): number {
  return Math.max(0, ...snaps.map((s) => Vec3.length(s.angularVelocityRadps)));
}

function minWheels(snaps: readonly BoardSnapshot[]): number {
  return Math.min(4, ...snaps.map((s) => s.wheelsDown));
}

/** Steps whose board origin is (horizontally) within `radiusM` of the line x = x0 or z = z0. */
function near(r: Ride, axis: "x" | "z", at0: number, radiusM: number): BoardSnapshot[] {
  return r.snaps.filter((s) => Math.abs(s.transform.positionM[axis] - at0) <= radiusM);
}

function last(r: Ride): BoardSnapshot {
  const s = r.snaps[r.snaps.length - 1];
  if (s === undefined) throw new Error("no steps");
  return s;
}

/** Where a bank's sharp toe line would be: `run` out from its top edge at `edge`. */
function toeAt(edge: number, heightM: number, angleRad: number, sign: 1 | -1): number {
  return edge + sign * (heightM / Math.tan(angleRad));
}

const FB = S.funbox;
const FB_RUN_TOE = (edge: number, sign: 1 | -1): number =>
  toeAt(edge, FB.heightM, FB.bankAngleRad, sign);

/**
 * Airborne spells (takeoff → landing) of a ride, s. A convex crest may let the board's
 * wheels ease off the surface for a step or two (≤ 3 mm: the contact tolerance), which
 * the board reports as a takeoff; a bounce or a hop off a seam lasts much longer.
 */
function airSpells(r: Ride): number[] {
  return landings(r).map((e) => e.airtimeS);
}

/** Never airborne longer than a crest blip (MAX_BLIP_S). */
const MAX_BLIP_S = 0.03;

describe("street course transitions (board only)", () => {
  it("funbox at 4.5 m/s along X: up the −X bank, over the top, down the +X bank — no air, 4 wheels at both toes", async () => {
    // The lane between the flat rail (z = −0.7) and the down rail (z = +0.6).
    const r = await ride(at(FB.xM - 7.5, 0, 0), 4.5, 5);
    // No air: at most a crest blip (the wheels ease ≤ 3 mm off for a step or two).
    expect(Math.max(0, ...airSpells(r))).toBeLessThanOrEqual(MAX_BLIP_S);
    const westToe = FB_RUN_TOE(FB.xM - FB.topLengthM / 2, -1);
    const eastToe = FB_RUN_TOE(FB.xM + FB.topLengthM / 2, 1);
    expect(minWheels(near(r, "x", westToe, 0.6))).toBe(4);
    expect(minWheels(near(r, "x", eastToe, 0.6))).toBe(4);
    // Over the rounded crests at most one wheel pair eases off (≤ 3 mm), never both.
    expect(minWheels(r.snaps.filter((s) => s.grounded))).toBeGreaterThanOrEqual(2);
    expect(maxSpin(r.snaps)).toBeLessThan(4);
    expect(Math.max(...r.snaps.map((s) => s.transform.positionM.y))).toBeGreaterThan(
      FB.heightM + REST_M - 0.02,
    );
    const end = last(r);
    expect(end.transform.positionM.x).toBeGreaterThan(eastToe);
    expect(end.transform.positionM.y).toBeLessThan(REST_M + 0.01);
    expect(end.linearVelocityMps.x).toBeGreaterThan(3); // 4.5 in, ≈ 3.6 out
    expect(Math.abs(end.transform.positionM.z)).toBeLessThan(0.05);
    expect(end.wheelsDown).toBe(4);
  }, 20_000); // 5 s of simulation: slow on a loaded machine

  it("funbox at 4.5 m/s up the −Z bank: onto the top without a hop, then off the ledge side and lands", async () => {
    // From the gap between the long ledge (z = −4.75) and the bank's toe.
    const r = await ride(at(FB.xM - 0.5, 0, -4.4, -Math.PI / 2), 4.5, 2.6);
    const southToe = FB_RUN_TOE(FB.zM - FB.topWidthM / 2, -1);
    expect(minWheels(near(r, "z", southToe, 0.6))).toBe(4);
    const ledgeZ = FB.zM + FB.topWidthM / 2;
    const spells = airSpells(r);
    // The 0.5 m drop off the ledge side (+Z wall) is the only real air.
    expect(spells.filter((s) => s > MAX_BLIP_S)).toHaveLength(1);
    const before = r.snaps.filter((s) => s.transform.positionM.z < ledgeZ - 0.4);
    expect(minWheels(before.filter((s) => s.grounded))).toBeGreaterThanOrEqual(2);
    expect(maxSpin(before)).toBeLessThan(4);
    expect(Math.max(...spells)).toBeGreaterThan(0.15);
    const end = last(r);
    expect(end.transform.positionM.z).toBeGreaterThan(ledgeZ + 1);
    expect(upDir(end).y).toBeGreaterThan(0.99);
    expect(end.wheelsDown).toBe(4);
    expect(end.linearVelocityMps.z).toBeGreaterThan(1.5);
  });

  it("hip at 4.7 m/s: up its −X bank beside the ridge onto the top, never airborne until it drops off the back", async () => {
    const hip = S.hip;
    const topZ0 = hip.zM - hip.topWidthM / 2;
    // A lane 0.4 m inside the top's −Z edge, so the ridge's rounding is right beside it.
    // 4.7 m/s: slower, the riderless board leaves the back wall (0.7 m) at < 2 m/s and
    // tips nose-first onto its side.
    const r = await ride(at(hip.xM - 5, 0, topZ0 + 0.4), 4.7, 3.1);
    const backX = hip.xM + hip.topLengthM / 2;
    const up = r.snaps.filter((s) => s.transform.positionM.x < backX - 0.3);
    expect(up.every((s) => s.grounded)).toBe(true);
    const toe = hip.xM - hip.topLengthM / 2 - hip.heightM / Math.tan(hip.bankAngleRad);
    expect(minWheels(near(r, "x", toe, 0.6))).toBe(4);
    expect(minWheels(up)).toBeGreaterThanOrEqual(2);
    expect(maxSpin(up)).toBeLessThan(4);
    expect(Math.max(...up.map((s) => s.transform.positionM.y))).toBeGreaterThan(
      hip.heightM + REST_M - 0.02,
    );
    // Off the back wall (0.7 m): it lands and rolls on.
    const end = last(r);
    expect(end.transform.positionM.x).toBeGreaterThan(backX + 0.5);
    expect(end.transform.positionM.y).toBeLessThan(REST_M + 0.01);
    expect(end.wheelsDown).toBe(4);
  });

  it("bank-to-ledge: up the 25° bank at 3.3 m/s (just short of the ledge's face) and back down fakie, 4 wheels over the toe", async () => {
    // Straight at the ledge, 4–5 m/s would reach its face (0.6 m up): that one you pop.
    const bl = S.bankLedge;
    const r = await ride(at(bl.xM - 2.5, 0, bl.zM), 3.3, 2.4);
    expect(takeoffs(r)).toEqual([]);
    expect(minWheels(near(r, "x", bl.xM, 0.6))).toBe(4); // over the toe, both ways
    expect(minWheels(r.snaps)).toBeGreaterThanOrEqual(2); // (the stall: a pair eases off)
    const ys = r.snaps.map((s) => s.transform.positionM.y);
    expect(Math.max(...ys)).toBeGreaterThan(REST_M + 0.35);
    expect(Math.max(...ys)).toBeLessThan(REST_M + bl.bankHeightM);
    expect(maxSpin(r.snaps)).toBeLessThan(2);
    const end = last(r);
    expect(end.transform.positionM.x).toBeLessThan(bl.xM - 0.5); // back on the flat
    expect(end.linearVelocityMps.x).toBeLessThan(-2.5); // fakie, most of the speed back
    expect(end.wheelsDown).toBe(4);
  });

  it("euro gap at 5 m/s: rolls up the platform's slope and over its crest without a hop, drops 0.6 m and lands", async () => {
    const gap = S.gapPlatform;
    const r = await ride(at(gap.xM - gap.topDepthM - 4.5, 0, gap.zM), 5, 4);
    const onPlatform = r.snaps.filter((s) => s.transform.positionM.x < gap.xM - 0.2);
    const toeX = gap.xM - gap.topDepthM - gap.heightM / Math.tan(gap.backSlopeRad);
    expect(minWheels(near(r, "x", toeX, 0.6))).toBe(4);
    expect(minWheels(onPlatform)).toBeGreaterThanOrEqual(2); // over the crest
    expect(onPlatform.every((s) => s.grounded)).toBe(true);
    expect(maxSpin(onPlatform)).toBeLessThan(3);
    const [landed, ...more] = landings(r);
    if (landed === undefined) throw new Error("never landed");
    expect(more).toEqual([]); // one air: the drop
    expect(landed.airtimeS).toBeGreaterThan(0.25);
    const end = last(r);
    expect(end.transform.positionM.x).toBeGreaterThan(gap.xM + 1);
    expect(end.transform.positionM.y).toBeLessThan(REST_M + 0.01);
    expect(upDir(end).y).toBeGreaterThan(0.99);
    expect(end.wheelsDown).toBe(4);
    expect(end.linearVelocityMps.x).toBeGreaterThan(2);
    // No rider to level it: it lands tail-first and slaps flat, a brief spin, no explosion.
    expect(maxSpin(r.snaps)).toBeLessThan(30);
  });

  it("the 7-stair's roll-up at 5 m/s reaches the landing on four wheels all the way", async () => {
    const big = S.bigStairs;
    const r = await ride(at(big.xM - big.topDepthM - 7, 0, S.spawn.zM), 5, 3);
    expect(takeoffs(r)).toEqual([]);
    expect(minWheels(r.snaps)).toBe(4);
    const topY = big.stepCount * big.riseM;
    expect(Math.max(...r.snaps.map((s) => s.transform.positionM.y))).toBeGreaterThan(
      topY + REST_M - 0.01,
    );
    expect(maxSpin(r.snaps)).toBeLessThan(3);
  });

  it("the 3-stair's roll-up at 4.5 m/s: onto the landing without a hop", async () => {
    const small = S.smallStairs;
    const r = await ride(at(small.xM - small.topDepthM - 5, 0, small.zM), 4.5, 2);
    expect(takeoffs(r)).toEqual([]);
    const toeX =
      small.xM - small.topDepthM - (small.stepCount * small.riseM) / Math.tan(small.backSlopeRad);
    expect(minWheels(near(r, "x", toeX, 0.6))).toBe(4);
    expect(minWheels(r.snaps)).toBeGreaterThanOrEqual(2);
    expect(maxSpin(r.snaps)).toBeLessThan(3);
    const end = last(r);
    expect(end.transform.positionM.y).toBeGreaterThan(small.stepCount * small.riseM);
    expect(end.wheelsDown).toBe(4);
  });
});

describe("kinked rail (board only)", () => {
  const rail = LEVEL.obstacles.find((o) => o.id === "kinked-rail");
  if (rail === undefined) throw new Error("no kinked rail");
  const edges: GrindEdge[] = obstacleGrindEdges(rail);

  /** Distance from `p` to the segment of `edge`. */
  function toSegment(edge: GrindEdge, p: Vec3): number {
    const d = Vec3.sub(edge.endM, edge.startM);
    const t = Math.max(0, Math.min(1, Vec3.dot(Vec3.sub(p, edge.startM), d) / Vec3.lengthSq(d)));
    return Vec3.distance(p, Vec3.add(edge.startM, Vec3.scale(d, t)));
  }

  for (const [i, name] of ["top flat", "run down", "bottom flat"].entries()) {
    it(`a board dropped onto its ${name} along the bar reports a grindable contact on that run`, async () => {
      const edge = edges[i];
      if (edge === undefined) throw new Error("missing segment");
      const dir = Vec3.normalize(Vec3.sub(edge.endM, edge.startM));
      const pitch = Math.asin(dir.y);
      // Trucks above the middle of the run, the board lined up with it, 3 cm up.
      const mid = Vec3.scale(Vec3.add(edge.startM, edge.endM), 0.5);
      const axleBelowOriginM = SPEC.deck.thicknessM / 2 + SPEC.trucks.heightM;
      const spawn = Transform.create(
        Vec3.add(mid, Vec3.create(0, axleBelowOriginM + 0.03, 0)),
        Quat.fromAxisAngle(Vec3.UNIT_Z, pitch),
      );
      const { h, events } = await onCourse(spawn);
      h.body.resetTo(spawn, Vec3.scale(dir, 1.5));
      h.run(seconds(0.3));
      const hits = events.filter(
        (e): e is Extract<DomainEvent, { type: "SurfaceContactStarted" }> =>
          e.type === "SurfaceContactStarted" && e.surface === "grindable",
      );
      expect(hits.length).toBeGreaterThan(0);
      const first = hits[0];
      if (first === undefined) throw new Error("no grind contact");
      expect(first.obstacleId).toBe("kinked-rail");
      expect(["noseTruck", "tailTruck", "deck"]).toContain(first.part);
      // The contact is on this run: nearer its segment than the others.
      const own = toSegment(edge, first.pointWorldM);
      for (const other of edges) {
        if (other !== edge) expect(own).toBeLessThanOrEqual(toSegment(other, first.pointWorldM));
      }
      expect(own).toBeLessThan(0.08);
    });
  }
});
