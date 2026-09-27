import type { GrindExit, GrindKind, GrindSide, Kick } from "../../../shared";
import { Quat, Transform, Vec3 } from "../../../shared";
import type { AssistTuning, RiderConfig } from "../rider.config";
import { boardForward, boardUp } from "./board-geometry";
import type { FootForce } from "./foot-force";
import type {
  BoardKinematics,
  BoardMassProperties,
  DeckGeometry,
  GrindEdgeView,
  GrindReport,
} from "./foot-force-model";

/*
 * GRINDS AND SLIDES (MECHANICS.md M4, ADR 0009). A domain service the trick controller
 * runs while the board is in the air: it LOCKS the board onto a grind edge when a part
 * comes close enough in a stance that fits, then HOLDS it there with two assists applied
 * through the physics port — a PD that keeps the locked point on the edge line (square
 * to the edge only: it never pulls along it) and a PD that holds the stance's attitude —
 * plus friction along the edge and the balance. Gravity along a sloped edge is left
 * alone, so the hubba and the handrail keep you going. There is no thrust.
 */

/** Where the rider started this air (for frontside / backside). */
export interface AirStart {
  readonly positionM: Vec3;
  readonly headingRad: number;
}

/** Everything `tryLock` needs this step. */
export interface LockContext {
  readonly board: BoardKinematics;
  readonly edges: readonly GrindEdgeView[];
  /** The back foot is on the tail (↓ in regular) / the front foot on the nose (W). */
  readonly tailHeld: boolean;
  readonly noseHeld: boolean;
  /** +1 when the board's nose (+X) points to the rider's front, else −1. */
  readonly facing: 1 | -1;
  /** +1 regular (toe side = rider +Z), −1 goofy. */
  readonly toe: 1 | -1;
  readonly airStart: AirStart | null;
  /** The active assist level's tunables (angle bands, lip catch). Absent: none. */
  readonly assist?: AssistTuning;
}

/** Everything `hold` needs this step. */
export interface HoldContext {
  readonly board: BoardKinematics;
  readonly mass: BoardMassProperties;
  readonly edges: readonly GrindEdgeView[];
  readonly dtS: number;
  /** Both feet leaning the same way, in [−1, 1], + = toward the toe side. */
  readonly leanToe: number;
  /** The rider frame's +Z side (horizontal unit) and the toe sign. */
  readonly riderSide: Vec3;
  readonly toe: 1 | -1;
  /** The active assist level's tunables (balance ease). Absent: none. */
  readonly assist?: AssistTuning;
}

/** An edge with its frame: along u (unit), up m (square to u, as upright as possible). */
interface EdgeFrame {
  readonly edge: GrindEdgeView;
  readonly u: Vec3;
  readonly m: Vec3;
  readonly lengthM: number;
}

interface Lock {
  frame: EdgeFrame;
  kind: GrindKind;
  readonly side: GrindSide;
  /** +1 when the board's nose points to the rider's front at the lock, else −1. */
  readonly facing: 1 | -1;
  /** The locked point in the board frame. */
  pointLocal: Vec3;
  /** Target line = edge line + this (world). */
  offset: Vec3;
  /** Direction a pop out leaves to (horizontal unit). */
  outward: Vec3;
  sinceS: number;
  /**
   * Locked while still finishing a flip (FLIP-IN CATCH): the stance PD is capped like the
   * catch until the board is upright on the edge.
   */
  flipIn: boolean;
  balance: number;
  rateRadps: number;
  rng: number;
}

const GRIND_KINDS: readonly GrindKind[] = ["fiftyFifty", "fiveO", "noseGrind"];

export function isSlide(kind: GrindKind): boolean {
  return !GRIND_KINDS.includes(kind);
}

function edgeFrame(edge: GrindEdgeView): EdgeFrame | null {
  const d = Vec3.sub(edge.endM, edge.startM);
  const lengthM = Vec3.length(d);
  if (lengthM < 1e-6) return null;
  const u = Vec3.scale(d, 1 / lengthM);
  if (Math.abs(u.y) > 0.9) return null;
  const m = Vec3.normalize(Vec3.sub(Vec3.UNIT_Y, Vec3.scale(u, u.y)));
  return { edge, u, m, lengthM };
}

/** Removes the component of `v` along unit `u`. */
function across(v: Vec3, u: Vec3): Vec3 {
  return Vec3.sub(v, Vec3.scale(u, Vec3.dot(v, u)));
}

function horizontal(v: Vec3): Vec3 {
  return Vec3.create(v.x, 0, v.z);
}

/** Quaternion of the rotation whose columns are the unit axes x, y, z (right-handed). */
function quatFromBasis(x: Vec3, y: Vec3, z: Vec3): Quat {
  const trace = x.x + y.y + z.z;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    return Quat.create((y.z - z.y) * s, (z.x - x.z) * s, (x.y - y.x) * s, 0.25 / s);
  }
  if (x.x > y.y && x.x > z.z) {
    const s = 2 * Math.sqrt(1 + x.x - y.y - z.z);
    return Quat.create(0.25 * s, (y.x + x.y) / s, (z.x + x.z) / s, (y.z - z.y) / s);
  }
  if (y.y > z.z) {
    const s = 2 * Math.sqrt(1 + y.y - x.x - z.z);
    return Quat.create((y.x + x.y) / s, 0.25 * s, (z.y + y.z) / s, (z.x - x.z) / s);
  }
  const s = 2 * Math.sqrt(1 + z.z - x.x - y.y);
  return Quat.create((z.x + x.z) / s, (z.y + y.z) / s, 0.25 * s, (x.y - y.x) / s);
}

/** Rotates `v` about unit `axis` by `angle`. */
function rotateAbout(v: Vec3, axis: Vec3, angle: number): Vec3 {
  return Quat.rotate(Quat.fromAxisAngle(axis, angle), v);
}

/** Deterministic PRNG step (mulberry32): returns [value in [0, 1), next state]. */
function random(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) | 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

/** Standard normal sample (Box–Muller) and the next PRNG state. */
function gaussian(state: number): [number, number] {
  const [a, s1] = random(state);
  const [b, s2] = random(s1);
  return [Math.sqrt(-2 * Math.log(Math.max(1e-12, a))) * Math.cos(2 * Math.PI * b), s2];
}

export class GrindController {
  private lock: Lock | null = null;
  private cooldownS = 0;
  /** Counts locks, mixed into the balance's seed so each grind drifts differently. */
  private locks = 0;

  constructor(
    private readonly deck: DeckGeometry,
    private readonly config: RiderConfig,
  ) {}

  get locked(): boolean {
    return this.lock !== null;
  }

  get report(): GrindReport | null {
    const l = this.lock;
    if (l === null) return null;
    return {
      kind: l.kind,
      side: l.side,
      obstacleId: l.frame.edge.obstacleId,
      surface: l.frame.edge.surface,
      balance: Math.max(-1, Math.min(1, l.balance)),
      slide: isSlide(l.kind),
    };
  }

  /** The direction a pop out leaves to (horizontal unit), or null when not locked. */
  get outward(): Vec3 | null {
    return this.lock?.outward ?? null;
  }

  reset(): void {
    this.lock = null;
    this.cooldownS = 0;
  }

  /** Ends the lock (a pop out, or the rider bailed). */
  release(): void {
    if (this.lock !== null) this.cooldownS = this.config.grind.relockCooldownS;
    this.lock = null;
  }

  tick(dtS: number): void {
    this.cooldownS = Math.max(0, this.cooldownS - dtS);
  }

  // ── lock-on ───────────────────────────────────────────────────────────────

  /**
   * LOCK-ON: the nearest edge that a board part comes within `lockDistanceM` of, moving
   * toward it, with the board upright and lined up with it — along (a grind) or across
   * (a slide) — picks the stance from the keys held (MECHANICS.md table). True if locked.
   */
  tryLock(ctx: LockContext): boolean {
    if (this.lock !== null || this.cooldownS > 0) return this.lock !== null;
    const g = this.config.grind;
    const board = ctx.board;
    const f = boardForward(board);
    const up = boardUp(board);
    let best: { lock: Lock; distanceM: number } | null = null;
    for (const edge of ctx.edges) {
      const frame = edgeFrame(edge);
      if (frame === null) continue;
      const { u, m } = frame;
      // FLIP-IN CATCH (assists): a board still finishing its flip, slow enough to grab.
      const tilt = Math.acos(Math.max(-1, Math.min(1, Vec3.dot(up, m))));
      const flipIn = tilt > g.lockMaxTiltRad;
      if (flipIn) {
        const grace = ctx.assist?.lockTiltWidenRad ?? 0;
        const omega = Vec3.length(board.angularVelocityRadps);
        if (tilt > g.lockMaxTiltRad + grace || omega >= this.config.tricks.catchMaxOmegaRadps) {
          continue;
        }
      }
      const fp = across(f, m);
      if (Vec3.length(fp) < 0.3) continue;
      const angle = Math.acos(Math.min(1, Math.abs(Vec3.dot(Vec3.normalize(fp), u))));
      // ANGLE BANDS (assists) widen the stances' tolerances.
      const parallel = angle <= g.parallelToleranceRad + (ctx.assist?.parallelWidenRad ?? 0);
      const perpendicular =
        !parallel && angle >= Math.PI / 2 - g.perpToleranceRad - (ctx.assist?.perpWidenRad ?? 0);
      if (!parallel && !perpendicular) continue;
      const press = ctx.tailHeld === ctx.noseHeld ? null : ctx.tailHeld ? "tail" : "nose";
      const kind: GrindKind = parallel
        ? press === "tail"
          ? "fiveO"
          : press === "nose"
            ? "noseGrind"
            : "fiftyFifty"
        : press === "tail"
          ? "tailslide"
          : press === "nose"
            ? "noseslide"
            : "boardslide";
      const pointLocal = this.partPoint(kind, board, frame, ctx.facing);
      if (pointLocal === null) continue;
      const p = Transform.toWorldPoint(board.transform, pointLocal);
      const s = Vec3.dot(Vec3.sub(p, edge.startM), u);
      if ((s < 0 || s > frame.lengthM) && !this.entering(kind, frame, board, p, s)) continue;
      const toPoint = Vec3.sub(p, Vec3.add(edge.startM, Vec3.scale(u, s)));
      let distanceM = Vec3.length(toPoint);
      // Across a top surface the inner truck's wheels reach it first: they reach down
      // this much further than the deck (a boardslide on a ledge).
      const reach =
        g.lockDistanceM +
        (kind === "boardslide" && !edge.twoSided
          ? this.deck.trucks.heightM + this.deck.wheels.radiusM
          : 0);
      const vp = pointVelocity(board, p);
      const belowM = -Vec3.dot(toPoint, m);
      // LIP CATCH (assists): a part a hair below the edge top, still rising or level,
      // square to the edge within reach, is lifted onto it instead of clipping its side.
      const lip = ctx.assist?.lipCatchBelowM ?? 0;
      const lipCatch =
        lip > 0 &&
        belowM > 0 &&
        belowM <= g.lockBelowM + lip &&
        Vec3.dot(vp, m) >= -this.config.assist.lipCatchLevelMps &&
        Vec3.length(Vec3.sub(toPoint, Vec3.scale(m, -belowM))) <= reach;
      if (lipCatch) distanceM = Vec3.length(Vec3.sub(toPoint, Vec3.scale(m, -belowM)));
      else {
        if (distanceM > reach || belowM > g.lockBelowM) continue;
        if (Vec3.dot(vp, toPoint) >= 0 && distanceM > g.lockDistanceM / 4) continue;
      }
      if (best !== null && best.distanceM <= distanceM) continue;
      const lock = this.makeLock(kind, frame, pointLocal, p, ctx);
      lock.flipIn = flipIn;
      best = { lock, distanceM };
    }
    if (best === null) return false;
    this.lock = best.lock;
    this.locks += 1;
    return true;
  }

  /**
   * ENTRY (one-sided edges: ledges, hubbas, coping). A grind that comes in over an edge's
   * start (or over its end, going the other way) locks and holds before its locked point
   * is over the edge: from when its leading truck's wheel is within the wheel radius plus
   * `entryLeadS` of travel of the end face. Until then the lock holds the edge line
   * extended back, so it lifts a board that pops a hair low onto the top (the lip catch)
   * before a wheel meets the end face, instead of the trucks stopping dead against it.
   * True while `p` (the locked point, `s` along the edge) is in that entry zone and the
   * board moves into the edge.
   */
  private entering(
    kind: GrindKind,
    frame: EdgeFrame,
    board: BoardKinematics,
    p: Vec3,
    s: number,
  ): boolean {
    if (frame.edge.twoSided || isSlide(kind)) return false;
    const vAlong = Vec3.dot(board.linearVelocityMps, frame.u);
    const dir = s < 0 ? 1 : -1; // the way into the edge
    if (vAlong * dir <= 0) return false;
    const { trucks, wheels } = this.deck;
    let lead = 0;
    for (const x of [-trucks.wheelbaseM / 2, trucks.wheelbaseM / 2]) {
      const truck = Transform.toWorldPoint(board.transform, Vec3.create(x, 0, 0));
      lead = Math.max(lead, dir * Vec3.dot(Vec3.sub(truck, p), frame.u));
    }
    const allowanceM = lead + wheels.radiusM + Math.abs(vAlong) * this.config.grind.entryLeadS;
    const outsideM = s < 0 ? -s : s - frame.lengthM;
    return outsideM <= allowanceM;
  }

  /**
   * ENTRY LIFT: while the trailing truck's inner wheel has not yet passed an entry end face
   * (the start, or the end coming the other way) of a one-sided edge, the lock holds the
   * board this much higher, m, so that wheel clears the top too, not only the locked point
   * (a board still pitched nose-up from the ollie carries its tail wheel lower). 0 elsewhere.
   */
  private entryLiftM(lock: Lock, board: BoardKinematics, p: Vec3): number {
    const { frame } = lock;
    if (frame.edge.twoSided || isSlide(lock.kind)) return 0;
    const vAlong = Vec3.dot(board.linearVelocityMps, frame.u);
    if (vAlong === 0) return 0;
    const dir = vAlong > 0 ? 1 : -1;
    const { trucks, wheels } = this.deck;
    let trail: Vec3 | null = null;
    let trailAlong = Number.POSITIVE_INFINITY;
    for (const x of [-trucks.wheelbaseM / 2, trucks.wheelbaseM / 2]) {
      const wheel = Transform.toWorldPoint(
        board.transform,
        Vec3.create(x, lock.pointLocal.y, lock.pointLocal.z),
      );
      const along = dir * Vec3.dot(Vec3.sub(wheel, p), frame.u);
      if (along < trailAlong) {
        trailAlong = along;
        trail = wheel;
      }
    }
    if (trail === null) return 0;
    const sTrail = Vec3.dot(Vec3.sub(trail, frame.edge.startM), frame.u);
    const before = dir > 0 ? sTrail < wheels.radiusM : sTrail > frame.lengthM - wheels.radiusM;
    if (!before) return 0;
    return Math.max(0, Vec3.dot(Vec3.sub(p, trail), frame.m));
  }

  /**
   * The board point a stance locks with, in the board frame, or null when that part is
   * not near the edge: the trucks' hangers (midway for a 50-50) for a grind; for a slide,
   * where the edge crosses under the deck, within the deck middle / tail / nose.
   */
  private partPoint(
    kind: GrindKind,
    board: BoardKinematics,
    frame: EdgeFrame,
    facing: 1 | -1,
  ): Vec3 | null {
    const { deck, trucks } = this.deck;
    const g = this.config.grind;
    const halfT = deck.thicknessM / 2;
    const tailX = -facing * (trucks.wheelbaseM / 2);
    if (!isSlide(kind)) {
      const x = kind === "fiftyFifty" ? 0 : kind === "fiveO" ? tailX : -tailX;
      const hangerY = -(halfT + trucks.heightM) - g.hangerBelowAxleM;
      return Vec3.create(x, hangerY, 0);
    }
    // Where the edge line passes closest to the deck's long axis (board frame).
    const s = Transform.toLocalPoint(board.transform, frame.edge.startM);
    const d = Transform.toLocalDirection(board.transform, frame.u);
    // Board axis: (x, 0, 0); edge: s + d·t. Minimise |(x,0,0) − s − d·t|.
    const denom = 1 - d.x * d.x;
    if (denom < 1e-6) return null;
    const t = (d.x * s.x - Vec3.dot(s, d)) / denom;
    const crossX = s.x + d.x * t;
    const halfL = deck.lengthM / 2;
    let lo: number;
    let hi: number;
    if (kind === "boardslide") {
      lo = -g.boardslideHalfM;
      hi = g.boardslideHalfM;
    } else {
      const end = kind === "tailslide" ? -facing : facing;
      lo = end > 0 ? g.kickPartFromM : -halfL;
      hi = end > 0 ? halfL : -g.kickPartFromM;
    }
    const x = Math.max(lo, Math.min(hi, crossX));
    return Vec3.create(x, this.bottomY(x), 0);
  }

  /** Deck underside height at `x` (board frame), following the kicks. */
  private bottomY(x: number): number {
    const { deck } = this.deck;
    const halfFlat = (deck.lengthM - 2 * deck.kickLengthM * Math.cos(deck.kickAngleRad)) / 2;
    return -deck.thicknessM / 2 + Math.max(0, Math.abs(x) - halfFlat) * Math.tan(deck.kickAngleRad);
  }

  private makeLock(
    kind: GrindKind,
    frame: EdgeFrame,
    pointLocal: Vec3,
    pointWorld: Vec3,
    ctx: LockContext,
  ): Lock {
    const { edge } = frame;
    const board = ctx.board;
    // Which side the board came from: where it took off, else where it is heading from.
    const closest = Vec3.add(
      edge.startM,
      Vec3.scale(frame.u, Vec3.dot(Vec3.sub(pointWorld, edge.startM), frame.u)),
    );
    let from = Vec3.ZERO;
    if (ctx.airStart !== null) {
      const a = ctx.airStart.positionM;
      const onLine = Vec3.add(
        edge.startM,
        Vec3.scale(frame.u, Vec3.dot(Vec3.sub(a, edge.startM), frame.u)),
      );
      from = horizontal(across(Vec3.sub(a, onLine), frame.u));
    }
    if (Vec3.length(from) < 0.03) {
      from = Vec3.scale(horizontal(across(board.linearVelocityMps, frame.u)), -1);
    }
    const heading = ctx.airStart?.headingRad ?? 0;
    const riderSide = Quat.rotate(Quat.fromAxisAngle(Vec3.UNIT_Y, heading), Vec3.UNIT_Z);
    // Toes toward the edge = frontside: the edge lies opposite to `from`.
    const side: GrindSide =
      Vec3.dot(Vec3.scale(from, -1), Vec3.scale(riderSide, ctx.toe)) > 0 ? "frontside" : "backside";
    const n = edge.outwardNormal;
    let outward = n;
    if (edge.twoSided) {
      const com = horizontal(across(Vec3.sub(board.transform.positionM, closest), frame.u));
      const ref = Vec3.length(com) > 0.01 ? com : from;
      outward = Vec3.dot(ref, n) < 0 ? Vec3.scale(n, -1) : n;
    }
    const lock: Lock = {
      frame,
      kind,
      side,
      facing: ctx.facing,
      pointLocal,
      offset: Vec3.ZERO,
      outward,
      sinceS: 0,
      flipIn: false,
      balance: 0,
      rateRadps: 0,
      rng: (this.config.grind.balanceSeed + this.locks * 7919) | 0,
    };
    this.fitToEdge(lock, board);
    return lock;
  }

  /**
   * On a one-sided edge (ledge, hubba, coping) a grind rides with the inner wheels on
   * the top, clear of the edge, and the trucks over it: the locked point becomes the inner
   * wheels' bottom, set in from the edge. Elsewhere the locked point hovers on the edge.
   */
  private fitToEdge(lock: Lock, board: BoardKinematics): void {
    const g = this.config.grind;
    const { edge, m } = lock.frame;
    const hover = Vec3.scale(m, g.hoverM);
    if (edge.twoSided || isSlide(lock.kind)) {
      lock.offset = hover;
      return;
    }
    const { deck, trucks, wheels } = this.deck;
    const inward = Vec3.scale(edge.outwardNormal, -1);
    const boardZ = Transform.toWorldDirection(board.transform, Vec3.UNIT_Z);
    const zSign = Math.sign(Vec3.dot(boardZ, inward)) || 1;
    const wheelBottomY = -(deck.thicknessM / 2 + trucks.heightM) - wheels.radiusM;
    lock.pointLocal = Vec3.create(lock.pointLocal.x, wheelBottomY, (zSign * trucks.axleTrackM) / 2);
    const inset = edge.halfWidthM + wheels.widthM / 2 + g.wheelClearM;
    lock.offset = Vec3.add(hover, Vec3.scale(inward, inset));
  }

  /**
   * STANCE-KEY GRACE (assists): ↓ / W pressed just after the lock-in. A 50-50 becomes a
   * 5-0 / nosegrind, a boardslide a tailslide / noseslide, if that part is on the edge.
   */
  press(kick: Kick, board: BoardKinematics): void {
    const lock = this.lock;
    if (lock === null) return;
    const kind: GrindKind | null =
      lock.kind === "fiftyFifty"
        ? kick === "tail"
          ? "fiveO"
          : "noseGrind"
        : lock.kind === "boardslide"
          ? kick === "tail"
            ? "tailslide"
            : "noseslide"
          : null;
    if (kind === null) return;
    const pointLocal = this.partPoint(kind, board, lock.frame, lock.facing);
    if (pointLocal === null) return;
    lock.kind = kind;
    lock.pointLocal = pointLocal;
    this.fitToEdge(lock, board);
  }

  // ── while locked ──────────────────────────────────────────────────────────

  /**
   * One locked step: the lock PD, friction, the stance PD and the balance. Returns how the
   * lock ended this step (`rollOff`: past the end of the edge with no edge to continue on;
   * `fellOff`: |balance| > 1), or null while it holds.
   */
  hold(ctx: HoldContext, out: FootForce[]): GrindExit | null {
    const lock = this.lock;
    if (lock === null) return null;
    const g = this.config.grind;
    const { board, mass, dtS } = ctx;
    lock.sinceS += dtS;

    let p = Transform.toWorldPoint(board.transform, lock.pointLocal);
    let s = Vec3.dot(Vec3.sub(p, lock.frame.edge.startM), lock.frame.u);
    const outside = s < 0 || s > lock.frame.lengthM;
    if (outside && !this.entering(lock.kind, lock.frame, board, p, s)) {
      if (this.continueOnto(lock, p, ctx)) {
        p = Transform.toWorldPoint(board.transform, lock.pointLocal);
        s = Vec3.dot(Vec3.sub(p, lock.frame.edge.startM), lock.frame.u);
      } else {
        this.release();
        return "rollOff";
      }
    }
    // The line the lock holds: the edge, or across a joint the chord under the trucks.
    const support = this.supportLine(lock, board, ctx.edges);
    const { u, m } = support;
    const vAlong = Vec3.dot(board.linearVelocityMps, u);

    // BALANCE.
    const slope = Math.abs(u.y);
    // BALANCE EASE (assists): a calmer drift for the first moments on the edge.
    const easeS = Math.min(ctx.assist?.balanceEaseS ?? 0, this.config.assist.balanceEaseMaxS);
    const ease = lock.sinceS <= easeS ? 1 - (ctx.assist?.balanceDriftCut ?? 0) : 1;
    const scale =
      ease *
      g.balanceDriftPerS *
      (1 + g.balanceSlopeFactor * slope) *
      (1 + g.balanceSpeedFactor * Math.abs(vAlong)) *
      2 ** (lock.sinceS / g.balanceHardenS);
    const [noise, next] = gaussian(lock.rng);
    lock.rng = next;
    lock.rateRadps +=
      -g.balanceRateDecayPerS * lock.rateRadps * dtS + scale * Math.sqrt(dtS) * noise;
    lock.balance +=
      (lock.rateRadps +
        g.balanceInstabilityPerS * lock.balance +
        g.balanceAssist * g.balanceLeanRatePerS * ctx.leanToe) *
      dtS;
    if (Math.abs(lock.balance) > 1) {
      // Fell off: a bail, so the board goes ragdoll — the lock lets go and applies nothing
      // (MECHANICS.md "Bail: the board goes ragdoll").
      this.release();
      return "fellOff";
    }

    // LOCK PD: the point onto the target line, square to the edge only; carry gravity.
    const target =
      support.target ??
      Vec3.add(
        Vec3.add(lock.frame.edge.startM, Vec3.scale(u, s)),
        Vec3.add(lock.offset, Vec3.scale(m, this.entryLiftM(lock, board, p))),
      );
    const error = across(Vec3.sub(target, p), u);
    let wanted = Vec3.scale(error, g.lockOmegaPerS);
    const wantedSpeed = Vec3.length(wanted);
    if (wantedSpeed > g.lockMaxSpeedMps)
      wanted = Vec3.scale(wanted, g.lockMaxSpeedMps / wantedSpeed);
    const vp = across(pointVelocity(board, p), u);
    const gravity = Vec3.create(0, -this.config.tricks.gravityMps2, 0);
    let dv = Vec3.sub(
      Vec3.scale(Vec3.sub(wanted, vp), g.lockGain),
      Vec3.scale(across(gravity, u), dtS),
    );
    // FRICTION along the edge (never a push): grinds on the trucks, slides on the deck.
    const mu = isSlide(lock.kind) ? g.slideFrictionG : g.grindFrictionG;
    const load = this.config.tricks.gravityMps2 * Math.max(0, m.y);
    const fade = Math.min(1, Math.abs(vAlong) / g.frictionFadeSpeedMps);
    const brake = Math.min(Math.abs(vAlong), mu * load * fade * dtS);
    dv = Vec3.sub(dv, Vec3.scale(u, Math.sign(vAlong) * brake));
    out.push(impulse("grind", Vec3.scale(dv, mass.massKg), mass.centerOfMassWorldM));

    // STANCE PD: pitch, yaw and roll toward the stance's attitude.
    const q = this.stanceRotation(lock, board, ctx, u, m);
    const err = Quat.toRotationVector(Quat.multiply(q, Quat.conjugate(board.transform.rotation)));
    const w = g.stanceOmegaRadps;
    let accel = Vec3.sub(Vec3.scale(err, w * w), Vec3.scale(board.angularVelocityRadps, 2 * w));
    if (lock.flipIn) {
      // Caught mid-flip: the feet finish it with the catch's capped, eased correction.
      if (Vec3.length(err) < this.config.assist.flipInDoneRad) lock.flipIn = false;
      const { catchMaxAlphaRadps2 } = this.config.tricks;
      const reach = Math.min(1, lock.sinceS / Math.max(1e-3, this.config.feet.catchReachS));
      const cap = catchMaxAlphaRadps2 * reach * reach * (3 - 2 * reach);
      const size = Vec3.length(accel);
      if (size > cap && size > 0) accel = Vec3.scale(accel, cap / size);
    }
    out.push({
      kind: "torque",
      foot: "back",
      label: "grind",
      torqueNm: mass.angularInertiaTimes(accel),
    });
    return null;
  }

  /** The attitude the stance holds: along or across the edge, the stance's pitch, the lean. */
  private stanceRotation(
    lock: Lock,
    board: BoardKinematics,
    ctx: HoldContext,
    u: Vec3,
    m: Vec3,
  ): Quat {
    const g = this.config.grind;
    const { edge } = lock.frame;
    const f = boardForward(board);
    const slide = isSlide(lock.kind);
    const axis = slide ? Vec3.normalize(Vec3.cross(u, m)) : u;
    const x0 = Vec3.dot(f, axis) >= 0 ? axis : Vec3.scale(axis, -1);
    const z0 = Vec3.cross(x0, m);
    // + = the board's +X end up. The rider's front end is +X when facing +1.
    const facing = Vec3.dot(f, Vec3.cross(Vec3.UNIT_Y, ctx.riderSide)) >= 0 ? 1 : -1;
    let pitch = 0;
    if (lock.kind === "fiveO") pitch = facing * g.grindPitchRad;
    else if (lock.kind === "noseGrind") pitch = -facing * g.grindPitchRad;
    else if (lock.kind === "tailslide") pitch = facing * g.slidePitchRad;
    else if (lock.kind === "noseslide") pitch = -facing * g.slidePitchRad;
    else if (lock.kind === "boardslide" && !edge.twoSided) {
      // The end over the top surface tilts up until its wheels clear it.
      const { trucks, wheels } = this.deck;
      const reach = trucks.wheelbaseM / 2 - wheels.radiusM - Math.abs(lock.pointLocal.x);
      const tilt = Math.atan2(trucks.heightM + wheels.radiusM, Math.max(0.05, reach));
      const over = Math.sign(Vec3.dot(x0, Vec3.scale(edge.outwardNormal, -1))) || 1;
      pitch = over * (tilt + g.boardslideClearRad);
    }
    let x = rotateAbout(x0, z0, pitch);
    let y = rotateAbout(m, z0, pitch);
    // The board leans toward the side the balance tips to (+roll takes +Z down).
    const toeBoard = ctx.toe * (Math.sign(Vec3.dot(z0, ctx.riderSide)) || 1);
    const roll = lock.balance * g.balanceLeanRad * toeBoard;
    y = rotateAbout(y, x, roll);
    x = Vec3.normalize(x);
    y = Vec3.normalize(across(y, x));
    return quatFromBasis(x, y, Vec3.cross(x, y));
  }

  /**
   * THE CHORD ACROSS A JOINT (a kinked rail, a down rail). A rigid board cannot follow its
   * midpoint around a kink: over a convex one its tail truck drags on the upper run; into a
   * concave one its front truck lands on the next run while the lock still holds the old
   * slope, and the board wedges (a slide's deck edges do the same). So on a bar, while the
   * board's two contacts along it (a grind's trucks, a slide's deck edges) project onto two
   * joined runs (same obstacle, ends within `continueGapM`), the lock holds the line
   * between those two projections instead: the board's pitch eases from one run's slope to
   * the next over one wheelbase (plus `jointLeadS` of travel at each end, so the velocity
   * turns before a truck reaches the next run). Square to that line the board rests on the path as it is
   * (its attitude lags the chord's turn): the locked point is held where both contacts, and
   * the line between them over a convex kink (the board pivots on it), clear the path by `hoverM` +
   * `jointClearM`. Along the
   * line only gravity and friction act, as on any edge. Elsewhere: the edge itself
   * (`target` null: the caller uses the edge line and the lock's offset).
   */
  private supportLine(
    lock: Lock,
    board: BoardKinematics,
    edges: readonly GrindEdgeView[],
  ): { u: Vec3; m: Vec3; target: Vec3 | null } {
    const { frame } = lock;
    const plain = { u: frame.u, m: frame.m, target: null };
    if (!frame.edge.twoSided) return plain;
    const gap = this.config.grind.continueGapM;
    const cur = frame.edge;
    const joined = edges.filter(
      (e) =>
        e !== cur &&
        e.obstacleId === cur.obstacleId &&
        e.twoSided &&
        (Vec3.distance(e.startM, cur.endM) <= gap || Vec3.distance(e.endM, cur.startM) <= gap),
    );
    if (joined.length === 0) return plain;
    const onPath = (q: Vec3): { point: Vec3; edge: GrindEdgeView } => {
      let best = { point: closestOnSegment(cur, q), edge: cur };
      let bestD = Vec3.distance(best.point, q);
      for (const e of joined) {
        const point = closestOnSegment(e, q);
        const d = Vec3.distance(point, q);
        if (d < bestD) {
          best = { point, edge: e };
          bestD = d;
        }
      }
      return best;
    };
    // Where the board meets the bar, at both ends along it: a grind's two trucks; a
    // slide's deck edges either side of the locked point (the bar runs across the deck).
    const [qa, qb] = isSlide(lock.kind)
      ? [
          Vec3.add(lock.pointLocal, Vec3.create(0, 0, -this.deck.deck.widthM / 2)),
          Vec3.add(lock.pointLocal, Vec3.create(0, 0, this.deck.deck.widthM / 2)),
        ]
      : [
          Vec3.create(-this.deck.trucks.wheelbaseM / 2, lock.pointLocal.y, 0),
          Vec3.create(this.deck.trucks.wheelbaseM / 2, lock.pointLocal.y, 0),
        ];
    const wa = Transform.toWorldPoint(board.transform, qa);
    const wb = Transform.toWorldPoint(board.transform, qb);
    // "back" / "front" along the edge direction.
    const [backQ, frontQ] = Vec3.dot(Vec3.sub(wb, wa), frame.u) >= 0 ? [wa, wb] : [wb, wa];
    const back = onPath(backQ);
    const front = onPath(frontQ);
    // The chord's direction: from points `lead` beyond those two along the edge.
    const lead =
      Math.abs(Vec3.dot(board.linearVelocityMps, frame.u)) * this.config.grind.jointLeadS;
    const ahead = Vec3.scale(frame.u, lead);
    const leadBack = onPath(Vec3.sub(backQ, ahead));
    const leadFront = onPath(Vec3.add(frontQ, ahead));
    if (leadBack.edge === leadFront.edge) return plain;
    const chord = Vec3.sub(leadFront.point, leadBack.point);
    if (Vec3.length(chord) < 1e-3) return plain;
    let u = Vec3.normalize(chord);
    if (Vec3.dot(u, frame.u) < 0) u = Vec3.scale(u, -1);
    if (Math.abs(u.y) > 0.9) return plain;
    const m = Vec3.normalize(Vec3.sub(Vec3.UNIT_Y, Vec3.scale(u, u.y)));
    // The board rests on the path as it is now (the stance PD turns it toward the chord):
    // the locked point moves along m until the higher of these needs is met — each contact
    // `clear` over the path under it, and the line between them `clear` over a convex kink.
    const { hoverM, jointClearM } = this.config.grind;
    const clear = hoverM + jointClearM;
    let need = Math.max(
      Vec3.dot(Vec3.sub(back.point, backQ), m),
      Vec3.dot(Vec3.sub(front.point, frontQ), m),
    );
    const a = leadBack.edge;
    const b = leadFront.edge;
    const kink =
      Vec3.distance(a.endM, b.startM) <= gap
        ? Vec3.lerp(a.endM, b.startM, 0.5)
        : Vec3.lerp(a.startM, b.endM, 0.5);
    const span = Vec3.dot(Vec3.sub(frontQ, backQ), u);
    const at = span > 1e-6 ? Vec3.dot(Vec3.sub(kink, backQ), u) / span : -1;
    if (at > 0 && at < 1) {
      const over = Vec3.add(backQ, Vec3.scale(Vec3.sub(frontQ, backQ), at));
      need = Math.max(need, Vec3.dot(Vec3.sub(kink, over), m));
    }
    const p = Transform.toWorldPoint(board.transform, lock.pointLocal);
    const target = Vec3.add(p, Vec3.scale(m, need + clear));
    return { u, m, target };
  }

  /**
   * Past the end of the edge: carry on onto the next edge of the same obstacle that runs
   * the same way (the hubba's flat top into its slope). Once the point is over that edge
   * the lock moves to it; across a gap of up to `continueGapM` before it, the lock keeps
   * holding the current line. True if the lock continues.
   */
  private continueOnto(lock: Lock, p: Vec3, ctx: HoldContext): boolean {
    const g = this.config.grind;
    let bridging = false;
    for (const edge of ctx.edges) {
      if (edge === lock.frame.edge || edge.obstacleId !== lock.frame.edge.obstacleId) continue;
      const frame = edgeFrame(edge);
      if (frame === null || Math.abs(Vec3.dot(frame.u, lock.frame.u)) < 0.7) continue;
      const s = Vec3.dot(Vec3.sub(p, edge.startM), frame.u);
      const onLine = Vec3.add(edge.startM, Vec3.scale(frame.u, s));
      if (Vec3.distance(p, onLine) > g.continueGapM) continue;
      if (s >= 0 && s <= frame.lengthM) {
        lock.frame = frame;
        this.fitToEdge(lock, ctx.board);
        return true;
      }
      if (s > -g.continueGapM && s < frame.lengthM + g.continueGapM) bridging = true;
    }
    return bridging;
  }
}

/** The point of an edge segment closest to `q`. */
function closestOnSegment(edge: GrindEdgeView, q: Vec3): Vec3 {
  const d = Vec3.sub(edge.endM, edge.startM);
  const len2 = Vec3.dot(d, d);
  const t =
    len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, Vec3.dot(Vec3.sub(q, edge.startM), d) / len2));
  return Vec3.add(edge.startM, Vec3.scale(d, t));
}

/** Velocity of a board point: the origin's velocity plus ω × r. */
function pointVelocity(board: BoardKinematics, pointM: Vec3): Vec3 {
  const r = Vec3.sub(pointM, board.transform.positionM);
  return Vec3.add(board.linearVelocityMps, Vec3.cross(board.angularVelocityRadps, r));
}

function impulse(label: "grind", impulseNs: Vec3, pointWorldM: Vec3): FootForce {
  return Object.freeze({ kind: "impulse", foot: "back", label, impulseNs, pointWorldM });
}
