import type { CinematicConfig } from "./cinematic.config";

/**
 * CINEMATIC SHOTS for the montage. Each shot type except `follow` is a PURE rig function:
 * (subject pose, shot time) → camera pose. `follow` is the game's own `FollowCameraRig`
 * (stateful, run by the `CinematicDirector`). Engine-agnostic: no Three.js here.
 */

export type Vec3Tuple = readonly [number, number, number];

/** Where the camera is, what it looks at, and its VERTICAL field of view. */
export interface CameraPose {
  readonly eye: Vec3Tuple;
  readonly target: Vec3Tuple;
  readonly fovDeg: number;
}

/** What a shot frames: the (smoothed) board position and direction of travel. */
export interface ShotSubject {
  /** Board origin, world m. */
  readonly position: Vec3Tuple;
  /** Direction of travel, rad around world +Y (0 = +X), smoothed. */
  readonly headingRad: number;
  /** +1 when the rider's heel side is on the travel's right, −1 on its left. */
  readonly heelSideSign: number;
}

/** The game's follow camera (STYLE.md §Camera). */
export interface FollowShot {
  readonly kind: "follow";
  /**
   * A wider framing of the game's own camera for a video (the game itself never changes):
   * the eye pulled back from its target by this factor (1 = the game's), raised by `raiseM`
   * and the FOV widened by `fovAddDeg`. For a portrait frame, where the game's close camera
   * crowds the board.
   */
  readonly widen?: {
    readonly pullBack: number;
    readonly raiseM: number;
    readonly fovAddDeg: number;
  };
}

/** The follow rig's pose, widened for a video frame (see `FollowShot.widen`). */
export function widenFollowPose(pose: CameraPose, widen: FollowShot["widen"]): CameraPose {
  if (widen === undefined) return pose;
  const [tx, ty, tz] = pose.target;
  const [ex, ey, ez] = pose.eye;
  const k = widen.pullBack;
  return {
    eye: [tx + (ex - tx) * k, ty + (ey - ty) * k + widen.raiseM, tz + (ez - tz) * k],
    target: [tx, ty + widen.raiseM * 0.35, tz],
    fovDeg: pose.fovDeg + widen.fovAddDeg,
  };
}

/** A low angle beside the line, tracking along with the board. */
export interface LowSideShot {
  readonly kind: "lowSide";
  /** Which side of the travel direction the camera is on. */
  readonly side: "left" | "right";
  readonly distanceM?: number;
  readonly heightM?: number;
  /** How far ahead of the board the camera leads (it looks back at it), m. */
  readonly leadM?: number;
  readonly fovDeg?: number;
}

/** A fixed tripod in the world, looking at the board, zooming in slowly. */
export interface FixedTripodShot {
  readonly kind: "fixedTripod";
  readonly positionM: Vec3Tuple;
  readonly fovStartDeg?: number;
  readonly fovEndDeg?: number;
  /** Duration of the zoom from start to end FOV, s of shot time. */
  readonly zoomS?: number;
  /**
   * A fixed point to look at instead of the board: a locked-off camera (the promo's match
   * to real footage, whose pose is fitted to the real frame).
   */
  readonly lookAtM?: Vec3Tuple;
}

/** Close, low, very wide: the filmer skating right behind the rider. */
export interface FisheyeFollowShot {
  readonly kind: "fisheyeFollow";
  readonly distanceM?: number;
  readonly heightM?: number;
  /** Offset toward the rider's heel side (the filmer rides beside the tail), m. */
  readonly sideM?: number;
  readonly horizontalFovDeg?: number;
}

/** A slow orbit around the board. */
export interface SlowOrbitShot {
  readonly kind: "slowOrbit";
  /** Start angle relative to the travel heading, rad (0 = in front, π = behind). */
  readonly startAngleRad: number;
  readonly radiusM?: number;
  readonly heightM?: number;
  /** Orbit rate, rad/s of shot time (+ = counter-clockwise from above). */
  readonly rateRadps?: number;
  readonly fovDeg?: number;
}

/**
 * A close, low, long-lens orbit on the board itself (the deck showcase of a promo): the
 * camera circles the board while it pushes in (radius, height and framed width ease from
 * start to end over `pushS`). The FOV is set from the WIDTH framed at the board, so the
 * board fills the same share of the frame in any aspect (portrait or landscape); a long
 * lens from a couple of metres flattens the background, which reads as a shallow focus.
 */
export interface DeckShowcaseShot {
  readonly kind: "deckShowcase";
  /** Start angle relative to the travel heading, rad (0 = in front, −π/2 = the right side). */
  readonly startAngleRad: number;
  /** Orbit rate, rad/s of shot time (+ = counter-clockwise from above). */
  readonly rateRadps?: number;
  readonly radiusStartM?: number;
  readonly radiusEndM?: number;
  /** Eye height above the board origin, m. */
  readonly heightStartM?: number;
  readonly heightEndM?: number;
  /** Width framed across the board, m (≈ 1.2 m shows the whole 0.8 m deck with air). */
  readonly frameStartM?: number;
  readonly frameEndM?: number;
  /** Duration of the push-in, s of shot time. */
  readonly pushS?: number;
}

/**
 * A camera that starts at a given pose and then travels with the board, keeping the offset
 * it had when the shot started (the board holds its place in the frame while the world
 * slides by): the promo's match cut, where a locked-off camera has to keep the board in
 * frame after the cut. The travel eases in over `easeInS` (a camera operator starting to
 * walk), so the switch from a fixed camera shows no jolt.
 */
export interface TravelWithShot {
  readonly kind: "travelWith";
  readonly positionM: Vec3Tuple;
  readonly lookAtM: Vec3Tuple;
  readonly fovDeg: number;
  /** How long the travel takes to reach the board's speed, s of shot time. */
  readonly easeInS?: number;
}

export type ShotSpec =
  | FollowShot
  | LowSideShot
  | FixedTripodShot
  | FisheyeFollowShot
  | SlowOrbitShot
  | DeckShowcaseShot
  | TravelWithShot;
export type ShotKind = ShotSpec["kind"];
export type RiggedShotSpec = Exclude<ShotSpec, FollowShot>;

/** Horizontal forward (x, z) and right (x, z) of a heading. */
function basis(headingRad: number): { fx: number; fz: number; rx: number; rz: number } {
  return {
    fx: Math.cos(headingRad),
    fz: -Math.sin(headingRad),
    rx: Math.sin(headingRad),
    rz: Math.cos(headingRad),
  };
}

/** Smoothstep ease in [0, 1]. */
export function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/**
 * Quintic smootherstep in [0, 1]: zero velocity AND acceleration at both ends, so a camera
 * move or blend built on it starts and settles without a jolt (C2).
 */
export function smootherstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/** Vertical FOV that gives `horizontalFovDeg` at `aspect` (width / height), deg. */
export function verticalFovDeg(horizontalFovDeg: number, aspect: number): number {
  const h = (horizontalFovDeg * Math.PI) / 180;
  return (2 * Math.atan(Math.tan(h / 2) / Math.max(1e-3, aspect)) * 180) / Math.PI;
}

/** `lowSide`: beside the line, just above the ground, leading the board slightly. */
export function lowSidePose(
  spec: LowSideShot,
  subject: ShotSubject,
  config: CinematicConfig,
): CameraPose {
  const d = config.shots.lowSide;
  const { fx, fz, rx, rz } = basis(subject.headingRad);
  const side = (spec.side === "right" ? 1 : -1) * (spec.distanceM ?? d.distanceM);
  const lead = spec.leadM ?? d.leadM;
  const [px, py, pz] = subject.position;
  return {
    eye: [px + rx * side + fx * lead, py + (spec.heightM ?? d.heightM), pz + rz * side + fz * lead],
    target: [px, py + d.lookHeightM, pz],
    fovDeg: spec.fovDeg ?? d.fovDeg,
  };
}

/** `fixedTripod`: a fixed eye; the look target tracks the board; the FOV eases in. */
export function fixedTripodPose(
  spec: FixedTripodShot,
  subject: ShotSubject,
  shotTimeS: number,
  config: CinematicConfig,
): CameraPose {
  const d = config.shots.fixedTripod;
  const zoomS = spec.zoomS ?? d.zoomS;
  const t = zoomS <= 0 ? 1 : smoothstep(shotTimeS / zoomS);
  const f0 = spec.fovStartDeg ?? d.fovStartDeg;
  const f1 = spec.fovEndDeg ?? d.fovEndDeg;
  const [px, py, pz] = subject.position;
  return {
    eye: spec.positionM,
    target: spec.lookAtM ?? [px, py + d.lookHeightM, pz],
    fovDeg: f0 + (f1 - f0) * t,
  };
}

/** `fisheyeFollow`: close behind and to the heel side, low, wide. */
export function fisheyeFollowPose(
  spec: FisheyeFollowShot,
  subject: ShotSubject,
  aspect: number,
  config: CinematicConfig,
): CameraPose {
  const d = config.shots.fisheyeFollow;
  const { fx, fz, rx, rz } = basis(subject.headingRad);
  const back = spec.distanceM ?? d.distanceM;
  const side = subject.heelSideSign * (spec.sideM ?? d.sideM);
  const [px, py, pz] = subject.position;
  return {
    eye: [px - fx * back + rx * side, py + (spec.heightM ?? d.heightM), pz - fz * back + rz * side],
    target: [px + fx * d.lookAheadM, py + d.lookHeightM, pz + fz * d.lookAheadM],
    // A portrait frame keeps the fisheye's width as its height (never a 110° tall frame).
    fovDeg: verticalFovDeg(
      spec.horizontalFovDeg ?? d.horizontalFovDeg,
      Math.max(aspect, d.minAspect),
    ),
  };
}

/** `slowOrbit`: circles the board at a constant rate, starting relative to the travel. */
export function slowOrbitPose(
  spec: SlowOrbitShot,
  subject: ShotSubject,
  shotTimeS: number,
  config: CinematicConfig,
): CameraPose {
  const d = config.shots.slowOrbit;
  const angle =
    subject.headingRad + spec.startAngleRad + (spec.rateRadps ?? d.rateRadps) * shotTimeS;
  const r = spec.radiusM ?? d.radiusM;
  const [px, py, pz] = subject.position;
  return {
    eye: [px + Math.cos(angle) * r, py + (spec.heightM ?? d.heightM), pz - Math.sin(angle) * r],
    target: [px, py + d.lookHeightM, pz],
    fovDeg: spec.fovDeg ?? d.fovDeg,
  };
}

/** `deckShowcase`: a close orbit that pushes in, framing a set width at the board. */
export function deckShowcasePose(
  spec: DeckShowcaseShot,
  subject: ShotSubject,
  shotTimeS: number,
  aspect: number,
  config: CinematicConfig,
): CameraPose {
  const d = config.shots.deckShowcase;
  const pushS = spec.pushS ?? d.pushS;
  const t = pushS <= 0 ? 1 : smoothstep(shotTimeS / pushS);
  const lerp = (a: number, b: number): number => a + (b - a) * t;
  const r = lerp(spec.radiusStartM ?? d.radiusStartM, spec.radiusEndM ?? d.radiusEndM);
  const height = lerp(spec.heightStartM ?? d.heightStartM, spec.heightEndM ?? d.heightEndM);
  const frame = lerp(spec.frameStartM ?? d.frameStartM, spec.frameEndM ?? d.frameEndM);
  const angle =
    subject.headingRad + spec.startAngleRad + (spec.rateRadps ?? d.rateRadps) * shotTimeS;
  const [px, py, pz] = subject.position;
  const distance = Math.hypot(r, height - d.lookHeightM);
  const horizontalDeg = (2 * Math.atan(frame / 2 / Math.max(1e-3, distance)) * 180) / Math.PI;
  return {
    eye: [px + Math.cos(angle) * r, py + height, pz - Math.sin(angle) * r],
    target: [px, py + d.lookHeightM, pz],
    fovDeg: verticalFovDeg(horizontalDeg, aspect),
  };
}

/**
 * `travelWith`: the start pose moved by the board's horizontal displacement since the shot started
 * (`start`, the subject then), eased in over `easeInS`.
 */
/**
 * How much of the board's displacement a `travelWith` camera has covered after `t` of its
 * ease (`easeS`): its VELOCITY eases from 0 to the board's on a quintic smootherstep (for a
 * board at a steady speed), so it accelerates smoothly and never overshoots the board's
 * speed to catch up; the price is that the board closes in by speed × `easeS` / 2.
 * (∫₀ˣ smootherstep = x⁶ − 3x⁵ + 2.5x⁴.)
 */
export function travelFraction(t: number, easeS: number): number {
  if (t <= 0) return 0;
  if (easeS <= 0) return 1;
  if (t >= easeS) return 1 - easeS / (2 * t);
  const x = t / easeS;
  return (easeS * (x ** 6 - 3 * x ** 5 + 2.5 * x ** 4)) / t;
}

export function travelWithPose(
  spec: TravelWithShot,
  subject: ShotSubject,
  start: ShotSubject,
  shotTimeS: number,
): CameraPose {
  const w = travelFraction(shotTimeS, spec.easeInS ?? 0.4);
  // Horizontal only: an operator walks with the board, the lens height stays (a low camera
  // following a board that drops onto a rail would otherwise go under the ground).
  const [sx, , sz] = subject.position;
  const [ox, , oz] = start.position;
  const move = (p: Vec3Tuple): Vec3Tuple => [p[0] + (sx - ox) * w, p[1], p[2] + (sz - oz) * w];
  return { eye: move(spec.positionM), target: move(spec.lookAtM), fovDeg: spec.fovDeg };
}

/** Pose of any rigged (non-follow) shot. */
export function riggedShotPose(
  spec: RiggedShotSpec,
  subject: ShotSubject,
  shotTimeS: number,
  aspect: number,
  config: CinematicConfig,
  /** The subject when the shot started (`travelWith`); default: now. */
  start: ShotSubject = subject,
): CameraPose {
  switch (spec.kind) {
    case "lowSide":
      return lowSidePose(spec, subject, config);
    case "fixedTripod":
      return fixedTripodPose(spec, subject, shotTimeS, config);
    case "fisheyeFollow":
      return fisheyeFollowPose(spec, subject, aspect, config);
    case "slowOrbit":
      return slowOrbitPose(spec, subject, shotTimeS, config);
    case "deckShowcase":
      return deckShowcasePose(spec, subject, shotTimeS, aspect, config);
    case "travelWith":
      return travelWithPose(spec, subject, start, shotTimeS);
  }
}

/** Blend of two poses (eye, target and FOV lerped), `t` in [0, 1]. */
export function blendPoses(a: CameraPose, b: CameraPose, t: number): CameraPose {
  const lerp3 = (p: Vec3Tuple, q: Vec3Tuple): Vec3Tuple => [
    p[0] + (q[0] - p[0]) * t,
    p[1] + (q[1] - p[1]) * t,
    p[2] + (q[2] - p[2]) * t,
  ];
  return {
    eye: lerp3(a.eye, b.eye),
    target: lerp3(a.target, b.target),
    fovDeg: a.fovDeg + (b.fovDeg - a.fovDeg) * t,
  };
}
