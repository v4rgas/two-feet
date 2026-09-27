import type {
  BailReason,
  BoardLanded,
  BoardPopped,
  DomainEvent,
  FootId,
  Kick,
  RiderBailed,
  RotationTotals,
  Stance,
} from "../../../shared";
import { FOOT_IDS, shortestDelta, Vec3 } from "../../../shared";
import type { TricksConfig } from "../tricks.config";
import type { AirSession } from "./air-session";
import type { RawAirRotation, RiderPose } from "./rider-frame";
import {
  boardFacing,
  boardHeadingRad,
  headingForward,
  normaliseRotation,
  oppositeStance,
} from "./rider-frame";
import { LocalRotationAccumulator } from "./rotation-accumulator";
import type { TrickClassification } from "./trick-classifier";
import { classifyTrick } from "./trick-classifier";
import type { TrickTable } from "./trick-definition";
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
  private boardYawRad = 0;
  private bodyYawRad = 0;
  private lastBoardHeading: number | null;
  private lastRiderHeading: number;
  private readonly facing: 1 | -1;
  latestTimeS: number;

  constructor(
    readonly startedTick: number,
    readonly startedAtS: number,
    readonly pop: PopState | null,
    takeoff: MotionSample,
    pose: RiderPose,
    private readonly minHorizontal: number,
  ) {
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

  constructor(
    private readonly config: TricksConfig,
    private readonly table: TrickTable,
    stance: Stance,
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
    return this.settle(sample);
  }

  onEvent(event: DomainEvent): readonly TrickOutcome[] {
    switch (event.type) {
      case "BoardPopped":
        this.pop = this.popState(event);
        return [];
      case "BoardLeftGround":
        this.takeOff(event.tick, event.timeS);
        return [];
      case "BoardLanded":
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

  private classify(s: AirTracker, pop: PopState): TrickClassification {
    const n = this.normalised(s);
    return classifyTrick(
      { ...n, kick: pop.kick, fakie: pop.fakie, switchStance: pop.switchStance },
      this.table,
      this.config.tolerances,
    );
  }

  // ── landing ───────────────────────────────────────────────────────────────

  private land(event: BoardLanded): readonly TrickOutcome[] {
    const s = this.session;
    this.session = null;
    const pop = s?.pop ?? null;
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
    const tiltRad = Math.acos(Math.max(-1, Math.min(1, event.upDot)));
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
