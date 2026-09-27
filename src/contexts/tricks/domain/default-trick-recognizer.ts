import type {
  BailReason,
  BoardLanded,
  BoardPopped,
  DomainEvent,
  FootId,
  GrindExit,
  GrindKind,
  GrindSide,
  Kick,
  RiderBailed,
  RotationTotals,
  Stance,
  SurfaceType,
} from "../../../shared";
import { FOOT_IDS, SURFACE_TYPES, shortestDelta, Vec3 } from "../../../shared";
import type { TricksConfig } from "../tricks.config";
import { GRIND_NAMES } from "../tricks.config";
import type { AirSession } from "./air-session";
import type { RawAirRotation, RiderPose } from "./rider-frame";
import {
  boardFacing,
  boardHeadingRad,
  headingForward,
  normaliseRotation,
  oppositeStance,
  toeSign,
} from "./rider-frame";
import { LocalRotationAccumulator } from "./rotation-accumulator";
import type { TrickClassification } from "./trick-classifier";
import { classifyTrick } from "./trick-classifier";
import type { GrindNames, TrickTable } from "./trick-definition";
import type { MotionSample, TrickOutcome, TrickRecognizer } from "./trick-recognizer";

/** The state at the pop: it decides the prefixes and the stance the rotation is read in. */
interface PopState {
  readonly kick: Kick;
  readonly timeS: number;
  readonly fakie: boolean;
  readonly switchStance: boolean;
  /** Stance actually ridden (the input stance, or its opposite when riding switch). */
  readonly ridingStance: Stance;
}

/** Rotation of one air session, from takeoff on (mutable, private to the recognizer). */
class AirTracker {
  private readonly accumulator = new LocalRotationAccumulator();
  /** The pop, when it arrives after the air began (a pop out of a grind). */
  pop: PopState | null;
  private boardYawRad = 0;
  private bodyYawRad = 0;
  private lastBoardHeading: number | null;
  private lastRiderHeading: number;
  private readonly facing: 1 | -1;
  latestTimeS: number;
  /** The body's own turn at a pop out of a grind (rider heading, rad): not a trick. */
  turnOutRad = 0;

  constructor(
    readonly startedTick: number,
    readonly startedAtS: number,
    pop: PopState | null,
    takeoff: MotionSample,
    pose: RiderPose,
    private readonly minHorizontal: number,
    /** The air began by leaving a grind. */
    readonly fromGrind: boolean = false,
  ) {
    this.pop = pop;
    this.accumulator.reset(takeoff.transform.rotation);
    this.lastBoardHeading = boardHeadingRad(takeoff.transform.rotation, minHorizontal);
    this.lastRiderHeading = pose.headingRad;
    this.facing = boardFacing(takeoff.transform.rotation, pose.headingRad);
    this.latestTimeS = takeoff.timeS;
  }

  add(sample: MotionSample, pose: RiderPose): void {
    const rotation = sample.transform.rotation;
    this.accumulator.add(rotation);
    const heading = boardHeadingRad(rotation, this.minHorizontal);
    if (heading !== null) {
      if (this.lastBoardHeading !== null) {
        this.boardYawRad += shortestDelta(this.lastBoardHeading, heading);
      }
      this.lastBoardHeading = heading;
    }
    this.bodyYawRad += shortestDelta(this.lastRiderHeading, pose.headingRad);
    this.lastRiderHeading = pose.headingRad;
    this.latestTimeS = sample.timeS;
  }

  get raw(): RawAirRotation {
    return {
      localRollRad: this.accumulator.totals.rollRad,
      boardYawRad: this.boardYawRad,
      bodyYawRad: this.bodyYawRad,
      facing: this.facing,
    };
  }

  get localPitchRad(): number {
    return this.accumulator.totals.pitchRad;
  }
}

/** A grind in progress (M4). */
interface ActiveGrind {
  readonly kind: GrindKind;
  readonly side: GrindSide;
  readonly obstacleId: string;
  readonly surface: SurfaceType;
  readonly name: string;
  readonly startedAtS: number;
}

/** The trick into a grind, named once the lock has settled (`grind.entrySettleS`). */
interface PendingEntry {
  readonly session: AirTracker;
  readonly untilS: number;
  readonly slide: boolean;
  /** The grind's name, added to the line after the entry. */
  readonly grindName: string;
}

const SLIDES: readonly GrindKind[] = ["boardslide", "tailslide", "noseslide"];

/** A popped air that touched down cleanly so far, waiting for the catch and the wheels. */
interface PendingLanding {
  readonly classification: TrickClassification;
  readonly rotation: RotationTotals;
  readonly stance: Stance;
  readonly airtimeS: number;
  readonly landedAtS: number;
  wheelsMax: number;
}

/**
 * The trick recognizer (REQUIREMENTS §1.5, MECHANICS.md "Trick matrix", ADR 0007).
 *
 * From takeoff to landing it accumulates, in the frame of the rider heading at takeoff:
 * the board's roll about its own long axis (the flip), the heading change of its long
 * axis (the shove) and, separately, the rider's heading change (the body spin). At the
 * landing it names them from the `TrickTable` with the state at the pop (kick, fakie,
 * switch) and decides:
 * - `TrickBailed` right away: upside down, a channel not within tolerance of a whole step
 *   (under/over-rotated, with the closest name), or touchdown tilt beyond `maxTiltRad`;
 * - otherwise it waits: both feet attached within `catchWindowS` and `minWheels` down
 *   within `settleWindowS` → `TrickLanded`, else `TrickBailed`;
 * - `RiderBailed` in the air or while waiting → `TrickBailed` with the rider's reason.
 * Airs without a pop (rolled off an edge) and hops shorter than `minAirtimeS` are not named.
 */
export class DefaultTrickRecognizer implements TrickRecognizer {
  private stance: Stance;
  private sample: MotionSample | null = null;
  private pose: RiderPose | null = null;
  private pop: PopState | null = null;
  private session: AirTracker | null = null;
  private landing: PendingLanding | null = null;
  private readonly attached = new Set<FootId>(FOOT_IDS);
  /** The line so far (M4): the tricks and grinds since the pop, or null outside a line. */
  private line: string[] | null = null;
  private grind: ActiveGrind | null = null;
  private entry: PendingEntry | null = null;

  constructor(
    private readonly config: TricksConfig,
    private readonly table: TrickTable,
    stance: Stance,
    private readonly grindNames: GrindNames = GRIND_NAMES,
  ) {
    this.stance = stance;
  }

  setStance(stance: Stance): void {
    this.stance = stance;
  }

  reset(): void {
    this.sample = null;
    this.pose = null;
    this.pop = null;
    this.session = null;
    this.landing = null;
    this.line = null;
    this.grind = null;
    this.entry = null;
    for (const foot of FOOT_IDS) this.attached.add(foot);
  }

  get air(): AirSession | null {
    const s = this.session;
    if (s === null) return null;
    return {
      startedTick: s.startedTick,
      startedAtS: s.startedAtS,
      airtimeS: s.latestTimeS - s.startedAtS,
      popped: s.pop !== null,
      kick: s.pop?.kick ?? null,
      rotation: this.totals(s),
      bodyRad: this.normalised(s).bodyRad,
      detachedFeet: FOOT_IDS.filter((f) => !this.attached.has(f)),
    };
  }

  observe(sample: MotionSample, rider: RiderPose): readonly TrickOutcome[] {
    this.sample = sample;
    this.pose = rider;
    this.session?.add(sample, rider);
    this.entry?.session.add(sample, rider);
    const out: TrickOutcome[] = [];
    const g = rider.grind ?? null;
    if (g !== null && this.grind === null) out.push(this.grindStarted(g, sample));
    if (this.entry !== null && sample.timeS >= this.entry.untilS - 1e-9) this.resolveEntry();
    if (g === null && this.grind !== null) {
      out.push(this.grindEnded(rider.lastGrindExit ?? "rollOff", sample, rider));
    }
    out.push(...this.settle(sample));
    return out;
  }

  // ── grinds and lines (M4) ─────────────────────────────────────────────────

  /**
   * The board locked onto an edge: the line goes on (or starts), the air that brought
   * it here is named once the lock settles, and it is no longer an air (its touchdowns on
   * a ledge top are no landing).
   */
  private grindStarted(g: NonNullable<RiderPose["grind"]>, sample: MotionSample): TrickOutcome {
    const names = this.grindNames;
    const name = `${names.sides[g.side]} ${names.kinds[g.kind]}`;
    const surface = (SURFACE_TYPES as readonly string[]).includes(g.surface)
      ? (g.surface as SurfaceType)
      : "grindable";
    this.grind = {
      kind: g.kind,
      side: g.side,
      obstacleId: g.obstacleId,
      surface,
      name,
      startedAtS: sample.timeS,
    };
    this.line ??= [];
    this.landing = null;
    const s = this.session;
    this.session = null;
    if (s !== null && s.pop !== null) {
      this.entry = {
        session: s,
        untilS: sample.timeS + this.config.grind.entrySettleS,
        slide: SLIDES.includes(g.kind),
        grindName: name,
      };
    } else {
      // Rolled or dropped in: nothing to name before the grind.
      this.line.push(name);
    }
    return {
      type: "GrindStarted",
      tick: sample.tick,
      timeS: sample.timeS,
      grind: g.kind,
      side: g.side,
      name,
      obstacleId: g.obstacleId,
      surface,
    };
  }

  /** Names the trick into the grind and adds it and the grind to the line. */
  private resolveEntry(): void {
    const e = this.entry;
    if (e === null) return;
    this.entry = null;
    const line = this.line ?? [];
    this.line = line;
    const pop = e.session.pop;
    if (pop !== null) {
      const c = this.classify(e.session, pop, e.slide);
      if (!this.grindNames.silentInLine.includes(c.id) && c.name !== "") line.push(c.name);
    }
    line.push(e.grindName);
  }

  private grindEnded(exit: GrindExit, sample: MotionSample, pose: RiderPose): TrickOutcome {
    this.resolveEntry();
    const g = this.grind;
    this.grind = null;
    if (g === null) throw new Error("no grind to end");
    // Leaving the edge in the air: that air starts now (there may be no BoardLeftGround).
    if (!sample.grounded && exit !== "fellOff") {
      this.session = new AirTracker(
        sample.tick,
        sample.timeS,
        null,
        sample,
        pose,
        this.config.session.minHorizontalAxis,
        true,
      );
    }
    return {
      type: "GrindEnded",
      tick: sample.tick,
      timeS: sample.timeS,
      grind: g.kind,
      side: g.side,
      name: g.name,
      obstacleId: g.obstacleId,
      durationS: sample.timeS - g.startedAtS,
      exit,
    };
  }

  onEvent(event: DomainEvent): readonly TrickOutcome[] {
    switch (event.type) {
      case "BoardPopped": {
        const pop = this.popState(event);
        // A pop out of a grind: the air already began when the lock let go.
        const s = this.session;
        if (s?.fromGrind && s.pop === null && this.grind === null) {
          s.pop = pop;
          s.turnOutRad = this.pose?.popOutTurnRad ?? 0;
          return [];
        }
        this.pop = pop;
        return [];
      }
      case "BoardLeftGround":
        if (this.grind !== null) return [];
        if (this.session?.fromGrind === true) return [];
        this.takeOff(event.tick, event.timeS);
        return [];
      case "BoardLanded":
        if (this.grind !== null) return [];
        return this.land(event);
      case "FootAttached":
        this.attached.add(event.foot);
        return [];
      case "FootDetached":
        this.attached.delete(event.foot);
        return [];
      case "RiderBailed":
        return this.riderBailed(event);
      default:
        return [];
    }
  }

  // ── session ───────────────────────────────────────────────────────────────

  private popState(event: BoardPopped): PopState {
    const switchStance = this.pose?.switchStance ?? false;
    let fakie = false;
    if (this.sample !== null && this.pose !== null) {
      const forward = headingForward(this.pose.headingRad);
      const speed = Vec3.dot(this.sample.linearVelocityMps, forward);
      fakie = speed < -this.config.session.fakieMinSpeedMps;
    }
    return {
      kick: event.kick,
      timeS: event.timeS,
      fakie,
      switchStance,
      ridingStance: switchStance ? oppositeStance(this.stance) : this.stance,
    };
  }

  private takeOff(tick: number, timeS: number): void {
    const { sample, pose } = this;
    const pop = this.pop;
    this.pop = null;
    if (sample === null || pose === null) return;
    const popped =
      pop !== null && timeS - pop.timeS <= this.config.session.popToTakeoffWindowS ? pop : null;
    this.session = new AirTracker(
      tick,
      timeS,
      popped,
      sample,
      pose,
      this.config.session.minHorizontalAxis,
    );
  }

  private normalised(s: AirTracker) {
    return normaliseRotation(s.raw, s.pop?.ridingStance ?? this.stance);
  }

  private totals(s: AirTracker): RotationTotals {
    const n = this.normalised(s);
    return { rollRad: n.flipRad, yawRad: n.shoveRad, pitchRad: s.localPitchRad };
  }

  /**
   * Names an air. `intoSlide`: the air ends in a slide, which implies a quarter turn of
   * the body, taken off the body spin before naming. An air out of a grind has the body's
   * own turn to line up with the travel taken off (`turnOutRad`).
   */
  private classify(s: AirTracker, pop: PopState, intoSlide = false): TrickClassification {
    const n = this.normalised(s);
    const k = -toeSign(pop.ridingStance);
    let bodyRad = n.bodyRad - k * s.turnOutRad;
    if (intoSlide && Math.abs(bodyRad) >= Math.PI / 4) {
      bodyRad -= Math.sign(bodyRad) * (Math.PI / 2);
    }
    return classifyTrick(
      { ...n, bodyRad, kick: pop.kick, fakie: pop.fakie, switchStance: pop.switchStance },
      this.table,
      this.config.tolerances,
    );
  }

  // ── landing ───────────────────────────────────────────────────────────────

  private land(event: BoardLanded): readonly TrickOutcome[] {
    const s = this.session;
    this.session = null;
    const pop = s?.pop ?? null;
    const line = this.line;
    if (line !== null && s !== null) return this.landLine(event, s, pop, line);
    if (s === null || pop === null || event.airtimeS < this.config.session.minAirtimeS) return [];
    const classification = this.classify(s, pop);
    const rotation = this.totals(s);
    const pending: PendingLanding = {
      classification,
      rotation,
      stance: pop.ridingStance,
      airtimeS: event.airtimeS,
      landedAtS: event.timeS,
      wheelsMax: event.wheelsDown,
    };
    const tiltRad = Math.acos(Math.max(-1, Math.min(1, event.surfaceUpDot ?? event.upDot)));
    const reason: BailReason | null =
      event.upDot < 0
        ? "upsideDown"
        : !classification.complete
          ? "underRotated"
          : tiltRad > this.config.landing.maxTiltRad
            ? "offAngle"
            : null;
    if (reason !== null) return [this.bailed(pending, reason, event.tick, event.timeS)];
    this.landing = pending;
    return [];
  }

  /**
   * The landing at the end of a line: the air out of the last grind is added (a pop out
   * keeps its trick name with " out"; rolling off adds nothing), then the landing is
   * judged as usual and named with the whole line.
   */
  private landLine(
    event: BoardLanded,
    s: AirTracker,
    pop: PopState | null,
    line: string[],
  ): readonly TrickOutcome[] {
    const names = this.grindNames;
    let classification: TrickClassification | null = null;
    if (pop !== null) {
      classification = this.classify(s, pop);
      if (!names.silentInLine.includes(classification.id) && classification.name !== "") {
        line.push(`${classification.name}${names.outSuffix}`);
      }
    }
    this.line = null;
    const lineName = line.join(names.lineJoiner);
    const complete = classification?.complete ?? true;
    const pending: PendingLanding = {
      classification: {
        id: `line:${classification?.id ?? "roll-off"}`,
        name: lineName,
        complete,
        flip: classification?.flip ?? NO_MATCH,
        shove: classification?.shove ?? NO_MATCH,
        body: classification?.body ?? NO_MATCH,
      },
      rotation: this.totals(s),
      stance: pop?.ridingStance ?? this.stance,
      airtimeS: event.airtimeS,
      landedAtS: event.timeS,
      wheelsMax: event.wheelsDown,
    };
    const tiltRad = Math.acos(Math.max(-1, Math.min(1, event.surfaceUpDot ?? event.upDot)));
    const reason: BailReason | null =
      event.upDot < 0
        ? "upsideDown"
        : !complete
          ? "underRotated"
          : tiltRad > this.config.landing.maxTiltRad
            ? "offAngle"
            : null;
    if (reason !== null) return [this.bailed(pending, reason, event.tick, event.timeS)];
    this.landing = pending;
    return [];
  }

  /** Waits for the catch and the wheels after touchdown (see the class comment). */
  private settle(sample: MotionSample): readonly TrickOutcome[] {
    const l = this.landing;
    if (l === null) return [];
    const { minWheels, catchWindowS, settleWindowS } = this.config.landing;
    l.wheelsMax = Math.max(l.wheelsMax, sample.wheelsDown);
    const caught = FOOT_IDS.every((f) => this.attached.has(f));
    const sinceS = sample.timeS - l.landedAtS;
    let reason: BailReason | null = null;
    if (caught && l.wheelsMax >= minWheels) {
      this.landing = null;
      return [
        {
          type: "TrickLanded",
          tick: sample.tick,
          timeS: sample.timeS,
          trickId: l.classification.id,
          name: l.classification.name,
          stance: l.stance,
          rotation: l.rotation,
          airtimeS: l.airtimeS,
        },
      ];
    }
    if (!caught && sinceS > catchWindowS) reason = "feetDetached";
    else if (l.wheelsMax < minWheels && sinceS > settleWindowS) reason = "offAngle";
    if (reason === null) return [];
    this.landing = null;
    return [this.bailed(l, reason, sample.tick, sample.timeS)];
  }

  private riderBailed(event: RiderBailed): readonly TrickOutcome[] {
    this.pop = null;
    const line = this.line;
    if (line !== null) {
      this.resolveEntry();
      this.line = null;
      this.grind = null;
      this.landing = null;
      const s = this.session;
      this.session = null;
      const name = line.join(this.grindNames.lineJoiner);
      return [
        {
          type: "TrickBailed",
          tick: event.tick,
          timeS: event.timeS,
          trickId: "line",
          name: name === "" ? null : name,
          reason: event.reason,
          rotation: s === null ? ZERO_ROTATION : this.totals(s),
          airtimeS: s === null ? 0 : s.latestTimeS - s.startedAtS,
        },
      ];
    }
    const l = this.landing;
    if (l !== null) {
      this.landing = null;
      return [this.bailed(l, event.reason, event.tick, event.timeS)];
    }
    const s = this.session;
    const pop = s?.pop ?? null;
    if (s === null || pop === null) return [];
    this.session = null;
    const pending: PendingLanding = {
      classification: this.classify(s, pop),
      rotation: this.totals(s),
      stance: pop.ridingStance,
      airtimeS: s.latestTimeS - s.startedAtS,
      landedAtS: event.timeS,
      wheelsMax: 0,
    };
    return [this.bailed(pending, event.reason, event.tick, event.timeS)];
  }

  private bailed(l: PendingLanding, reason: BailReason, tick: number, timeS: number): TrickOutcome {
    return {
      type: "TrickBailed",
      tick,
      timeS,
      trickId: l.classification.id,
      name: l.classification.name,
      reason,
      rotation: l.rotation,
      airtimeS: l.airtimeS,
    };
  }
}

const NO_MATCH = Object.freeze({
  step: Object.freeze({ id: "none", name: "", units: 0 }),
  errorRad: 0,
  complete: true,
});

const ZERO_ROTATION: RotationTotals = Object.freeze({ rollRad: 0, yawRad: 0, pitchRad: 0 });
