import type { FootId, Kick } from "../../../shared";
import { FOOT_IDS, Quat, Transform, Vec3 } from "../../../shared";
import type { RiderConfig } from "../rider.config";
import {
  axisErrorRad,
  boardForward,
  boardHeadingRad,
  boardUp,
  deckPointWorld,
  restHeightM,
  tiltRad,
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
  RiderControls,
} from "./foot-force-model";
import { stickMagnitude, toeSideSign } from "./foot-placement";
import type { RiderState } from "./rider-state";

/** One foot's stick read as MECHANICS.md keys (stance resolved: toe/heel, not ±x). */
interface FootKeys {
  /** Stick along the rider's front (+1 = toward the nose end). */
  readonly along: number;
  /** Toward the toe edge (+1) / heel edge (−1) past the key threshold, else 0. */
  readonly edge: -1 | 0 | 1;
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
   * Horizontal axis a nose-up rotation of the rider-front end turns about, and that end's
   * elevation (rad, + = up) and pitch rate (rad/s) about it.
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
    // The board's long axis, pointed at the rider's front.
    const facing = Vec3.dot(this.forward, this.riderForward) >= 0 ? 1 : -1;
    const front = Vec3.scale(this.forward, facing);
    const flat = Vec3.normalize(Vec3.create(front.x, 0, front.z));
    this.pitchAxis = Vec3.lengthSq(flat) > 0 ? Vec3.cross(flat, Vec3.UNIT_Y) : this.riderSide;
    this.frontPitchRad = Math.asin(Math.max(-1, Math.min(1, front.y)));
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
 *   bonus), kickflip / heelflip (guide foot to the heel / toe edge: the roll rate that completes one turn
 *   over the predicted airtime), shove-it (pop foot sideways: yaw rate for 180°);
 * - catch (feet down in the air, inside the cone): a PD that kills the spin, levels the
 *   board and snaps the yaw to 0°/180°; outside the cone it is locked out `catchRetryS`;
 * - landing assist: damps bounce and rocking right after touchdown.
 *
 * No foot ever adds horizontal thrust: trick impulses are angular, plus the pop's
 * vertical impulse through the centre of mass. Only the push changes ground speed.
 */
export class TrickController implements FootForceModel {
  private wasGrounded = true;
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
   * until the catch. Each has its key, how long that key has been held, its target in turns
   * (1 or 2: a double flip / a 360 shove) and how far it has turned so far (rad, signed).
   */
  private readonly flipChannel = newChannel();
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
  private catchLockS = 0;
  private feetDownBefore = false;
  private releasedBefore = false;
  private landAssistLeftS = 0;
  private pushCooldownS = 0;
  /** Space held from the air (the catch) does not push after landing until released. */
  private pushLocked = false;

  constructor(
    private readonly deck: DeckGeometry,
    private readonly config: RiderConfig,
  ) {}

  reset(): void {
    this.wasGrounded = true;
    this.loadKick = null;
    this.loadS = 0;
    this.endAir();
    this.feetDownBefore = false;
    this.releasedBefore = false;
    this.landAssistLeftS = 0;
    this.pushCooldownS = 0;
    this.pushLocked = false;
  }

  computeForces(input: FootForceInput): FootForceOutput {
    const { controls, rider, board, dtS } = input;
    const keys = this.readKeys(controls);
    const feetDownPressed = controls.feetDown && !this.feetDownBefore;
    const releasedNow = keys.released && !this.releasedBefore;
    this.feetDownBefore = controls.feetDown;
    this.releasedBefore = keys.released;
    this.pushCooldownS = Math.max(0, this.pushCooldownS - dtS);
    this.catchLockS = Math.max(0, this.catchLockS - dtS);
    this.sincePopS += dtS;

    const grounded = board.grounded;
    if (!grounded && controls.feetDown) this.pushLocked = true;
    if (!controls.feetDown) this.pushLocked = false;
    if (grounded && !this.wasGrounded) {
      this.landAssistLeftS = this.config.tricks.landAssistS;
      this.endAir();
    }
    this.wasGrounded = grounded;
    this.landAssistLeftS = Math.max(0, this.landAssistLeftS - dtS);

    if (rider.bailed) {
      this.clearLoad();
      return { forces: [], popped: null, caught: false, loading: false };
    }

    const frame = new BoardFrame(board, rider.headingRad);
    const out: FootForce[] = [];
    let popped: Kick | null = null;
    let caught = false;
    if (grounded) {
      popped = this.ground(input, keys, frame, out);
      if (this.landAssistLeftS > 0) this.landAssist(input.mass, frame, out);
    } else {
      this.air(input, keys, frame, out);
      const attempt = feetDownPressed || (this.config.tricks.autoCatchOnRelease && releasedNow);
      if (attempt && !this.caught) caught = this.tryCatch(rider, frame);
      if (caught) this.catchRise(input, out);
      if (this.caught) this.catchAssist(input.mass, rider, frame, out);
    }
    return { forces: out, popped, caught, loading: this.loadKick !== null };
  }

  // ── keys ──────────────────────────────────────────────────────────────────

  private readKeys(controls: RiderControls): Keys {
    const { keyDownStick, releasedRadius } = this.config.tricks;
    const toe = toeSideSign(controls.stance);
    const read = (stick: { readonly x: number; readonly y: number }): FootKeys => {
      const side = stick.x * toe;
      return { along: stick.y, edge: side >= keyDownStick ? 1 : side <= -keyDownStick ? -1 : 0 };
    };
    const front = controls.front.stick;
    const back = controls.back.stick;
    return {
      front: read(front),
      back: read(back),
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
    const { tricks } = this.config;
    const dtS = input.dtS;
    const kick = this.loadKick;
    if (kick !== null) {
      if (this.offKick(keys, kick)) {
        const ready = this.loadS >= tricks.loadMinS;
        const loadS = this.loadS;
        this.clearLoad();
        if (ready) {
          this.pop(kick, loadS, input.mass, frame, out);
          return kick;
        }
      } else if (this.isSet(keys, kick)) {
        // The pop grows with how long both were held together.
        this.loadS += dtS;
      }
    } else {
      // The first kick to be loaded wins; checked tail first only to break an exact tie.
      for (const k of KICKS) {
        if (this.onKick(keys, k) && this.isSet(keys, k)) {
          this.loadKick = k;
          this.loadS = dtS;
          break;
        }
      }
    }
    const pressKick = this.loadKick === null ? this.pressKick(keys) : null;
    this.stance(input, frame, pressKick, out);
    if (pressKick !== null) {
      this.manual(pressKick, input.rider.headingRad, input.mass, frame, out);
    }
    this.push(input, frame, out);
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
    const lean = this.loadKick !== null ? 0 : carveLean(controls, rider, stance.carveMinStickX);
    // Weight acts straight down (world −Y): along a pitched deck's normal it would thrust.
    const down = Vec3.create(0, -1, 0);
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
    mass: BoardMassProperties,
    frame: BoardFrame,
    out: FootForce[],
  ): void {
    const t = this.config.tricks;
    const foot = popFootOf(kick);
    const fraction = clamp01((loadS - t.loadMinS) / Math.max(1e-6, t.loadMaxS - t.loadMinS));
    const heightM = t.popMinHeightM + (t.popMaxHeightM - t.popMinHeightM) * fraction;
    const speedMps = Math.sqrt(2 * t.gravityMps2 * heightM);
    const deltaMps = speedMps - Math.max(0, frame.board.linearVelocityMps.y);
    out.push(
      impulseAt(foot, "pop", Vec3.create(0, mass.massKg * deltaMps, 0), mass.centerOfMassWorldM),
    );
    const axis = frame.liftAxisLocal(kick);
    const snap = t.popPitchRateRadps - Vec3.dot(frame.board.angularVelocityRadps, axis);
    out.push(angularImpulseOf(foot, "pop", mass.angularInertiaTimes(Vec3.scale(axis, snap))));
    this.popKick = kick;
    this.sincePopS = 0;
    this.popSpeedMps = speedMps;
  }

  /**
   * Feet-down key on the ground (not one still held from a catch in the air), board on
   * its wheels, both feet on with sticks near neutral, not loading, below
   * `pushMaxSpeedMps`, cooldown elapsed: an impulse along the
   * rider's heading through the front foot. The only horizontal force the rider makes.
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
    const heading = frame.riderForward;
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
    const { mass, dtS } = input;
    const kick = this.popKick;
    if (kick !== null && !this.caught) {
      const guide = keys[guideFootOf(kick)];
      const pop = keys[popFootOf(kick)];
      // Level: the guide foot slides toward the far end (W for an ollie, ↓ for a nollie).
      const levelKey = guide.along * -kickSign(kick) >= tricks.keyDownStick;
      if (levelKey && !this.levelling && this.sincePopS <= tricks.levelWindowS) {
        this.startLevel(kick, mass, frame, out);
      }
      if (guide.edge !== 0 && !this.flipped && this.sincePopS <= tricks.flickWindowS) {
        this.flip(kick, guide.edge, input.controls, mass, frame, out);
      }
      if (pop.edge !== 0 && !this.shoved && this.sincePopS <= tricks.shoveWindowS) {
        this.shove(kick, pop.edge, input.controls, mass, frame, out);
      }
      this.trackChannels(guide.edge, pop.edge, frame, dtS);
      this.holdChannels(kick, mass, frame, out);
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
   * Accumulates each channel's rotation and upgrades it when its key is held long enough:
   * the flick key held ≥ `doubleFlickHoldS` → two flips, the sweep key held ≥
   * `shove360HoldS` → a 360 shove. The new rate covers what is left over the remaining
   * airtime (capped).
   */
  private trackChannels(
    flickEdge: number,
    sweepEdge: number,
    frame: BoardFrame,
    dtS: number,
  ): void {
    const t = this.config.tricks;
    const board = frame.board;
    // ω = roll·f + yaw·Y + pitch·P (see `holdChannels`): recover roll and yaw.
    const along = Vec3.dot(board.angularVelocityRadps, frame.forward);
    const up = board.angularVelocityRadps.y;
    const fy = frame.forward.y;
    const det = Math.max(0.05, 1 - fy * fy);
    const rollRate = (along - up * fy) / det;
    const yawRate = (up - along * fy) / det;
    const flip = this.flipChannel;
    if (flip.active) {
      flip.turnedRad += rollRate * dtS;
      flip.heldS = flip.holding && flickEdge === flip.key ? flip.heldS + dtS : flip.heldS;
      flip.holding = flip.holding && flickEdge === flip.key;
      if (flip.turns === 1 && flip.heldS >= t.doubleFlickHoldS) {
        this.upgrade(flip, 2 * TAU, t.flipCompleteFraction, t.maxFlipRateRadps, board);
      }
    }
    const shove = this.shoveChannel;
    if (shove.active) {
      shove.turnedRad += yawRate * dtS;
      shove.heldS = shove.holding && sweepEdge === shove.key ? shove.heldS + dtS : shove.heldS;
      shove.holding = shove.holding && sweepEdge === shove.key;
      if (shove.turns === 1 && shove.heldS >= t.shove360HoldS) {
        this.upgrade(shove, TAU, t.shoveCompleteFraction, t.maxShoveRateRadps, board);
      }
    }
  }

  private upgrade(
    channel: TrickChannel,
    totalRad: number,
    completeFraction: number,
    maxRateRadps: number,
    board: BoardKinematics,
  ): void {
    channel.turns = 2;
    const left = Math.max(0, totalRad - Math.abs(channel.turnedRad));
    const timeS = this.trickTimeS(board, completeFraction);
    channel.rateRadps = Math.sign(channel.rateRadps) * Math.min(maxRateRadps, left / timeS);
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
   * (flip) and the yaw rate about world up (shove; 0 while only flipping, so a flip does not
   * wander) and, while flipping, the pitch rate. A shove alone only sets the yaw rate (the
   * scoop and the level PD own the rest).
   */
  private holdChannels(
    kick: Kick,
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
    const { spinHoldAssist: k, levelAssist, levelOmegaRadps } = this.config.tricks;
    const w = frame.board.angularVelocityRadps;
    const yawRate = shove.active ? shove.rateRadps : 0;
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
      Vec3.add(Vec3.scale(frame.forward, flip.rateRadps), Vec3.create(0, yawRate, 0)),
      Vec3.scale(frame.pitchAxis, pitchRate),
    );
    const delta = Vec3.scale(Vec3.sub(wanted, w), k);
    out.push(angularImpulseOf(guideFootOf(kick), "flick", mass.angularInertiaTimes(delta)));
  }

  /**
   * BODY FOLLOW (MECHANICS.md "Body spin"): in the air, unless a flip or shove is running
   * (the feet are busy), the feet steer the board's yaw toward the rider heading — the
   * nearer of 0° / 180° — so a body 180 takes the board along. Yaw only (world up).
   */
  private followBody(
    rider: RiderState,
    mass: BoardMassProperties,
    frame: BoardFrame,
    out: FootForce[],
  ): void {
    const heading = boardHeadingRad(frame.board);
    if (heading === null) return;
    const { bodyFollowOmegaRadps: w } = this.config.tricks;
    // Which way round the board sits under the rider (0 or π) is fixed once per air, so a
    // spin past 90° keeps pulling the same way; the body's spin rate is fed forward.
    this.followOffsetRad ??=
      Math.abs(wrapPi(heading - rider.headingRad)) > Math.PI / 2 ? Math.PI : 0;
    const error = wrapPi(rider.headingRad + this.followOffsetRad - heading);
    const rateError = rider.bodySpinRateRadps - frame.board.angularVelocityRadps.y;
    const accel = w * w * error + 2 * w * rateError;
    const torque = mass.angularInertiaTimes(Vec3.create(0, accel, 0));
    out.push(torqueOf("front", "body", torque));
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
   * KICKFLIP / HEELFLIP: the roll rate that completes one turn in `flipCompleteFraction`
   * of the predicted remaining airtime (capped at `maxFlipRateRadps`, so a late flick
   * under-rotates). The guide foot flicks off an edge and that edge goes down first:
   * heel edge (kickflip) → roll −toeSide about the board's nose axis (−X in regular), toe
   * edge (heelflip) → the opposite; for an ollie and a nollie alike.
   */
  private flip(
    kick: Kick,
    edge: -1 | 1,
    controls: RiderControls,
    mass: BoardMassProperties,
    frame: BoardFrame,
    out: FootForce[],
  ): void {
    const t = this.config.tricks;
    this.flipped = true;
    const timeS = this.trickTimeS(frame.board, t.flipCompleteFraction);
    const rate = Math.min(t.maxFlipRateRadps, TAU / timeS);
    // The rider's toe side, expressed on the board's own Z axis (the board may be backwards).
    const boardSide = Transform.toWorldDirection(frame.board.transform, Vec3.UNIT_Z);
    const facing = Math.sign(Vec3.dot(boardSide, frame.riderSide)) || 1;
    startChannel(this.flipChannel, edge, edge * toeSideSign(controls.stance) * facing * rate);
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
   * SHOVE-IT: the yaw rate that turns 180° in `shoveCompleteFraction` of the predicted
   * airtime. The pop foot's end swings toward the pressed side: heel side = backside, toe
   * side = frontside. About the board's own up axis (principal): yaw only.
   */
  private shove(
    kick: Kick,
    side: -1 | 1,
    controls: RiderControls,
    mass: BoardMassProperties,
    frame: BoardFrame,
    out: FootForce[],
  ): void {
    const t = this.config.tricks;
    this.shoved = true;
    const timeS = this.trickTimeS(frame.board, t.shoveCompleteFraction);
    const rate = Math.min(t.maxShoveRateRadps, Math.PI / timeS);
    const wanted = Vec3.scale(frame.riderSide, side * toeSideSign(controls.stance));
    const kickEnd = Vec3.scale(frame.riderForward, kickSign(kick));
    const sign = Math.sign(Vec3.dot(Vec3.cross(Vec3.UNIT_Y, kickEnd), wanted)) || 1;
    startChannel(this.shoveChannel, side, sign * rate);
    this.stopPitch(kick, popFootOf(kick), "shove", mass, frame, out);
    // The scoop lasts part of the spin; the board leans toward the side it is scooped to.
    this.scoopS = 0;
    this.scoopDurationS = (Math.PI / rate) * t.scoopDurationFraction;
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
   * `landingMarginM`, s.
   */
  private remainingAirtimeS(board: BoardKinematics): number {
    const { gravityMps2: g, landingMarginM, minAirtimeS } = this.config.tricks;
    const landingY = restHeightM(this.deck) + landingMarginM;
    const heightM = Math.max(0, board.transform.positionM.y - landingY);
    const vy = board.linearVelocityMps.y;
    const airS = (vy + Math.sqrt(vy * vy + 2 * g * heightM)) / g;
    return Math.max(airS, minAirtimeS);
  }

  // ── catch ─────────────────────────────────────────────────────────────────

  /**
   * Feet down in the air: caught if the board is inside the cone (tilt within
   * `catchRollRad`, yaw within `catchYawRad` of 0°/180° from the rider heading). Outside,
   * the next try is locked out for `catchRetryS`.
   */
  private tryCatch(rider: RiderState, frame: BoardFrame): boolean {
    const t = this.config.tricks;
    if (this.catchLockS > 0) return false;
    const heading = boardHeadingRad(frame.board);
    const yawOk =
      heading !== null && Math.abs(axisErrorRad(heading - rider.headingRad)) <= t.catchYawRad;
    if (tiltRad(frame.board) <= t.catchRollRad && yawOk) {
      this.caught = true;
      return true;
    }
    this.catchLockS = t.catchRetryS;
    return false;
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
   * CATCH PD (gain `catchAssist`): kills the spin, drives the board level and snaps its yaw
   * to the nearest 0°/180° of the rider heading. Acts until the board lands.
   */
  private catchAssist(
    mass: BoardMassProperties,
    rider: RiderState,
    frame: BoardFrame,
    out: FootForce[],
  ): void {
    const { catchAssist, catchOmegaRadps: w } = this.config.tricks;
    const board = frame.board;
    const levelError = Vec3.cross(frame.up, Vec3.UNIT_Y);
    const heading = boardHeadingRad(board);
    const yawError = heading === null ? 0 : -axisErrorRad(heading - rider.headingRad);
    const side = Transform.toWorldDirection(board.transform, Vec3.UNIT_Z);
    const axes: readonly [Vec3, number][] = [
      [frame.forward, Vec3.dot(levelError, frame.forward)],
      [side, Vec3.dot(levelError, side)],
      [Vec3.UNIT_Y, yawError],
    ];
    // Wanted angular acceleration: spring on the errors, damping on the whole spin.
    let accel = Vec3.scale(board.angularVelocityRadps, -2 * w);
    for (const [axis, error] of axes) accel = Vec3.add(accel, Vec3.scale(axis, w * w * error));
    out.push(torqueOf("front", "catch", mass.angularInertiaTimes(Vec3.scale(accel, catchAssist))));
  }

  private endAir(): void {
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
    this.catchLockS = 0;
  }
}

const KICKS: readonly Kick[] = ["tail", "nose"];
const TAU = 2 * Math.PI;

/** One trick channel (flip or shove): see `TrickController.flipChannel`. */
interface TrickChannel {
  active: boolean;
  /** The key that started it (edge sign), whether it is still held, and for how long, s. */
  key: number;
  holding: boolean;
  heldS: number;
  /** 1 or 2 (a double flip / a 360 shove). */
  turns: 1 | 2;
  /** Held rate, rad/s (signed: roll about board X, or yaw about world Y). */
  rateRadps: number;
  turnedRad: number;
}

function newChannel(): TrickChannel {
  return { active: false, key: 0, holding: false, heldS: 0, turns: 1, rateRadps: 0, turnedRad: 0 };
}

function startChannel(channel: TrickChannel, key: number, rateRadps: number): void {
  channel.active = true;
  channel.key = key;
  channel.holding = true;
  channel.heldS = 0;
  channel.turns = 1;
  channel.rateRadps = rateRadps;
  channel.turnedRad = 0;
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
