import type { FootId, GrindExit, Kick } from "../../../shared";
import { FOOT_IDS, Quat, Transform, Vec3 } from "../../../shared";
import type { AssistTuning, RiderConfig } from "../rider.config";
import {
  axisErrorRad,
  boardForward,
  boardHeadingRad,
  boardUp,
  deckPointWorld,
  offAngleTouchUpDot,
  restHeightM,
  supportNormal,
  wrapPi,
} from "./board-geometry";
import type { FootForce, FootForceLabel } from "./foot-force";
import type {
  BoardKinematics,
  BoardMassProperties,
  DeckGeometry,
  FootForceInput,
  FootForceModel,
  FootForceOutput,
  GrindEdgeView,
  RiderControls,
} from "./foot-force-model";
import { stickMagnitude, toeSideSign } from "./foot-placement";
import type { AirStart } from "./grind-controller";
import { GrindController } from "./grind-controller";
import type { RiderState } from "./rider-state";
import type { Swipe } from "./swipe-tracker";
import { SwipeTracker } from "./swipe-tracker";

/** One foot's stick read as MECHANICS.md keys (stance resolved: toe/heel, not ±x). */
interface FootKeys {
  /** Stick along the rider's front (+1 = toward the nose end). */
  readonly along: number;
  /** Sideways stick, stance resolved: +1 = toe edge, −1 = heel edge (the swipe's `x`). */
  readonly side: number;
  /** Toward the toe edge (+1) / heel edge (−1) past the key threshold, else 0. */
  readonly edge: -1 | 0 | 1;
  /** The key held along (+1 toward the nose, −1 toward the tail, 0 none), or null if unknown. */
  readonly heldAlong: number | null;
}

/** Both feet read as keys, plus "all released". */
interface Keys {
  readonly front: FootKeys;
  readonly back: FootKeys;
  readonly released: boolean;
}

/** Where a kick is along the rider frame: the tail behind (−1), the nose in front (+1). */
function kickSign(kick: Kick): 1 | -1 {
  return kick === "nose" ? 1 : -1;
}

/** The foot that stands on a kick and pops it: back foot on the tail, front on the nose. */
function popFootOf(kick: Kick): FootId {
  return kick === "nose" ? "front" : "back";
}

/** The other foot: it sets, levels and flicks. */
function guideFootOf(kick: Kick): FootId {
  return kick === "nose" ? "back" : "front";
}

/** Everything about the board this step, in world space. */
class BoardFrame {
  readonly forward: Vec3;
  readonly up: Vec3;
  /** Rider frame: forward and the +Z side, upright (yaw only). */
  readonly riderForward: Vec3;
  readonly riderSide: Vec3;
  /**
   * "Level" for the assists: the normal of the ground the wheels touch (a bank, a
   * transition), world up when no wheel touches.
   */
  readonly support: Vec3;
  /**
   * Axis (in the support plane) a nose-up rotation of the rider-front end turns about, and
   * that end's elevation above the support plane (rad, + = up) and pitch rate (rad/s).
   */
  readonly pitchAxis: Vec3;
  readonly frontPitchRad: number;
  readonly frontPitchRateRadps: number;
  /** Board local Z, signed so a positive rotation about it lifts the rider-front end. */
  readonly noseUpAxis: Vec3;

  /**
   * For a pop from `kick`: the rotation axis that lifts the OTHER end (nose up for an
   * ollie, tail up for a nollie), and that end's elevation and rate about it.
   */
  liftAxis(kick: Kick): Vec3 {
    return Vec3.scale(this.pitchAxis, -kickSign(kick));
  }
  liftPitchRad(kick: Kick): number {
    return -kickSign(kick) * this.frontPitchRad;
  }
  liftRateRadps(kick: Kick): number {
    return -kickSign(kick) * this.frontPitchRateRadps;
  }
  /** Board local Z (principal) signed like `liftAxis`, for impulses that must not roll. */
  liftAxisLocal(kick: Kick): Vec3 {
    return Vec3.scale(this.noseUpAxis, -kickSign(kick));
  }

  constructor(
    readonly board: BoardKinematics,
    riderHeadingRad: number,
  ) {
    this.forward = boardForward(board);
    this.up = boardUp(board);
    const yaw = Quat.fromAxisAngle(Vec3.UNIT_Y, riderHeadingRad);
    this.riderForward = Quat.rotate(yaw, Vec3.UNIT_X);
    this.riderSide = Quat.rotate(yaw, Vec3.UNIT_Z);
    this.support = supportNormal(board);
    // The board's long axis, pointed at the rider's front.
    const facing = Vec3.dot(this.forward, this.riderForward) >= 0 ? 1 : -1;
    const front = Vec3.scale(this.forward, facing);
    const along = Vec3.dot(front, this.support);
    const inPlane = Vec3.sub(front, Vec3.scale(this.support, along));
    const flat = Vec3.lengthSq(inPlane) > 1e-9 ? Vec3.normalize(inPlane) : Vec3.ZERO;
    this.pitchAxis = Vec3.lengthSq(flat) > 0 ? Vec3.cross(flat, this.support) : this.riderSide;
    this.frontPitchRad = Math.asin(Math.max(-1, Math.min(1, along)));
    this.noseUpAxis = Vec3.scale(Transform.toWorldDirection(board.transform, Vec3.UNIT_Z), facing);
    this.frontPitchRateRadps = Vec3.dot(board.angularVelocityRadps, this.pitchAxis);
  }
}

/**
 * MECHANICS.md as a domain service (assisted physics). Reads the sticks as intents and
 * turns them into TARGETED impulses and PD torques on the board. Written in ROLES, so the
 * ollie and the nollie are one code path: the POP FOOT stands on a kick (back foot on the
 * tail, front foot on the nose) — it presses, loads, pops and shoves; the GUIDE FOOT is
 * the other one — it sets, levels and flicks. The kick decides the pitch signs.
 *
 * - rolling: standing weight and carving lean at the feet, the push;
 * - press (pop foot on its kick alone): a capped PD toward ±`manualPitchRad`;
 * - load (pop foot on its kick + guide foot set toward that kick) and pop (pop foot
 *   leaves the kick): a vertical impulse through the centre of mass for the target height
 *   plus the snap that lifts the other end; the first kick loaded wins;
 * - in the pop's windows: level (guide foot toward the far end: PD to level + height
 *   bonus), kickflip / heelflip (a guide-foot SWIPE to the heel / toe edge: the roll rate
 *   that completes its turns over the predicted airtime), shove-it (a pop-foot swipe: the
 *   yaw rate for 180°, or 360°); a swipe's size is its sideways travel (`SwipeTracker`:
 *   from the middle = one unit, edge to edge = two);
 * - catch (feet down in the air, inside the cone: roll, pitch, yaw and |ω|): a
 *   torque-limited PD toward level and 0°/180° that fixes at most `catchMaxCorrectionRad`
 *   per axis and damps the spin (never snaps it); outside the cone it is locked out
 *   `catchRetryS`; a caught board can still bail on landing;
 * - landing assist: damps bounce and rocking right after touchdown.
 *
 * No foot ever adds horizontal thrust: trick impulses are angular, plus the pop's
 * vertical impulse through the centre of mass. Only the push changes ground speed.
 */
export class TrickController implements FootForceModel {
  private wasGrounded = true;
  /** Just reset (see `reset`): the next step applies nothing. */
  private settling = false;
  /** The kick being loaded (the first one wins), or null. */
  private loadKick: Kick | null = null;
  private loadS = 0;
  /** The kick of this air's pop, or null (rolled off an edge, or not in the air). */
  private popKick: Kick | null = null;
  private sincePopS = Number.POSITIVE_INFINITY;
  private popSpeedMps = 0;
  private levelling = false;
  private flipped = false;
  private shoved = false;
  /**
   * The two trick channels (MECHANICS.md "Trick matrix"), independent of each other: the
   * FLIP holds a roll rate about the board's long axis, the SHOVE a yaw rate about world up,
   * until the catch. Their size (1 or 2 units) comes from the swipe that started them.
   */
  private readonly flipChannel = newChannel();
  /**
   * SWIPE SIZE (MECHANICS.md): each foot's sideways history, tracked always (on the ground,
   * on an edge, in the air) so a swipe may start before the pop; and each foot's last
   * finished swipe with the controller time it ended.
   */
  private readonly swipes: Record<FootId, SwipeTracker>;
  private readonly lastSwipe: Record<FootId, { swipe: Swipe; endS: number } | null> = {
    front: null,
    back: null,
  };
  /** Controller time, s, and the time of this air's pop (swipes ending from it on count). */
  private clockS = 0;
  private popClockS = Number.POSITIVE_INFINITY;
  /**
   * When this air's tricks should be done (time since the pop, s), set by the first flick
   * or sweep: every channel aims at it, so a varial / tre flip finishes flip and spin
   * together and can be caught.
   */
  private trickEndS = Number.POSITIVE_INFINITY;
  /** The board's yaw offset under the rider (0 or π) the body follow keeps this air. */
  private followOffsetRad: number | null = null;
  private readonly shoveChannel = newChannel();
  /** Scoop of the running shove: time since it started, its length and lean side. */
  private scoopS = Number.POSITIVE_INFINITY;
  private scoopDurationS = 0;
  private scoopLeanSign = 0;
  /** Which board end is scooped: +1 the board's +X end, −1 its −X end (fixed at the shove). */
  private scoopEndSign = 0;
  private caught = false;
  /** Time since the catch, s, and the error per axis it leaves (not corrected), rad. */
  private caughtS = 0;
  private catchLeftover: AttitudeErrors | null = null;
  /** The body's spin rate last step and its angular acceleration now (rad/s, rad/s²). */
  private lastBodySpinRateRadps = 0;
  private bodySpinAccelRadps2 = 0;

  private catchLockS = 0;
  private feetDownBefore = false;
  private releasedBefore = false;
  private landAssistLeftS = 0;
  private pushCooldownS = 0;
  /** The Q / E steer's lean (rider frame, + = toward +Z), eased (see `steer`). */
  private steerLean = 0;
  /** Space held from the air (the catch) does not push after landing until released. */
  private pushLocked = false;
  /** Ground height below the board this step (world y, m), for the airtime prediction. */
  private groundYM = 0;
  /** Grind edges near the board this step. */
  private edges: readonly GrindEdgeView[] = [];
  /** Grinds and slides (M4): the lock-on, the locked assists and the balance. */
  private readonly grind: GrindController;
  /** Where and facing which way the current air began (grinds: frontside / backside). */
  private airStart: AirStart | null = null;
  /** The obstacle this air left a grind on: not a landing for the airtime prediction. */
  private leftObstacleId: string | null = null;

  // ── assists (MECHANICS.md "Assists", ADR 0012) ──────────────────────────────
  /** The assist tunables (read each step: the dev tuning panel edits them live). */
  private assist: AssistTuning;
  /**
   * CATCH BUFFER: time left for a held Space to see the board enter the cone, s; once it
   * has (`catchArmed`), it waits there for the best moment.
   */
  private catchRequestS = 0;
  private catchArmed = false;
  /** Time since the last touchdown from the air (LATE CATCH), s. */
  private sinceTouchdownS = Number.POSITIVE_INFINITY;
  /**
   * STANCE-KEY GRACE: controller time each press (tail ↓ / nose W) was last held — held at
   * least `stanceKeyMinHoldS`, so the level (a W tap) is not a nose press — and when its
   * current hold began, s.
   */
  private readonly pressHeldAtS: Record<Kick, number> = {
    tail: Number.NEGATIVE_INFINITY,
    nose: Number.NEGATIVE_INFINITY,
  };
  private readonly pressFromS: Record<Kick, number | null> = { tail: null, nose: null };
  /** Controller time of the last lock-in, s (a press just after it still picks the stance). */
  private lockedAtS = Number.NEGATIVE_INFINITY;
  /** POP-OUT BUFFER: a load held in the air before a lock-in: its kick and time held, s. */
  private airLoadKick: Kick | null = null;
  private airLoadS = 0;
  /** This air began with a pop out of a grind, and its airtime floor has been applied. */
  private poppedOut = false;
  private floorDone = false;
  /** MAGNETISM: the net sideways velocity the magnet has added this air (horizontal), m/s. */
  private magnetMps: Vec3 = Vec3.ZERO;
  /** SPIN SNAP: the heading a released body spin is easing to a stop at, or null. */
  private snapHeadingRad: number | null = null;
  /**
   * SWIPE GRACE: how long each foot's sideways stick has been back near the middle, s. A
   * swipe that ended just before the pop counts once its foot is back (a rushed finger);
   * a position still held there may be a pre-position for a swipe across (a 360).
   */
  private readonly graceBackS: Record<FootId, number> = { front: 0, back: 0 };

  constructor(
    private readonly deck: DeckGeometry,
    private readonly config: RiderConfig,
  ) {
    this.grind = new GrindController(deck, config);
    this.assist = config.assist;
    this.swipes = { front: new SwipeTracker(config.tricks), back: new SwipeTracker(config.tricks) };
  }

  reset(): void {
    this.letGo();
    // The first step after a reset sees the spawn pose, not a physics read: no forces.
    this.settling = true;
    // A Space (or a key) still held through the reset does nothing until it is let go.
    this.feetDownBefore = true;
    this.releasedBefore = true;
    this.pushLocked = true;
    this.clockS = 0;
    this.sinceTouchdownS = Number.POSITIVE_INFINITY;
    this.pressHeldAtS.tail = Number.NEGATIVE_INFINITY;
    this.pressHeldAtS.nose = Number.NEGATIVE_INFINITY;
    this.lockedAtS = Number.NEGATIVE_INFINITY;
  }

  /**
   * BAIL = RAGDOLL (MECHANICS.md "Bail: the board goes ragdoll"): every controller lets go
   * and every buffered input is dropped — the load, the channels, the catch buffer, the
   * lock and the magnet (`endAir`), the steer lean, the swipes.
   */
  private letGo(): void {
    this.wasGrounded = true;
    this.loadKick = null;
    this.loadS = 0;
    this.endAir();
    this.landAssistLeftS = 0;
    this.pushCooldownS = 0;
    this.steerLean = 0;
    this.grind.reset();
    this.airStart = null;
    for (const id of FOOT_IDS) {
      this.swipes[id].reset();
      this.lastSwipe[id] = null;
      this.graceBackS[id] = 0;
    }
    this.airLoadKick = null;
    this.airLoadS = 0;
  }

  computeForces(input: FootForceInput): FootForceOutput {
    const { controls, rider, board, dtS } = input;
    // BAILED: the board is a free rigid body until the reset. Nothing is read, nothing is
    // applied, nothing is buffered — not even Space.
    if (rider.bailed || this.settling) {
      this.settling = false;
      this.letGo();
      this.feetDownBefore = controls.feetDown;
      if (controls.feetDown) this.pushLocked = true;
      return { forces: [], popped: null, caught: false, loading: false, grind: null };
    }
    this.assist = this.config.assist;
    this.groundYM = input.groundBelowYM ?? 0;
    this.edges = input.edgesNear ?? [];
    this.grind.tick(dtS);
    const keys = this.readKeys(controls);
    this.clockS += dtS;
    for (const id of FOOT_IDS) {
      const swipe = this.swipes[id].step(keys[id].side, dtS);
      if (swipe !== null) this.lastSwipe[id] = { swipe, endS: this.clockS };
    }
    const feetDownPressed = controls.feetDown && !this.feetDownBefore;
    const releasedNow = keys.released && !this.releasedBefore;
    this.feetDownBefore = controls.feetDown;
    this.releasedBefore = keys.released;
    this.pushCooldownS = Math.max(0, this.pushCooldownS - dtS);
    this.catchLockS = Math.max(0, this.catchLockS - dtS);
    this.sincePopS += dtS;
    this.sinceTouchdownS += dtS;
    for (const kick of KICKS) {
      if (!this.onKick(keys, kick)) this.pressFromS[kick] = null;
      else {
        this.pressFromS[kick] ??= this.clockS;
        const from = this.pressFromS[kick];
        // The pop foot back on its own kick after the pop (↓ for the tailslide) is a stance
        // key at once; the other kick's press (W is also the level) must be held a while.
        const minS = kick === this.popKick ? 0 : this.config.assist.stanceKeyMinHoldS;
        const afterPop = this.sincePopS >= this.config.assist.stanceKeyAfterPopS;
        if (this.clockS - from >= minS - 1e-9 && afterPop) this.pressHeldAtS[kick] = this.clockS;
      }
    }

    const grounded = board.grounded;
    if (!grounded && controls.feetDown) this.pushLocked = true;
    if (!controls.feetDown) this.pushLocked = false;
    // BOUND TO BAIL: a kick or the deck touching down outside the landing tolerance. No
    // controller fights it — the channels end, a buffered catch is dropped, nothing is
    // applied — and held a moment it is the bail (`Rider`).
    const { bail, tricks } = this.config;
    if (
      !this.grind.locked &&
      offAngleTouchUpDot(board, bail.touchdownMinAirS, tricks.landTiltRad) !== null
    ) {
      this.flipChannel.active = false;
      this.shoveChannel.active = false;
      this.catchRequestS = 0;
      this.catchArmed = false;
      this.wasGrounded = grounded;
      return { forces: [], popped: null, caught: false, loading: false, grind: null };
    }
    const frame = new BoardFrame(board, rider.headingRad);
    this.bodySpinAccelRadps2 =
      dtS > 0 ? (rider.bodySpinRateRadps - this.lastBodySpinRateRadps) / dtS : 0;
    this.lastBodySpinRateRadps = rider.bodySpinRateRadps;
    const out: FootForce[] = [];
    if (this.grind.locked) {
      // On the edge the lock owns the board: wheel contacts (a ledge top) are no landing.
      this.wasGrounded = grounded;
      return this.grinding(input, keys, frame, out, false);
    }
    if (grounded && !this.wasGrounded) {
      this.landAssistLeftS = this.config.tricks.landAssistS;
      this.sinceTouchdownS = 0;
      this.endAir();
    }
    if (!grounded && (this.wasGrounded || this.airStart === null)) {
      this.airStart = { positionM: board.transform.positionM, headingRad: rider.headingRad };
    }
    this.wasGrounded = grounded;
    this.landAssistLeftS = Math.max(0, this.landAssistLeftS - dtS);

    if (!grounded && this.tryLock(input, keys, frame)) {
      return this.grinding(input, keys, frame, out, true);
    }

    let popped: Kick | null = null;
    let caught = false;
    if (grounded) {
      // LATE CATCH (assists): Space just after touchdown is the catch, not a push.
      if (feetDownPressed && this.sinceTouchdownS <= this.assist.catchLateS) {
        this.pushLocked = true;
        caught = this.lateCatch(rider, board);
      }
      popped = this.ground(input, keys, frame, out);
      if (this.landAssistLeftS > 0) this.landAssist(input.mass, frame, out);
    } else {
      // A load carried off a lip (a kicker, a ledge, the stairs): the pop still counts just
      // past it (`popLipGraceS`: the stick's release lag), then the load is dropped — it
      // never pops later, at the next touchdown.
      if (this.loadKick !== null) {
        if ((board.airtimeS ?? 0) <= this.config.tricks.popLipGraceS + 1e-9) {
          popped = this.loadAndPop(input, keys, frame, out);
        } else this.clearLoad();
      }
      this.air(input, keys, frame, out);
      this.trackAirLoad(keys, dtS);
      // A catch attempt: Space pressed (or, in easy mode, every foot key let go). With the
      // CATCH BUFFER (assists) the press is held and fires at the best moment in the cone.
      const attempt = feetDownPressed || (this.config.tricks.autoCatchOnRelease && releasedNow);
      if (attempt && !this.caught) {
        if (this.assist.catchBufferS > 0) {
          this.catchRequestS = this.assist.catchBufferS;
          this.catchArmed = false;
        } else caught = this.tryCatch(rider, frame);
      }
      if (!this.caught && (this.catchRequestS > 0 || this.catchArmed)) {
        caught = this.bufferedCatch(input, frame);
      }
      this.catchRequestS = Math.max(0, this.catchRequestS - dtS);
      if (caught) this.catchRise(input, out);
      if (this.caught) {
        this.caughtS += dtS;
        if (!this.flipChannel.active && !this.shoveChannel.active) {
          this.catchAssist(input.mass, rider, frame, out);
        }
      }
    }
    return {
      forces: out,
      popped,
      caught,
      loading: this.loadKick !== null,
      grind: null,
      spinSnapHeadingRad: grounded ? null : this.spinSnap(input, frame),
      kickflipFlick: grounded ? null : this.kickflipFlick(keys),
    };
  }

  /**
   * The foot flicking a kickflip (visual, STYLE.md "Ankle tilt"): in a popped air, not
   * caught, the guide foot's stick toward the heel edge.
   */
  private kickflipFlick(keys: Keys): FootId | null {
    const kick = this.popKick;
    if (kick === null || this.caught) return null;
    const guide = guideFootOf(kick);
    return keys[guide].side < 0 ? guide : null;
  }

  // ── grinds and slides ─────────────────────────────────────────────────────

  /** LOCK-ON (MECHANICS.md M4): the stance comes from the board's yaw and the keys held. */
  private tryLock(input: FootForceInput, keys: Keys, frame: BoardFrame): boolean {
    const locked = this.grind.tryLock({
      board: input.board,
      edges: this.edges,
      tailHeld: this.pressHeld(keys, "tail"),
      noseHeld: this.pressHeld(keys, "nose"),
      facing: Vec3.dot(frame.forward, frame.riderForward) >= 0 ? 1 : -1,
      toe: toeSideSign(input.controls.stance),
      airStart: this.airStart,
      assist: this.assist,
    });
    if (locked) {
      // The tricks into the grind are over: the lock takes the board (the feet go on).
      const airLoad = this.airLoadKick;
      const airLoadS = this.airLoadS;
      this.endAir();
      this.clearLoad();
      this.lockedAtS = this.clockS;
      // POP-OUT BUFFER (assists): a load already held as the board lands in the grind is
      // kept (up to `popOutBufferS` of it), so the pop out can come right away.
      if (airLoad !== null && this.assist.popOutBufferS > 0) {
        this.loadKick = airLoad;
        this.loadS = Math.min(airLoadS, this.assist.popOutBufferS);
      }
    }
    return locked;
  }

  /**
   * One step on the edge: the pop out (the same load and release as on the ground; the
   * pop also leaves along the edge's outward normal), else the lock's assists. A roll off
   * the end leaves in the air with the feet on (caught); a fall off lets go.
   */
  private grinding(
    input: FootForceInput,
    keys: Keys,
    frame: BoardFrame,
    out: FootForce[],
    lockedNow: boolean,
  ): FootForceOutput {
    const { mass, rider, board } = input;
    const outward = this.grind.outward ?? Vec3.ZERO;
    const report = this.grind.report;
    const kick = lockedNow ? null : this.loadAndPop(input, keys, frame, out);
    if (kick !== null) {
      this.leftObstacleId = report?.obstacleId ?? null;
      this.poppedOut = true;
      this.grind.release();
      out.push(
        impulseAt(
          popFootOf(kick),
          "pop",
          Vec3.scale(outward, mass.massKg * this.config.grind.popOutSpeedMps),
          mass.centerOfMassWorldM,
        ),
      );
      this.airStart = { positionM: board.transform.positionM, headingRad: rider.headingRad };
      // The rider turns to line up with the travel after the pop (the pop out adds the
      // outward push): out of a slide that is a quarter turn back; forward is preferred,
      // fakie when that is clearly nearer.
      let realignRad = 0;
      const v = Vec3.add(
        board.linearVelocityMps,
        Vec3.scale(outward, this.config.grind.popOutSpeedMps),
      );
      if (Math.hypot(v.x, v.z) > this.config.torso.headingTravelMinSpeedMps) {
        realignRad = wrapPi(Math.atan2(-v.z, v.x) - rider.headingRad);
        if (Math.abs(realignRad) > Math.PI / 2 + this.config.tricks.landYawToleranceRad) {
          realignRad = wrapPi(realignRad - Math.PI);
        }
      }
      return {
        forces: out,
        popped: kick,
        caught: false,
        loading: false,
        grind: null,
        grindExit: "popOut",
        realignRad,
      };
    }
    // STANCE-KEY GRACE (assists): ↓ / W pressed just after the lock-in still picks the
    // stance (a 50-50 becomes a 5-0, a boardslide a tailslide).
    if (!lockedNow && this.clockS - this.lockedAtS <= this.assist.stanceKeyGraceS + 1e-9) {
      const tail = this.onKick(keys, "tail");
      const nose = this.onKick(keys, "nose");
      if (tail !== nose) this.grind.press(tail ? "tail" : "nose", board);
    }
    const lean = carveLean(input.controls, rider, this.config.stance.carveMinStickX);
    const toe = toeSideSign(input.controls.stance);
    const exit: GrindExit | null = this.grind.hold(
      {
        board,
        mass,
        edges: this.edges,
        dtS: input.dtS,
        leanToe: lean * toe,
        riderSide: frame.riderSide,
        toe,
        assist: this.assist,
      },
      out,
    );
    // Fell off: a bail. The lock let go this step and nothing is applied (ragdoll).
    if (exit === "fellOff") out.length = 0;
    if (exit !== null) {
      this.leftObstacleId = report?.obstacleId ?? null;
      this.airStart = { positionM: board.transform.positionM, headingRad: rider.headingRad };
      // Rolled off: the feet are still on, so the board is "caught" for the landing.
      this.caught = exit === "rollOff";
    }
    return {
      forces: out,
      popped: null,
      caught: lockedNow,
      loading: this.loadKick !== null,
      grind: this.grind.report,
      grindExit: exit,
    };
  }

  // ── keys ──────────────────────────────────────────────────────────────────

  private readKeys(controls: RiderControls): Keys {
    const { keyDownStick, releasedRadius } = this.config.tricks;
    const toe = toeSideSign(controls.stance);
    const read = (control: RiderControls["front"]): FootKeys => {
      const { stick, held } = control;
      const side = stick.x * toe;
      return {
        along: stick.y,
        side,
        edge: side >= keyDownStick ? 1 : side <= -keyDownStick ? -1 : 0,
        heldAlong: held === undefined ? null : Math.sign(held.y),
      };
    };
    const front = controls.front.stick;
    const back = controls.back.stick;
    return {
      front: read(controls.front),
      back: read(controls.back),
      released: stickMagnitude(front) <= releasedRadius && stickMagnitude(back) <= releasedRadius,
    };
  }

  /** The pop foot is on `kick` (↓ for the tail in regular, W for the nose). */
  private onKick(keys: Keys, kick: Kick): boolean {
    return keys[popFootOf(kick)].along * kickSign(kick) >= this.config.tricks.keyDownStick;
  }

  /** The pop foot has left `kick` (the pop), with an early threshold for a snappy pop. */
  private offKick(keys: Keys, kick: Kick): boolean {
    return keys[popFootOf(kick)].along * kickSign(kick) < this.config.tricks.popReleaseStick;
  }

  /** The pop foot's KEY on `kick` is still held (↓ for the tail), when the keys are known. */
  private kickKeyHeld(keys: Keys, kick: Kick): boolean {
    return keys[popFootOf(kick)].heldAlong === kickSign(kick);
  }

  /**
   * The guide foot is set: slid back toward the popping kick, like both feet crouching
   * over it (S for an ollie in regular, ↑ for a nollie).
   */
  private isSet(keys: Keys, kick: Kick): boolean {
    return keys[guideFootOf(kick)].along * kickSign(kick) >= this.config.tricks.keyDownStick;
  }

  // ── on the ground ─────────────────────────────────────────────────────────

  /**
   * Rolling, press, load and pop. Returns the kick when the pop fires.
   *
   * LOAD: pop foot on its kick + guide foot set toward the same kick (↓ + S) together.
   * Once loaded it stays loaded while the pop foot holds its kick (letting go of the set
   * does not matter). POP: the pop foot leaves the kick while loaded — release ↓, S still
   * held or not.
   */
  private ground(
    input: FootForceInput,
    keys: Keys,
    frame: BoardFrame,
    out: FootForce[],
  ): Kick | null {
    const popped = this.loadAndPop(input, keys, frame, out);
    if (popped !== null) return popped;
    const pressKick = this.loadKick === null ? this.pressKick(keys) : null;
    this.steer(input, frame, pressKick !== null);
    this.stance(input, frame, pressKick, out);
    if (pressKick !== null) {
      this.manual(pressKick, input.rider.headingRad, input.mass, frame, out);
    }
    this.push(input, frame, out);
    return null;
  }

  /** LOAD and POP (see `ground`); also the pop out of a grind. Returns the kick that popped. */
  private loadAndPop(
    input: FootForceInput,
    keys: Keys,
    frame: BoardFrame,
    out: FootForce[],
  ): Kick | null {
    const { tricks } = this.config;
    const dtS = input.dtS;
    const kick = this.loadKick;
    if (kick !== null) {
      // A loaded kick whose key is still held never pops, whatever its stick does: the pop
      // is the key being let go (a 360's ↓ + → loads like ↓ alone, even on an analog
      // stick whose diagonal reads ↓ at 0.71).
      const holding = this.loadS >= tricks.loadMinS && this.kickKeyHeld(keys, kick);
      if (this.offKick(keys, kick) && !holding) {
        const ready = this.loadS >= tricks.loadMinS;
        const loadS = this.loadS;
        this.clearLoad();
        if (ready) {
          this.pop(kick, loadS, input.rider, input.mass, frame, out);
          return kick;
        }
      } else if (this.isSet(keys, kick)) {
        // The pop grows with how long both were held together.
        this.loadS += dtS;
      }
      return null;
    }
    // The first kick to be loaded wins; checked tail first only to break an exact tie.
    for (const k of KICKS) {
      if (this.onKick(keys, k) && this.isSet(keys, k)) {
        this.loadKick = k;
        this.loadS = dtS;
        break;
      }
    }
    return null;
  }

  private clearLoad(): void {
    this.loadKick = null;
    this.loadS = 0;
  }

  /**
   * A press (manual): one pop foot on its kick with the other foot idle (no key), not
   * loaded. Both on their kicks at once: no press.
   */
  private pressKick(keys: Keys): Kick | null {
    const idle = (foot: FootKeys): boolean =>
      foot.edge === 0 && Math.abs(foot.along) < this.config.tricks.keyDownStick;
    const tail = this.onKick(keys, "tail") && idle(keys.front);
    const nose = this.onKick(keys, "nose") && idle(keys.back);
    if (tail === nose) return null;
    return tail ? "tail" : "nose";
  }

  /**
   * Standing weight at each attached foot, plus carving lean when both sticks lean to the
   * same edge (not while loading). Straight down (world), ON THE CENTRE LINE unless carving:
   * where a foot stands sideways (a lean) is visual only,
   * so a load never leans or steers the board. The carve lean shifts the weight toward the
   * leaning edge, inside the wheel line, so the board leans on its trucks but never tips.
   * In a press the guide foot carries no weight (the knee lifts).
   */
  private stance(
    { controls, rider, board }: FootForceInput,
    frame: BoardFrame,
    pressKick: Kick | null,
    out: FootForce[],
  ): void {
    const { stance } = this.config;
    // The foot keys' carve lean plus the Q / E steer, clamped to a full lean.
    const carve = carveLean(controls, rider, stance.carveMinStickX);
    const lean = this.loadKick !== null ? 0 : Math.max(-1, Math.min(1, carve + this.steerLean));
    // Weight acts into the ground the wheels roll on (−mean wheel normal): straight down on
    // the flat — also in a manual, where the deck's own −Y would thrust — and into the
    // slope on a bank or a wall, where world down would brake the light board.
    const down = Vec3.scale(supportNormal(board), -1);
    // The carve lean is in the rider frame (+Z side); map it onto the board's own Z.
    const boardSide = Transform.toWorldDirection(board.transform, Vec3.UNIT_Z);
    const facing = Math.sign(Vec3.dot(boardSide, frame.riderSide)) || 1;
    const across = lean * facing * stance.pressMaxAcrossM;
    for (const id of FOOT_IDS) {
      const foot = rider[id];
      if (foot.contact !== "attached") continue;
      if (pressKick !== null && id === guideFootOf(pressKick)) continue;
      const point = deckPointWorld(this.deck, board, {
        alongM: foot.deckPosition.alongM,
        acrossM: across,
      });
      const newtons = stance.standingPressN + Math.abs(lean) * stance.carveLeanN;
      out.push(forceAt(id, "press", Vec3.scale(down, newtons), point));
    }
  }

  /**
   * STEERING (MECHANICS.md "Body spin": Q / E on the ground, not loaded, not in a manual):
   * Q turns the travel left (counter-clockwise from above), E right, in both stances and
   * riding fakie. Through the SAME lean → truck steer path as carving: it eases a lean
   * target of ±`steerLeanFraction` in over `steerLeanResponseS` (added to the carve lean in
   * `stance`). The board curves toward the side it leans on whichever way it rolls, so the
   * lean goes to the right of the TRAVEL (fakie: the rider's left) for a right turn. No yaw
   * torque, no thrust.
   */
  private steer(
    { controls, board, dtS }: FootForceInput,
    frame: BoardFrame,
    pressed: boolean,
  ): void {
    const { steerLeanFraction, steerLeanResponseS } = this.config.stance;
    const turn = this.loadKick === null && !pressed ? (controls.spin ?? 0) : 0;
    let target = 0;
    if (turn !== 0) {
      // The travel: the board's horizontal velocity, or the rider's front when slow.
      const v = Vec3.create(board.linearVelocityMps.x, 0, board.linearVelocityMps.z);
      const travel =
        Vec3.length(v) > this.config.torso.headingTravelMinSpeedMps
          ? Vec3.normalize(v)
          : frame.riderForward;
      // Right of the travel seen from above (+X travel → +Z, screen right).
      const right = Vec3.cross(travel, Vec3.UNIT_Y);
      const side = Math.sign(Vec3.dot(right, frame.riderSide)) || 1;
      // E (spin +1) turns right: lean to the right of the travel.
      target = turn * side * steerLeanFraction;
    }
    const step = (steerLeanFraction / Math.max(1e-3, steerLeanResponseS)) * dtS;
    this.steerLean += Math.max(-step, Math.min(step, target - this.steerLean));
  }

  /**
   * PRESS (manual / nose manual): a PD holds the far end at `manualPitchRad` up (the tail
   * or the nose down), and keeps the board pointing along the rider heading. A capped
   * torque, never a force into the ground, so the kick may touch the ground but never
   * sinks into it.
   */
  private manual(
    kick: Kick,
    riderHeadingRad: number,
    mass: BoardMassProperties,
    frame: BoardFrame,
    out: FootForce[],
  ): void {
    const {
      manualPitchRad,
      manualOmegaRadps: w,
      manualMaxTorqueNm,
      manualYawOmegaRadps: wy,
    } = this.config.tricks;
    const accel =
      w * w * (manualPitchRad - frame.liftPitchRad(kick)) - 2 * w * frame.liftRateRadps(kick);
    // On two wheels the board steers badly (a nose manual grips ahead of its centre of mass
    // and wants to swap ends): the feet also hold it straight along the rider heading.
    const heading = boardHeadingRad(frame.board);
    const yawError = heading === null ? 0 : -axisErrorRad(heading - riderHeadingRad);
    const yawAccel = wy * wy * yawError - 2 * wy * frame.board.angularVelocityRadps.y;
    const torque = mass.angularInertiaTimes(
      Vec3.add(Vec3.scale(frame.liftAxis(kick), accel), Vec3.create(0, yawAccel, 0)),
    );
    const size = Vec3.length(torque);
    const capped = size > manualMaxTorqueNm ? Vec3.scale(torque, manualMaxTorqueNm / size) : torque;
    out.push(torqueOf(popFootOf(kick), "manual", capped));
  }

  /**
   * POP: a vertical impulse through the centre of mass that reaches the target height
   * (`popMinHeightM` → `popMaxHeightM` with the load), plus the snap: the far end's lift
   * rate set to `popPitchRateRadps`, about the board's own Z only (no roll, no yaw).
   */
  private pop(
    kick: Kick,
    loadS: number,
    rider: RiderState,
    mass: BoardMassProperties,
    frame: BoardFrame,
    out: FootForce[],
  ): void {
    const t = this.config.tricks;
    const foot = popFootOf(kick);
    const fraction = clamp01((loadS - t.loadMinS) / Math.max(1e-6, t.loadMaxS - t.loadMinS));
    const heightM = t.popMinHeightM + (t.popMaxHeightM - t.popMinHeightM) * fraction;
    const speedMps = Math.sqrt(2 * t.gravityMps2 * heightM);
    // Off a grind the pop is relative to the edge: sliding down a hubba does not eat it.
    const vy = frame.board.linearVelocityMps.y;
    const deltaMps = speedMps - (this.grind.locked ? vy : Math.max(0, vy));
    out.push(
      impulseAt(foot, "pop", Vec3.create(0, mass.massKg * deltaMps, 0), mass.centerOfMassWorldM),
    );
    const axis = frame.liftAxisLocal(kick);
    const snap = t.popPitchRateRadps - Vec3.dot(frame.board.angularVelocityRadps, axis);
    out.push(angularImpulseOf(foot, "pop", mass.angularInertiaTimes(Vec3.scale(axis, snap))));
    // The wind-up's spin carries over to the board: board and body leave turning together.
    const spinRate = (rider.windUpRad / t.windUpMaxRad) * t.windUpSpinRadps;
    if (spinRate !== 0) {
      const yaw = Vec3.create(0, spinRate - frame.board.angularVelocityRadps.y, 0);
      out.push(angularImpulseOf(foot, "pop", mass.angularInertiaTimes(yaw)));
    }
    this.popKick = kick;
    this.sincePopS = 0;
    this.popClockS = this.clockS;
    this.graceBackS.front = 0;
    this.graceBackS.back = 0;
    // The pop foot just left this kick: that press does not pick a grind stance.
    this.pressHeldAtS[kick] = Number.NEGATIVE_INFINITY;
    this.popSpeedMps = speedMps;
  }

  /**
   * Feet-down key on the ground (not one still held from a catch in the air), board on
   * its wheels, both feet on with sticks near neutral, not loading, below
   * `pushMaxSpeedMps`, cooldown elapsed: an impulse along the travel (the rider's heading,
   * or its reverse when rolling fakie) through the front foot. The only horizontal force the rider makes.
   */
  private push(
    { controls, rider, board }: FootForceInput,
    frame: BoardFrame,
    out: FootForce[],
  ): void {
    const { stance } = this.config;
    if (!controls.feetDown || this.pushLocked) return;
    if (this.pushCooldownS > 0 || this.loadKick !== null) return;
    if (rider.front.contact !== "attached" || rider.back.contact !== "attached") return;
    const neutral =
      stickMagnitude(controls.front.stick) <= stance.pushNeutralRadius &&
      stickMagnitude(controls.back.stick) <= stance.pushNeutralRadius;
    if (!neutral) return;
    // Along the travel: the rider's front, or its back when rolling fakie (from rest: front).
    const along = Vec3.dot(board.linearVelocityMps, frame.riderForward);
    const fakie = along < -this.config.torso.headingTravelMinSpeedMps;
    const heading = fakie ? Vec3.scale(frame.riderForward, -1) : frame.riderForward;
    if (Vec3.dot(board.linearVelocityMps, heading) >= stance.pushMaxSpeedMps) return;
    out.push(
      impulseAt(
        "front",
        "push",
        Vec3.scale(heading, stance.pushImpulseNs),
        deckPointWorld(this.deck, board, rider.front.deckPosition),
      ),
    );
    this.pushCooldownS = stance.pushCooldownS;
  }

  /** Right after touchdown: damp the vertical bounce and the rocking (pitch/roll). */
  private landAssist(mass: BoardMassProperties, frame: BoardFrame, out: FootForce[]): void {
    const { landAssist, landDampingPerS } = this.config.tricks;
    const board = frame.board;
    const vy = board.linearVelocityMps.y;
    if (vy > 0) {
      out.push(
        forceAt(
          "back",
          "land",
          Vec3.create(0, -mass.massKg * landAssist * landDampingPerS * vy, 0),
          mass.centerOfMassWorldM,
        ),
      );
    }
    const w = board.angularVelocityRadps;
    const rocking = Vec3.sub(w, Vec3.scale(frame.up, Vec3.dot(w, frame.up)));
    if (Vec3.lengthSq(rocking) === 0) return;
    out.push(
      torqueOf(
        "back",
        "land",
        mass.angularInertiaTimes(Vec3.scale(rocking, -landAssist * landDampingPerS)),
      ),
    );
  }

  // ── in the air ────────────────────────────────────────────────────────────

  private air(input: FootForceInput, keys: Keys, frame: BoardFrame, out: FootForce[]): void {
    const { tricks } = this.config;
    this.steerLean = 0;
    const { mass, dtS } = input;
    const kick = this.popKick;
    for (const id of FOOT_IDS) {
      const back = Math.abs(keys[id].side) < this.config.assist.graceLetGoStick;
      this.graceBackS[id] = back ? this.graceBackS[id] + dtS : 0;
    }
    if (kick !== null && !this.caught) {
      const guide = keys[guideFootOf(kick)];
      // Level: the guide foot slides toward the far end (W for an ollie, ↓ for a nollie).
      const levelKey = guide.along * -kickSign(kick) >= tricks.keyDownStick;
      if (levelKey && !this.levelling && this.sincePopS <= tricks.levelWindowS) {
        this.startLevel(kick, mass, frame, out);
      }
      // A swipe that ended since the pop, inside its window (the board may still have been
      // touching the ground for a step or two after the pop).
      const flick = this.flipped
        ? null
        : this.swipeSincePop(guideFootOf(kick), tricks.flickWindowS);
      const sweep = this.shoved ? null : this.swipeSincePop(popFootOf(kick), tricks.shoveWindowS);
      // POP-OUT FLOOR (assists): the first trick out of a grind gets enough air to finish.
      let timing = frame.board;
      if ((flick !== null || sweep !== null) && this.poppedOut && !this.floorDone) {
        this.floorDone = true;
        const turns = Math.max(flick?.units ?? 0, (sweep?.units ?? 0) / 2);
        timing = this.popOutFloor(kick, turns, mass, frame.board, out);
      }
      if (flick !== null) this.flip(kick, flick, input.controls, mass, frame, timing, out);
      if (sweep !== null) this.shove(kick, sweep, input.controls, mass, frame, timing, out);
    }
    if (kick !== null) this.magnet(input, keys, frame, out);
    if (kick !== null) {
      this.trackChannels(input.rider, frame, dtS);
      // Caught: a channel still turning rides in under the feet and ends at its target
      // (it has settled to `spinCoastRadps` there); then the catch correction takes over.
      if (this.caught) {
        for (const c of [this.flipChannel, this.shoveChannel]) {
          if (c.active && Math.abs(c.turnedRad) >= c.targetRad) {
            c.active = false;
            // The shove has turned the board under the body: the body follow re-picks
            // which way round (0 or π) it now sits.
            if (c === this.shoveChannel) this.followOffsetRad = null;
          }
        }
      }
      this.holdChannels(kick, input.rider, mass, frame, out);
    }
    if (!this.caught && !this.flipChannel.active && !this.shoveChannel.active) {
      this.followBody(input.rider, mass, frame, out);
    }
    // While flipping, the flip channel holds the pitch rate (levelling included).
    if (kick !== null && this.levelling && !this.caught && !this.flipChannel.active) {
      this.level(kick, mass, frame, out);
    }
    this.scoopS += dtS;
    if (kick !== null && !this.caught && !this.flipped && Number.isFinite(this.scoopS)) {
      this.scoop(kick, mass, frame, out);
    }
  }

  /**
   * Accumulates how far each running channel has turned: the flip's roll about the board's
   * long axis, the shove's yaw relative to the body (what the recognizer names).
   */
  private trackChannels(rider: RiderState, frame: BoardFrame, dtS: number): void {
    const board = frame.board;
    // ω = roll·f + yaw·Y + pitch·P (see `holdChannels`): recover roll and yaw.
    const along = Vec3.dot(board.angularVelocityRadps, frame.forward);
    const up = board.angularVelocityRadps.y;
    const fy = frame.forward.y;
    const det = Math.max(0.05, 1 - fy * fy);
    if (this.flipChannel.active) this.flipChannel.turnedRad += ((along - up * fy) / det) * dtS;
    if (this.shoveChannel.active) {
      const yawRate = (up - along * fy) / det;
      this.shoveChannel.turnedRad += (yawRate - rider.bodySpinRateRadps) * dtS;
    }
  }

  /**
   * `foot`'s last swipe if it ended at or after this air's pop, within `windowS` of it. With
   * the SWIPE GRACE (assists) also one that ended up to `swipeGraceS` before the pop, once
   * the foot is back near the middle (a key still held on that edge may be a pre-position).
   */
  private swipeSincePop(foot: FootId, windowS: number): Swipe | null {
    const last = this.lastSwipe[foot];
    if (last === null) return null;
    const beforePopS = this.popClockS - last.endS;
    if (beforePopS > 1e-9) {
      if (beforePopS > this.assist.swipeGraceS + 1e-9) return null;
      const back = this.graceBackS[foot] >= this.config.assist.graceLetGoS - 1e-9;
      return back && this.sincePopS <= windowS ? last.swipe : null;
    }
    return last.endS - this.popClockS <= windowS ? last.swipe : null;
  }

  /**
   * Time left to finish a trick: until the shared `trickEndS` (the first trick of the air
   * sets it to `completeFraction` of the predicted remaining airtime), at least
   * `minAirtimeS`.
   */
  private trickTimeS(board: BoardKinematics, completeFraction: number): number {
    if (!Number.isFinite(this.trickEndS)) {
      this.trickEndS = this.sincePopS + this.remainingAirtimeS(board) * completeFraction;
    }
    return Math.max(this.config.tricks.minAirtimeS, this.trickEndS - this.sincePopS);
  }

  /**
   * Holds the channel rates until the catch: the roll rate about the board's long axis
   * (flip), the yaw rate about world up — the shove's rate on top of the body's spin, or,
   * with no shove, the body follow (the feet keep the board under the turning body) — and,
   * while flipping, the pitch rate. A shove alone only sets the yaw rate (the scoop and the
   * level PD own the rest).
   */
  private holdChannels(
    kick: Kick,
    rider: RiderState,
    mass: BoardMassProperties,
    frame: BoardFrame,
    out: FootForce[],
  ): void {
    const flip = this.flipChannel;
    const shove = this.shoveChannel;
    // Touching anything (an edge, a kick) ends the tricks: the board is on its own.
    const { contacts } = frame.board;
    if (contacts.deck || contacts.tail || contacts.nose) {
      flip.active = false;
      shove.active = false;
    }
    if (!flip.active && !shove.active) return;
    const t = this.config.tricks;
    const { spinHoldAssist: k, levelAssist, levelOmegaRadps } = t;
    const w = frame.board.angularVelocityRadps;
    // Caught, the feet ride the spin in to its target and slow it to `catchRideInRadps`.
    const coast = this.caught ? t.catchRideInRadps : t.spinCoastRadps;
    const settle = (c: TrickChannel): number =>
      settledRate(c, Math.abs(c.rateRadps) / Math.max(1e-3, t.spinSettleS), coast);
    const yawRate = shove.active
      ? settle(shove) + rider.bodySpinRateRadps
      : this.followYawRate(rider, frame);
    if (!flip.active) {
      const delta = Vec3.create(0, k * (yawRate - w.y), 0);
      out.push(angularImpulseOf(popFootOf(kick), "shove", mass.angularInertiaTimes(delta)));
      return;
    }
    // Wanted ω = roll·f + yaw·Y + pitch·P (f = the board's long axis, P = the horizontal
    // pitch axis): roll·f turns the board about its own axis without moving it, yaw·Y turns
    // its heading, pitch·P tilts it. A rolling deck does not keep its ω by itself (its
    // inertia is not round), so all three are held: pitch 0, or the level assist's rate.
    const pitchRate = this.levelling ? -levelAssist * levelOmegaRadps * frame.frontPitchRad : 0;
    const wanted = Vec3.add(
      Vec3.add(Vec3.scale(frame.forward, settle(flip)), Vec3.create(0, yawRate, 0)),
      Vec3.scale(frame.pitchAxis, pitchRate),
    );
    const delta = Vec3.scale(Vec3.sub(wanted, w), k);
    out.push(angularImpulseOf(guideFootOf(kick), "flick", mass.angularInertiaTimes(delta)));
  }

  /**
   * BODY FOLLOW (MECHANICS.md "Body spin"): in the air, unless a shove is running, the feet
   * steer the board's yaw toward the rider heading — the nearer of 0° / 180° — so a body
   * 180 takes the board along, flipping or not. Yaw only (world up). While a flip runs, the
   * flip hold applies it as a rate (`followYawRate`); otherwise this yaw PD.
   */
  private followBody(
    rider: RiderState,
    mass: BoardMassProperties,
    frame: BoardFrame,
    out: FootForce[],
  ): void {
    const error = this.followErrorRad(rider, frame);
    if (error === null) return;
    const { bodyFollowOmegaRadps: w } = this.config.tricks;
    // The body's spin rate is fed forward.
    const rateError = rider.bodySpinRateRadps - frame.board.angularVelocityRadps.y;
    const accel = w * w * error + 2 * w * rateError;
    const torque = mass.angularInertiaTimes(Vec3.create(0, accel, 0));
    out.push(torqueOf("front", "body", torque));
  }

  /** The body follow as a yaw rate (for the flip hold): the body's rate plus a P term. */
  private followYawRate(rider: RiderState, frame: BoardFrame): number {
    const error = this.followErrorRad(rider, frame) ?? 0;
    return rider.bodySpinRateRadps + this.config.tricks.bodyFollowOmegaRadps * error;
  }

  /**
   * Board yaw error to the rider heading. Which way round the board sits under the rider
   * (0 or π) is fixed once per air, so a spin past 90° keeps pulling the same way. Null
   * while the long axis is too steep to have a heading.
   */
  private followErrorRad(rider: RiderState, frame: BoardFrame): number | null {
    const heading = boardHeadingRad(frame.board);
    if (heading === null) return null;
    this.followOffsetRad ??=
      Math.abs(wrapPi(heading - rider.headingRad)) > Math.PI / 2 ? Math.PI : 0;
    return wrapPi(rider.headingRad + this.followOffsetRad - heading);
  }

  /** LEVEL starts: from now the level PD runs; early in the window it adds height. */
  private startLevel(
    kick: Kick,
    mass: BoardMassProperties,
    frame: BoardFrame,
    out: FootForce[],
  ): void {
    const { levelWindowS, levelHeightBonus } = this.config.tricks;
    this.levelling = true;
    const early = clamp01(1 - this.sincePopS / levelWindowS);
    const extraMps = this.popSpeedMps * (Math.sqrt(1 + levelHeightBonus * early) - 1);
    if (extraMps <= 0 || frame.board.linearVelocityMps.y <= 0) return;
    out.push(
      impulseAt(
        guideFootOf(kick),
        "level",
        Vec3.create(0, mass.massKg * extraMps, 0),
        mass.centerOfMassWorldM,
      ),
    );
  }

  /** LEVEL: PD torque driving the board's pitch to 0, gain `levelAssist`. */
  private level(kick: Kick, mass: BoardMassProperties, frame: BoardFrame, out: FootForce[]): void {
    const { levelAssist, levelOmegaRadps: w } = this.config.tricks;
    const accel = levelAssist * (-w * w * frame.frontPitchRad - 2 * w * frame.frontPitchRateRadps);
    out.push(
      torqueOf(
        guideFootOf(kick),
        "level",
        mass.angularInertiaTimes(Vec3.scale(frame.pitchAxis, accel)),
      ),
    );
  }

  /**
   * KICKFLIP / HEELFLIP: the roll rate that completes the swipe's turns (1, or 2 for a
   * double) in `flipCompleteFraction` of the predicted remaining airtime, capped at
   * turns × `maxFlipRatePerTurnRadps` (so a late swipe under-rotates). The guide foot swipes
   * toward an edge and that edge goes down first: heel edge (kickflip) → roll −toeSide about
   * the board's nose axis (−X in regular), toe edge (heelflip) → the opposite; for an ollie
   * and a nollie alike.
   */
  private flip(
    kick: Kick,
    swipe: Swipe,
    controls: RiderControls,
    mass: BoardMassProperties,
    frame: BoardFrame,
    timing: BoardKinematics,
    out: FootForce[],
  ): void {
    const t = this.config.tricks;
    this.flipped = true;
    const turns = swipe.units;
    const timeS = this.trickTimeS(timing, t.flipCompleteFraction);
    const rate = alignedRate(
      turns * TAU,
      Math.min(turns * t.maxFlipRatePerTurnRadps, (turns * TAU) / timeS),
      this.shoveChannel,
    );
    // The rider's toe side, expressed on the board's own Z axis (the board may be backwards).
    const boardSide = Transform.toWorldDirection(frame.board.transform, Vec3.UNIT_Z);
    const facing = Math.sign(Vec3.dot(boardSide, frame.riderSide)) || 1;
    startChannel(
      this.flipChannel,
      swipe.edge * toeSideSign(controls.stance) * facing * rate,
      turns * TAU,
    );
    this.stopPitch(kick, guideFootOf(kick), "flick", mass, frame, out);
  }

  /**
   * A flick or shove replaces the guide foot's drag: the far end stops rising where it is
   * (its lift rate is cancelled), so the flipping or spinning board does not swing its kick
   * into the ground. Only an un-tricked pop keeps pitching (the sloppy ollie).
   */
  private stopPitch(
    kick: Kick,
    foot: FootId,
    label: FootForceLabel,
    mass: BoardMassProperties,
    frame: BoardFrame,
    out: FootForce[],
  ): void {
    const rate = frame.liftRateRadps(kick);
    if (rate <= 0) return;
    const delta = Vec3.scale(frame.liftAxis(kick), -rate);
    out.push(angularImpulseOf(foot, label, mass.angularInertiaTimes(delta)));
  }

  /**
   * SHOVE-IT: the yaw rate that turns the swipe's half turns (1 = 180°, 2 = 360°) in
   * `shoveCompleteFraction` of the predicted airtime, capped at half turns ×
   * `maxShoveRatePerHalfTurnRadps`. The pop foot's end swings toward the side it swipes
   * to: heel side = backside, toe side = frontside. About world up: yaw only.
   */
  private shove(
    kick: Kick,
    swipe: Swipe,
    controls: RiderControls,
    mass: BoardMassProperties,
    frame: BoardFrame,
    timing: BoardKinematics,
    out: FootForce[],
  ): void {
    const t = this.config.tricks;
    this.shoved = true;
    const halfTurns = swipe.units;
    const timeS = this.trickTimeS(timing, t.shoveCompleteFraction);
    const rate = alignedRate(
      halfTurns * Math.PI,
      Math.min(halfTurns * t.maxShoveRatePerHalfTurnRadps, (halfTurns * Math.PI) / timeS),
      this.flipChannel,
    );
    const wanted = Vec3.scale(frame.riderSide, swipe.edge * toeSideSign(controls.stance));
    const kickEnd = Vec3.scale(frame.riderForward, kickSign(kick));
    const sign = Math.sign(Vec3.dot(Vec3.cross(Vec3.UNIT_Y, kickEnd), wanted)) || 1;
    startChannel(this.shoveChannel, sign * rate, halfTurns * Math.PI);
    this.stopPitch(kick, popFootOf(kick), "shove", mass, frame, out);
    // The scoop lasts part of the spin; the board leans toward the side it is scooped to.
    this.scoopS = 0;
    this.scoopDurationS = ((halfTurns * Math.PI) / rate) * t.scoopDurationFraction;
    const boardSide = Transform.toWorldDirection(frame.board.transform, Vec3.UNIT_Z);
    this.scoopLeanSign = Math.sign(Vec3.dot(wanted, boardSide));
    this.scoopEndSign =
      (Math.sign(Vec3.dot(frame.forward, frame.riderForward)) || 1) * kickSign(kick);
  }

  /**
   * SCOOP: the pop foot scoops its kick down and around, so the shove spins tilted. A PD
   * tracks a half-sine: the far end up by `shoveScoopPitchRad` (the kick dips) and a lean
   * of `shoveScoopRollRad` toward the scoop side, peaking mid-scoop and back to level when
   * it ends (then it holds level until the catch). Angular only. Not while the board also
   * flips (a varial spins flat).
   */
  private scoop(kick: Kick, mass: BoardMassProperties, frame: BoardFrame, out: FootForce[]): void {
    const { shoveScoopPitchRad, shoveScoopRollRad, scoopOmegaRadps: w } = this.config.tricks;
    // Half-sine while scooping, then hold level until the catch or the landing.
    const scooping = this.scoopS <= this.scoopDurationS;
    const phase = (Math.PI * this.scoopS) / this.scoopDurationS;
    const shape = scooping ? Math.sin(phase) : 0;
    const shapeRate = scooping ? (Math.PI / this.scoopDurationS) * Math.cos(phase) : 0;
    const track = (angle: number, rate: number, amplitude: number): number =>
      w * w * (amplitude * shape - angle) + 2 * w * (amplitude * shapeRate - rate);
    // In the board's own frame (it spins under the rider): lifting the far end is a
    // rotation about board Z, positive when the scooped kick is the board's −X end.
    const board = frame.board;
    const boardSide = Transform.toWorldDirection(board.transform, Vec3.UNIT_Z);
    const lift = -this.scoopEndSign;
    const pitch = lift * Math.asin(Math.max(-1, Math.min(1, frame.forward.y)));
    const pitchRate = lift * Vec3.dot(board.angularVelocityRadps, boardSide);
    // Roll about the nose axis (ADR 0002): +roll takes +Z down, so side.y = −sin(roll).
    const roll = -Math.asin(Math.max(-1, Math.min(1, boardSide.y)));
    const rollRate = Vec3.dot(board.angularVelocityRadps, frame.forward);
    const lean = this.scoopLeanSign * shoveScoopRollRad;
    const accel = Vec3.add(
      Vec3.scale(boardSide, lift * track(pitch, pitchRate, shoveScoopPitchRad)),
      Vec3.scale(frame.forward, track(roll, rollRate, lean)),
    );
    out.push(torqueOf(popFootOf(kick), "shove", mass.angularInertiaTimes(accel)));
  }

  /**
   * Remaining airtime (ballistic) of the board centre falling back to its rest height plus
   * `landingMarginM` above the ground below it (probed: stairs, ramps), s.
   */
  private remainingAirtimeS(board: BoardKinematics): number {
    const { gravityMps2: g, landingMarginM, minAirtimeS } = this.config.tricks;
    let landingY = this.groundYM + restHeightM(this.deck) + landingMarginM;
    // A grind edge on the board's path is where it comes down (onto a rail, the hubba):
    // the path is the horizontal travel over the airtime to the ground.
    const p = board.transform.positionM;
    const v = board.linearVelocityMps;
    const groundAirS = airtimeTo(p.y - landingY, v.y, g);
    const path = Vec3.create(v.x * groundAirS, 0, v.z * groundAirS);
    for (const edge of this.edges) {
      if (edge.obstacleId === this.leftObstacleId) continue;
      const c = closestToPath(edge.startM, edge.endM, p, path);
      if (c === null || c.distanceM > this.config.grind.airtimeEdgeRadiusM) continue;
      // Only an edge the board rises above (its apex) can be landed on.
      if (c.edgeM.y + landingMarginM >= p.y + Math.max(0, v.y) ** 2 / (2 * g)) continue;
      landingY = Math.max(landingY, c.edgeM.y + landingMarginM);
    }
    return Math.max(airtimeTo(p.y - landingY, v.y, g), minAirtimeS);
  }

  // ── catch ─────────────────────────────────────────────────────────────────

  /**
   * Feet down in the air: caught if the board is inside the cone (`catchConeMiss`); then
   * the correction starts (`beginCatch`). Outside, the next try is locked out for
   * `catchRetryS`, so mashing Space does not work.
   */
  private tryCatch(rider: RiderState, frame: BoardFrame): boolean {
    if (this.catchLockS > 0) return false;
    if (this.catchConeMiss(rider, frame) !== null) {
      this.catchLockS = this.config.tricks.catchRetryS;
      return false;
    }
    this.beginCatch();
    return true;
  }

  /**
   * THE CATCH CONE (MECHANICS.md "Catch": feet, not magic): which limit the board is
   * outside of, or null when the feet can grab it — roll within `catchRollRad` of upright,
   * pitch within `catchPitchRad`, yaw within `catchYawRad` of 0°/180° from the rider
   * heading, and |ω| below `catchMaxOmegaRadps`. Pure: it has no side effects.
   */
  private catchConeMiss(rider: RiderState, frame: BoardFrame): CatchMiss | null {
    const t = this.config.tricks;
    const e = attitudeErrors(rider, frame);
    if (e === null || Math.abs(e.rollRad) > t.catchRollRad) return "roll";
    if (Math.abs(e.pitchRad) > t.catchPitchRad) return "pitch";
    if (Math.abs(e.yawRad) > t.catchYawRad) return "yaw";
    if (Vec3.length(frame.board.angularVelocityRadps) >= t.catchMaxOmegaRadps) return "spin";
    return null;
  }

  /** The feet are on. The correction starts once no channel is still turning. */
  private beginCatch(): void {
    this.caught = true;
    this.caughtS = 0;
    this.catchLeftover = null;
  }

  /**
   * The catch closes the gap between the soles and the grip mostly by the BOARD rising into
   * the feet, like a real catch: a vertical impulse through the centre of mass that covers
   * `catchRiseFraction` of the mean gap over `catchReachS` (capped). Never horizontal.
   */
  private catchRise({ rider, board, mass }: FootForceInput, out: FootForce[]): void {
    const { catchRiseFraction, catchMaxRiseMps } = this.config.tricks;
    const { catchReachS } = this.config.feet;
    let gapM = 0;
    for (const id of FOOT_IDS) {
      const foot = rider[id];
      gapM += foot.positionWorldM.y - deckPointWorld(this.deck, board, foot.deckPosition).y;
    }
    gapM /= FOOT_IDS.length;
    if (gapM <= 0) return;
    const riseMps = Math.min(catchMaxRiseMps, (catchRiseFraction * gapM) / catchReachS);
    out.push(
      impulseAt(
        "front",
        "catch",
        Vec3.create(0, mass.massKg * riseMps, 0),
        mass.centerOfMassWorldM,
      ),
    );
  }

  /**
   * CATCH CORRECTION (gain `catchAssist`): a PD toward level and the nearest 0°/180° of the
   * rider heading, minus the error it may not fix (`beginCatch`), settling over about
   * `catchSettleS`. TORQUE-LIMITED: the angular acceleration is capped at
   * `catchMaxAlphaRadps2`, eased in while the feet reach the deck (`feet.catchReachS`), so
   * nothing snaps and a spin damps out instead of stopping dead. Acts until the landing.
   */
  private catchAssist(
    mass: BoardMassProperties,
    rider: RiderState,
    frame: BoardFrame,
    out: FootForce[],
  ): void {
    const { catchAssist, catchSettleS, catchMaxAlphaRadps2 } = this.config.tricks;
    const e = attitudeErrors(rider, frame);
    if (e === null) return;
    // The correction may fix at most `catchMaxCorrectionRad` of each axis' error at its
    // start; the rest is left for the landing to judge.
    if (this.catchLeftover === null) {
      const c = this.config.tricks.catchMaxCorrectionRad;
      const leftover = (v: number): number => v - Math.max(-c, Math.min(c, v));
      this.catchLeftover = {
        rollRad: leftover(e.rollRad),
        pitchRad: leftover(e.pitchRad),
        yawRad: leftover(e.yawRad),
      };
    }
    // Critically damped, settling (to ≈ 2 %) over catchSettleS.
    const w = 5.8 / Math.max(1e-3, catchSettleS);
    const side = Transform.toWorldDirection(frame.board.transform, Vec3.UNIT_Z);
    const left = this.catchLeftover;
    // Errors are "how far to turn to fix it": about the long axis (roll), the side axis
    // (pitch) and world up (yaw).
    const axes: readonly [Vec3, number][] = [
      [frame.forward, e.rollRad - left.rollRad],
      [side, e.pitchRad - left.pitchRad],
      [Vec3.UNIT_Y, e.yawRad - left.yawRad],
    ];
    // Damping of the spin relative to the body: the feet turn with a body still spinning.
    const relative = Vec3.sub(
      frame.board.angularVelocityRadps,
      Vec3.create(0, rider.bodySpinRateRadps, 0),
    );
    let accel = Vec3.scale(relative, -2 * w);
    for (const [axis, error] of axes) accel = Vec3.add(accel, Vec3.scale(axis, w * w * error));
    accel = Vec3.scale(accel, catchAssist);
    const reach = clamp01(this.caughtS / Math.max(1e-3, this.config.feet.catchReachS));
    const cap = catchMaxAlphaRadps2 * reach * reach * (3 - 2 * reach);
    const size = Vec3.length(accel);
    if (size > cap) accel = size > 0 ? Vec3.scale(accel, cap / size) : accel;
    // The feet stand in the rider frame: a body still spinning (easing out) carries the
    // board with it. That part is the body's, not a correction, so it is not capped.
    accel = Vec3.add(accel, Vec3.create(0, this.bodySpinAccelRadps2, 0));
    out.push(torqueOf("front", "catch", mass.angularInertiaTimes(accel)));
  }

  // ── assists (MECHANICS.md "Assists", ADR 0012) ────────────────────────────

  /**
   * ↓ / W (the pop foot on `kick`) held now, or within `stanceKeyGraceS` before now; the
   * pop foot's own kick pressed at any time in this air (from `stanceKeyAfterPopS` after the
   * pop) also counts.
   */
  private pressHeld(keys: Keys, kick: Kick): boolean {
    const graceS = this.assist.stanceKeyGraceS;
    if (this.onKick(keys, kick)) return true;
    if (graceS <= 0) return false;
    if (kick === this.popKick && this.pressHeldAtS[kick] >= this.popClockS) return true;
    return this.clockS - this.pressHeldAtS[kick] <= graceS + 1e-9;
  }

  /** POP-OUT BUFFER: how long a load (pop foot on a kick + the set) has been held in the air. */
  private trackAirLoad(keys: Keys, dtS: number): void {
    const kick = KICKS.find((k) => this.onKick(keys, k) && this.isSet(keys, k)) ?? null;
    if (kick !== null && (this.airLoadKick === null || this.airLoadKick === kick)) {
      this.airLoadKick = kick;
      this.airLoadS += dtS;
    } else {
      this.airLoadKick = null;
      this.airLoadS = 0;
    }
  }

  /**
   * CATCH BUFFER: a held Space fires once the board is in the cone AND at its best moment:
   * every running flip / shove near its target (the well-timed catch, so a combo is not
   * grabbed early at |ω| just under the cone's limit), or the touchdown close, or the
   * buffer running out. A board still short of its target waits while it stays in the cone.
   */
  private bufferedCatch(input: FootForceInput, frame: BoardFrame): boolean {
    if (this.catchConeMiss(input.rider, frame) !== null) {
      // Left the cone before its moment came: the press is spent.
      this.catchArmed = false;
      return false;
    }
    this.catchArmed = true;
    if (!this.catchReady(frame.board)) return false;
    this.catchRequestS = 0;
    this.catchArmed = false;
    this.beginCatch();
    return true;
  }

  private catchReady(board: BoardKinematics): boolean {
    const a = this.config.assist;
    const left = (c: TrickChannel): number => Math.max(0, c.targetRad - Math.abs(c.turnedRad));
    const flip = this.flipChannel;
    const shove = this.shoveChannel;
    const settled =
      (!flip.active || left(flip) <= a.catchFireFlipLeftRad) &&
      (!shove.active || left(shove) <= a.catchFireShoveLeftRad);
    return settled || this.remainingAirtimeS(board) <= a.catchFireAirLeftS;
  }

  /**
   * LATE CATCH: Space just after touchdown. The board on its wheels and within the landing
   * tilt with a foot off: the feet go on (caught). Never a push.
   */
  private lateCatch(rider: RiderState, board: BoardKinematics): boolean {
    if (rider.front.contact === "attached" && rider.back.contact === "attached") return false;
    const upDot = Vec3.dot(boardUp(board), supportNormal(board));
    return board.grounded && upDot >= Math.cos(this.config.tricks.landTiltRad);
  }

  /**
   * POP-OUT FLOOR: a pop out that starts a flip / shove gets just enough extra VERTICAL
   * speed (an impulse through the centre of mass) for `turns` × `popOutMinAirPerTurnS` of
   * predicted air. Returns the board as the trick timing should see it.
   */
  private popOutFloor(
    kick: Kick,
    turns: number,
    mass: BoardMassProperties,
    board: BoardKinematics,
    out: FootForce[],
  ): BoardKinematics {
    const floorS = turns * this.assist.popOutMinAirPerTurnS;
    if (floorS <= 0) return board;
    const airS = this.remainingAirtimeS(board);
    if (airS >= floorS) return board;
    const g = this.config.tricks.gravityMps2;
    const v = board.linearVelocityMps;
    // Height above the landing that gives `airS` at vy, then the vy that gives `floorS`.
    const heightM = (g * airS * airS) / 2 - v.y * airS;
    const vy = (g * floorS * floorS) / 2 / floorS - heightM / floorS;
    if (vy <= v.y) return board;
    out.push(
      impulseAt(
        popFootOf(kick),
        "pop",
        Vec3.create(0, mass.massKg * (vy - v.y), 0),
        mass.centerOfMassWorldM,
      ),
    );
    return { ...board, linearVelocityMps: Vec3.create(v.x, vy, v.z) };
  }

  /**
   * Grind edges the board's path comes down onto, with when (s from now) and where the
   * board centre will be then, square to the edge (m, + = outward for a one-sided edge).
   */
  private approaches(board: BoardKinematics): EdgeApproach[] {
    const a = this.config.assist;
    const g = this.config.tricks.gravityMps2;
    const p = board.transform.positionM;
    const v = board.linearVelocityMps;
    const out: EdgeApproach[] = [];
    for (const edge of this.edges) {
      if (edge.obstacleId === this.leftObstacleId) continue;
      const d = Vec3.sub(edge.endM, edge.startM);
      const lengthH = Math.hypot(d.x, d.z);
      if (lengthH < 1e-6) continue;
      const alongH = Vec3.create(d.x / lengthH, 0, d.z / lengthH);
      let acrossH = Vec3.create(-alongH.z, 0, alongH.x);
      if (!edge.twoSided && Vec3.dot(acrossH, edge.outwardNormal) < 0) {
        acrossH = Vec3.scale(acrossH, -1);
      }
      // The first moment, coming down, that the board centre is at the edge's height
      // (plus `approachCentreAboveM`) over the segment; only if it has risen above it.
      const apexY = p.y + Math.max(0, v.y) ** 2 / (2 * g);
      for (let t = 0; t <= a.approachHorizonS; t += a.approachStepS) {
        if (v.y - g * t > 0) continue;
        const rel = Vec3.create(p.x + v.x * t - edge.startM.x, 0, p.z + v.z * t - edge.startM.z);
        const s = Vec3.dot(rel, alongH);
        const offsetM = Vec3.dot(rel, acrossH);
        if (s < 0 || s > lengthH || Math.abs(offsetM) > a.approachMaxOffsetM) continue;
        const edgeY = edge.startM.y + (d.y * s) / lengthH + a.approachCentreAboveM;
        if (apexY < edgeY) break;
        if (p.y + v.y * t - (g * t * t) / 2 > edgeY) continue;
        out.push({ edge, alongH, acrossH, arrivalS: t, offsetM });
        break;
      }
    }
    return out;
  }

  /**
   * LOCK-ON MAGNETISM: while airborne after a pop, a grind edge the board comes down onto
   * within `magnetReachM` sideways of a spot where it can lock pulls it there: a gentle
   * sideways velocity nudge (square to the travel, so the speed along the path is kept),
   * at most `magnetMaxMps` net, changing at most `magnetAccelMps2`.
   */
  private magnet(input: FootForceInput, keys: Keys, frame: BoardFrame, out: FootForce[]): void {
    const a = this.assist;
    if (a.magnetMaxMps <= 0 || a.magnetReachM <= 0) return;
    // Only once the stance is settled: no flip or shove still turning, no body spin (the
    // board's attitude at the lock, and so the spot to aim for, is known).
    if (this.flipChannel.active || this.shoveChannel.active) return;
    const spinning =
      Math.abs(input.controls.spin ?? 0) >= this.config.assist.spinSnapReleasedStick ||
      Math.abs(input.rider.bodySpinRateRadps) > this.config.assist.spinSnapMinRateRadps;
    if (spinning) return;
    const board = frame.board;
    const v = board.linearVelocityMps;
    const speed = Math.hypot(v.x, v.z);
    if (speed < this.config.torso.headingTravelMinSpeedMps) return;
    const side = Vec3.create(-v.z / speed, 0, v.x / speed);
    const nudge = Vec3.dot(this.magnetMps, side);
    let want = nudge;
    let best = Number.POSITIVE_INFINITY;
    for (const ap of this.approaches(board)) {
      const target = this.lockSpotM(ap, keys, frame);
      const shift = target - ap.offsetM;
      const gain = Vec3.dot(side, ap.acrossH);
      if (Math.abs(shift) > a.magnetReachM || Math.abs(gain) < 0.3) continue;
      // Only on the final approach, when the stance it comes down in is clear.
      if (ap.arrivalS > this.config.assist.magnetLeadS) continue;
      if (Math.abs(shift) >= best) continue;
      best = Math.abs(shift);
      want = nudge + shift / (gain * Math.max(ap.arrivalS, 2 * input.dtS));
    }
    want = Math.max(-a.magnetMaxMps, Math.min(a.magnetMaxMps, want));
    const step = this.config.assist.magnetAccelMps2 * input.dtS;
    const dv = Math.max(-step, Math.min(step, want - nudge));
    if (Math.abs(dv) < 1e-6) return;
    this.magnetMps = Vec3.add(this.magnetMps, Vec3.scale(side, dv));
    out.push(
      impulseAt(
        "front",
        "magnet",
        Vec3.scale(side, input.mass.massKg * dv),
        input.mass.centerOfMassWorldM,
      ),
    );
  }

  /**
   * Where (square to the edge, m) the board centre should come down to lock in the stance
   * it is heading for: along the edge (a grind) the trucks on it; across (a slide) the
   * deck middle on it, or the tail / nose (↓ / W held). The stance is the board's yaw to
   * the edge (the magnet only acts once flips, shoves and body spins are done).
   */
  private lockSpotM(ap: EdgeApproach, keys: Keys, frame: BoardFrame): number {
    const a = this.config.assist;
    const g = this.config.grind;
    const d = ap.offsetM;
    const heading = boardHeadingRad(frame.board);
    const edgeHeading = Math.atan2(-ap.alongH.z, ap.alongH.x);
    const across = heading !== null && Math.abs(Math.sin(heading - edgeHeading)) > Math.SQRT1_2;
    const tail = this.pressHeld(keys, "tail");
    const nose = this.pressHeld(keys, "nose");
    const kickSlide = tail !== nose;
    const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));
    const grind = clamp(d, -a.magnetGrindBandM, a.magnetGrindBandM);
    const halfL = this.deck.deck.lengthM / 2;
    const slide = kickSlide
      ? (Math.sign(d) || 1) *
        clamp(Math.abs(d), g.kickPartFromM + a.magnetSlideMarginM, halfL - a.magnetSlideMarginM)
      : clamp(
          d,
          a.magnetSlideMarginM - g.boardslideHalfM,
          g.boardslideHalfM - a.magnetSlideMarginM,
        );
    return across ? slide : grind;
  }

  /**
   * QUARTER-TURN HELPER: a body spin released (in the air, a grind edge ahead) where it
   * would stop within `spinSnapRad` of a stance angle to the edge (0°, 90°, …) eases to a
   * stop exactly on it. Returns that rider heading, or null.
   */
  private spinSnap(input: FootForceInput, frame: BoardFrame): number | null {
    const snapRad = this.assist.spinSnapRad;
    const { rider, controls } = input;
    const rate = rider.bodySpinRateRadps;
    const held = Math.abs(controls.spin ?? 0) >= this.config.assist.spinSnapReleasedStick;
    if (snapRad <= 0 || this.grind.locked || held) {
      this.snapHeadingRad = null;
      return null;
    }
    if (this.snapHeadingRad !== null) return this.snapHeadingRad;
    if (Math.abs(rate) < this.config.assist.spinSnapMinRateRadps) return null;
    const ap = this.approaches(frame.board)[0];
    if (ap === undefined) return null;
    const stop =
      rider.headingRad + (rate * Math.abs(rate)) / (2 * this.config.tricks.bodySpinAccelRadps2);
    const edgeHeading = Math.atan2(-ap.alongH.z, ap.alongH.x);
    const quarter = Math.PI / 2;
    const nearest = edgeHeading + Math.round((stop - edgeHeading) / quarter) * quarter;
    if (Math.abs(stop - nearest) > snapRad) return null;
    this.snapHeadingRad = wrapPi(nearest);
    return this.snapHeadingRad;
  }

  private endAir(): void {
    this.leftObstacleId = null;
    this.popKick = null;
    this.sincePopS = Number.POSITIVE_INFINITY;
    this.popSpeedMps = 0;
    this.levelling = false;
    this.flipped = false;
    this.shoved = false;
    this.flipChannel.active = false;
    this.shoveChannel.active = false;
    this.trickEndS = Number.POSITIVE_INFINITY;
    this.followOffsetRad = null;
    this.scoopS = Number.POSITIVE_INFINITY;
    this.caught = false;
    this.caughtS = 0;
    this.catchLockS = 0;
    this.catchRequestS = 0;
    this.catchArmed = false;
    this.poppedOut = false;
    this.floorDone = false;
    this.magnetMps = Vec3.ZERO;
    this.snapHeadingRad = null;
    this.airLoadKick = null;
    this.airLoadS = 0;
  }
}

const KICKS: readonly Kick[] = ["tail", "nose"];

/** A grind edge the board's path comes down onto (assists: magnetism, spin snap). */
interface EdgeApproach {
  readonly edge: GrindEdgeView;
  /** Horizontal units along the edge and square to it (outward for a one-sided edge). */
  readonly alongH: Vec3;
  readonly acrossH: Vec3;
  /** When the board centre comes down to the edge's height, s from now. */
  readonly arrivalS: number;
  /** Where the board centre is then, square to the edge along `acrossH`, m. */
  readonly offsetM: number;
}

/** Which catch-cone limit the board is outside of (`TrickController.catchConeMiss`). */
export type CatchMiss = "roll" | "pitch" | "yaw" | "spin";

/**
 * The board's attitude error, rad, as "how far to turn to fix it": about its long axis
 * (roll, to upright), its side axis (pitch, to level) — both against the support normal —
 * and world up (yaw, to the nearest 0°/180° of the rider heading).
 */
interface AttitudeErrors {
  readonly rollRad: number;
  readonly pitchRad: number;
  readonly yawRad: number;
}

/** Null while the long axis is too steep to have a heading. */
function attitudeErrors(rider: RiderState, frame: BoardFrame): AttitudeErrors | null {
  const heading = boardHeadingRad(frame.board);
  if (heading === null) return null;
  const side = Transform.toWorldDirection(frame.board.transform, Vec3.UNIT_Z);
  const n = frame.support;
  const levelError = Vec3.cross(frame.up, n);
  const upDot = Vec3.dot(frame.up, n);
  return {
    // Signed angle about each axis that takes the board's up onto the support normal
    // (atan2, so an upside-down board reads ≈ ±π, never small).
    rollRad: Math.atan2(Vec3.dot(levelError, frame.forward), upDot),
    pitchRad: Math.atan2(Vec3.dot(levelError, side), upDot),
    yawRad: -axisErrorRad(heading - rider.headingRad),
  };
}

/** Ballistic time to fall `heightM` (≥ 0) starting at vertical speed `vy`, s. */
function airtimeTo(heightM: number, vy: number, g: number): number {
  const h = Math.max(0, heightM);
  return (vy + Math.sqrt(vy * vy + 2 * g * h)) / g;
}

/**
 * The point of segment [a, b] closest (horizontally) to the path from `p` along `path`
 * (horizontal), and that horizontal distance; null for a degenerate segment. Sampled
 * along the edge: edges are short and this runs once per trick.
 */
function closestToPath(
  a: Vec3,
  b: Vec3,
  p: Vec3,
  path: Vec3,
): { edgeM: Vec3; distanceM: number } | null {
  if (Vec3.distance(a, b) < 1e-6) return null;
  const pathSq = path.x * path.x + path.z * path.z;
  let best: { edgeM: Vec3; distanceM: number } | null = null;
  const samples = 32;
  for (let i = 0; i <= samples; i += 1) {
    const e = Vec3.lerp(a, b, i / samples);
    const t =
      pathSq < 1e-9
        ? 0
        : Math.max(0, Math.min(1, ((e.x - p.x) * path.x + (e.z - p.z) * path.z) / pathSq));
    const distanceM = Math.hypot(e.x - (p.x + path.x * t), e.z - (p.z + path.z * t));
    if (best === null || distanceM < best.distanceM) best = { edgeM: e, distanceM };
  }
  return best;
}
const TAU = 2 * Math.PI;

/** One trick channel (flip or shove): see `TrickController.flipChannel`. */
interface TrickChannel {
  active: boolean;
  /** Held rate, rad/s (signed: roll about board X, or yaw about world Y). */
  rateRadps: number;
  /** Its target (N turns / half turns), rad, and how far it has turned so far, rad (signed). */
  targetRad: number;
  turnedRad: number;
}

function newChannel(): TrickChannel {
  return { active: false, rateRadps: 0, targetRad: 0, turnedRad: 0 };
}

function startChannel(channel: TrickChannel, rateRadps: number, targetRad: number): void {
  channel.active = true;
  channel.rateRadps = rateRadps;
  channel.targetRad = targetRad;
  channel.turnedRad = 0;
}

/**
 * Flip and shove finish TOGETHER (a varial, a tre flip): a channel starting while the other
 * runs takes the later of the two finishing times — it slows down to the other's, or the
 * other slows down to its own (a capped flip is slower than its shove). Returns the new
 * channel's rate magnitude.
 */
function alignedRate(targetRad: number, rateRadps: number, other: TrickChannel): number {
  if (!other.active || rateRadps <= 0) return rateRadps;
  const otherLeftRad = Math.max(0, other.targetRad - Math.abs(other.turnedRad));
  const otherS = otherLeftRad / Math.max(1e-6, Math.abs(other.rateRadps));
  const selfS = targetRad / rateRadps;
  if (otherS > selfS) return targetRad / otherS;
  if (otherLeftRad > 0) other.rateRadps = (Math.sign(other.rateRadps) * otherLeftRad) / selfS;
  return rateRadps;
}

/**
 * SPIN SETTLE: the rate a channel holds now — its rate, easing down at `alpha` near the
 * target so it reaches it at `coast`, then `coast` past it (signed like the rate).
 */
function settledRate(channel: TrickChannel, alpha: number, coast: number): number {
  const left = Math.max(0, channel.targetRad - Math.abs(channel.turnedRad));
  const speed = Math.min(
    Math.abs(channel.rateRadps),
    Math.max(coast, Math.sqrt(coast * coast + 2 * alpha * left)),
  );
  return Math.sign(channel.rateRadps) * speed;
}

/** Signed lean in [-1, 1] (+ = toward +Z) when both feet lean the same way, else 0. */
function carveLean(controls: RiderControls, rider: RiderState, minStickX: number): number {
  if (rider.front.contact !== "attached" || rider.back.contact !== "attached") return 0;
  const fx = controls.front.stick.x;
  const bx = controls.back.stick.x;
  if (Math.sign(fx) !== Math.sign(bx)) return 0;
  const lean = Math.min(Math.abs(fx), Math.abs(bx));
  return lean >= minStickX ? Math.sign(fx) * lean : 0;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function forceAt(foot: FootId, label: FootForceLabel, forceN: Vec3, pointWorldM: Vec3): FootForce {
  return Object.freeze({ kind: "force", foot, label, forceN, pointWorldM });
}

function impulseAt(
  foot: FootId,
  label: FootForceLabel,
  impulseNs: Vec3,
  pointWorldM: Vec3,
): FootForce {
  return Object.freeze({ kind: "impulse", foot, label, impulseNs, pointWorldM });
}

function torqueOf(foot: FootId, label: FootForceLabel, torqueNm: Vec3): FootForce {
  return Object.freeze({ kind: "torque", foot, label, torqueNm });
}

function angularImpulseOf(foot: FootId, label: FootForceLabel, impulseNms: Vec3): FootForce {
  return Object.freeze({ kind: "angularImpulse", foot, label, impulseNms });
}
