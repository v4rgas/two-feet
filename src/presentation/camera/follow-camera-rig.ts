import type { Stance, Vec3 } from "../../shared";
import {
  createSpring,
  easeExponential,
  stepCriticallyDamped,
  stepCriticallyDampedAngle,
} from "../math/damping";
import type { MutablePose } from "../math/pose-interpolation";
import { rotateByPose } from "../math/pose-interpolation";
import type { PresentationConfig } from "../presentation.config";

type CameraConfig = PresentationConfig["camera"];

/** Minimum horizontal length of the board's nose direction to trust it as a heading. */
const MIN_NOSE_HORIZONTAL = 0.3;
/** Frequency ratio and phase of the vertical shake relative to the sideways one. */
const SHAKE_VERTICAL_RATIO = 1.37;
const SHAKE_VERTICAL_PHASE = 1.1;

/** Heading (rad around world +Y, 0 = +X) of a horizontal direction; null if too short. */
export function headingOf(dx: number, dz: number, minLength: number): number | null {
  if (Math.hypot(dx, dz) < minLength) return null;
  return Math.atan2(-dz, dx);
}

/**
 * Chooses what the camera heading should follow (STYLE.md: the direction of travel, never
 * the board's roll/flip). Returns null when nothing is trustworthy (keep the current one).
 * - moving: the horizontal velocity direction;
 * - slow and grounded: the board's nose;
 * - slow and airborne: keep (a spinning board must not swing the camera).
 */
export function targetHeading(
  velocity: Vec3,
  noseX: number,
  noseZ: number,
  grounded: boolean,
  minSpeedMps: number,
): number | null {
  const travel = headingOf(velocity.x, velocity.z, minSpeedMps);
  if (travel !== null) return travel;
  if (!grounded) return null;
  return headingOf(noseX, noseZ, MIN_NOSE_HORIZONTAL);
}

/** Vertical camera offset of the landing dip at `ageS` after touchdown, m (≤ 0). */
export function landingDipOffsetM(ageS: number, depthM: number, durationS: number): number {
  if (ageS < 0 || ageS >= durationS || durationS <= 0) return 0;
  return -depthM * Math.sin((Math.PI * ageS) / durationS);
}

/** Shake envelope in [0, 1]: 1 at the bail, linearly down to 0 at `durationS`. */
export function shakeEnvelope(ageS: number, durationS: number): number {
  if (ageS < 0 || ageS >= durationS || durationS <= 0) return 0;
  return 1 - ageS / durationS;
}

/** Heel-side sign relative to the camera's right: regular → heel is -Z (left), goofy → +Z. */
export function heelSideSign(stance: Stance): number {
  return stance === "regular" ? -1 : 1;
}

/**
 * Engine-agnostic follow camera (STYLE.md §Camera). Each frame it takes the interpolated
 * board pose and outputs an eye position, a look target and a FOV. Position is critically
 * damped per axis; heading follows travel; FOV widens while airborne; landing dips; bail
 * shakes. No allocation per update.
 */
export class FollowCameraRig {
  readonly eye: [number, number, number] = [0, 0, 0];
  readonly target: [number, number, number] = [0, 0, 0];
  fovDeg: number;

  private readonly heading = createSpring(0);
  private readonly ex = createSpring();
  private readonly ey = createSpring();
  private readonly ez = createSpring();
  private readonly tx = createSpring();
  private readonly ty = createSpring();
  private readonly tz = createSpring();
  private readonly nose: [number, number, number] = [0, 0, 0];
  private dipAgeS = Number.POSITIVE_INFINITY;
  private dipDepthM = 0;
  private shakeAgeS = Number.POSITIVE_INFINITY;
  private initialized = false;

  constructor(private readonly config: CameraConfig) {
    this.fovDeg = config.fovDeg;
  }

  /** Smoothed camera heading (rad around world +Y, 0 = +X). */
  get headingRad(): number {
    return this.heading.value;
  }

  /** Call on `BoardLanded`, with the vertical touchdown speed (m/s, any sign). */
  notifyLanding(verticalSpeedMps: number): void {
    const c = this.config;
    const scale = Math.min(1, Math.abs(verticalSpeedMps) / c.landingDipRefSpeedMps);
    this.dipDepthM = c.landingDipDepthM * scale;
    this.dipAgeS = 0;
  }

  /** Call on `RiderBailed`. */
  notifyBail(): void {
    this.shakeAgeS = 0;
  }

  /** Snap to the ideal pose on the next update (spawn, reset). */
  snap(): void {
    this.initialized = false;
  }

  update(
    board: MutablePose,
    velocity: Vec3,
    grounded: boolean,
    airtimeS: number,
    stance: Stance,
    dtS: number,
  ): void {
    const c = this.config;
    rotateByPose(board, 1, 0, 0, this.nose);
    const wanted = targetHeading(
      velocity,
      this.nose[0],
      this.nose[2],
      grounded,
      c.travelHeadingMinSpeedMps,
    );

    if (!this.initialized) {
      this.heading.value = wanted ?? 0;
      this.heading.velocity = 0;
    } else if (wanted !== null) {
      stepCriticallyDampedAngle(this.heading, wanted, c.headingSmoothTimeS, dtS);
    }

    // Horizontal basis from the smoothed heading: forward (fx, fz), right (rx, rz).
    const h = this.heading.value;
    const fx = Math.cos(h);
    const fz = -Math.sin(h);
    const rx = Math.sin(h);
    const rz = Math.cos(h);
    const side = heelSideSign(stance) * c.heelSideOffsetM;

    const eyeX = board.px - fx * c.distanceBehindM + rx * side;
    const eyeY = board.py + c.heightM;
    const eyeZ = board.pz - fz * c.distanceBehindM + rz * side;
    const lookX = board.px + fx * c.lookAheadM;
    const lookY = board.py + c.lookHeightM;
    const lookZ = board.pz + fz * c.lookAheadM;

    if (!this.initialized) {
      this.reset(eyeX, eyeY, eyeZ, lookX, lookY, lookZ);
      this.initialized = true;
    } else {
      stepCriticallyDamped(this.ex, eyeX, c.positionSmoothTimeS, dtS);
      stepCriticallyDamped(this.ey, eyeY, c.positionSmoothTimeS, dtS);
      stepCriticallyDamped(this.ez, eyeZ, c.positionSmoothTimeS, dtS);
      stepCriticallyDamped(this.tx, lookX, c.targetSmoothTimeS, dtS);
      stepCriticallyDamped(this.ty, lookY, c.targetSmoothTimeS, dtS);
      stepCriticallyDamped(this.tz, lookZ, c.targetSmoothTimeS, dtS);
    }

    // Landing dip: eye and target sink together (trucks compressing).
    this.dipAgeS += dtS;
    const dip = landingDipOffsetM(this.dipAgeS, this.dipDepthM, c.landingDipDurationS);

    // Bail shake: sideways + vertical jitter, decaying to zero within the duration.
    this.shakeAgeS += dtS;
    const env = shakeEnvelope(this.shakeAgeS, c.bailShakeDurationS) * c.bailShakeAmplitudeM;
    let shakeSide = 0;
    let shakeUp = 0;
    if (env > 0) {
      const phase = 2 * Math.PI * c.bailShakeFrequencyHz * this.shakeAgeS;
      // Two incommensurate sines so the jitter does not look like a straight line.
      shakeSide = env * Math.sin(phase);
      shakeUp = env * Math.sin(phase * SHAKE_VERTICAL_RATIO + SHAKE_VERTICAL_PHASE);
    }

    this.eye[0] = this.ex.value + rx * shakeSide;
    this.eye[1] = this.ey.value + dip + shakeUp;
    this.eye[2] = this.ez.value + rz * shakeSide;
    this.target[0] = this.tx.value;
    this.target[1] = this.ty.value + dip;
    this.target[2] = this.tz.value;

    const airborne = !grounded && airtimeS >= c.airborneFovMinAirS;
    const fovTarget = c.fovDeg + (airborne ? c.airborneFovExtraDeg : 0);
    this.fovDeg = easeExponential(this.fovDeg, fovTarget, c.fovEaseTauS, dtS);
  }

  private reset(ex: number, ey: number, ez: number, tx: number, ty: number, tz: number): void {
    const set = (s: { value: number; velocity: number }, v: number): void => {
      s.value = v;
      s.velocity = 0;
    };
    set(this.ex, ex);
    set(this.ey, ey);
    set(this.ez, ez);
    set(this.tx, tx);
    set(this.ty, ty);
    set(this.tz, tz);
    this.fovDeg = this.config.fovDeg;
  }
}
