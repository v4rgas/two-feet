import { FollowCameraRig, heelSideSign, targetHeading } from "../camera/follow-camera-rig";
import { createSpring, stepCriticallyDamped, stepCriticallyDampedAngle } from "../math/damping";
import { createPose, interpolateTransformInto } from "../math/pose-interpolation";
import type { PresentationConfig } from "../presentation.config";
import type { RenderFrame } from "../render-frame";
import type { CinematicConfig } from "./cinematic.config";
import type { CameraPose, ShotSpec, ShotSubject } from "./shots";
import { blendPoses, riggedShotPose, smoothstep } from "./shots";

/** One camera shot of a clip: active from `fromS` (clip time) until the next one starts. */
export interface ShotSegment {
  readonly fromS: number;
  readonly shot: ShotSpec;
  /** Blend from the previous shot over this long (video time), s. 0 or absent = a cut. */
  readonly blendS?: number;
}

/** Index of the segment active at `clipTimeS` (the last one starting at or before it). */
export function activeSegmentIndex(segments: readonly ShotSegment[], clipTimeS: number): number {
  let index = 0;
  for (let i = 0; i < segments.length; i += 1) {
    if ((segments[i]?.fromS ?? Infinity) <= clipTimeS + 1e-9) index = i;
  }
  return index;
}

/**
 * Runs the shots of one clip. Each frame it reads the `RenderFrame`, tracks a smoothed
 * subject (the board position and direction of travel), evaluates the active shot and
 * blends or cuts between shots as the clip says. Shot animation (orbit, zoom, blends)
 * runs on VIDEO time (`dtS`), so it stays smooth through slow motion; which shot is active
 * follows CLIP time (the simulation), so cuts land on the action.
 */
export class CinematicDirector {
  private readonly follow: FollowCameraRig;
  private readonly pose = createPose();
  private readonly sx = createSpring();
  private readonly sy = createSpring();
  private readonly sz = createSpring();
  private readonly heading = createSpring();
  private segments: readonly ShotSegment[] = [{ fromS: 0, shot: { kind: "follow" } }];
  private active = -1;
  private previous = -1;
  /** Video time since the active shot started / since the previous one started, s. */
  private activeAgeS = 0;
  private previousAgeS = 0;
  private initialized = false;

  constructor(
    camera: PresentationConfig["camera"],
    private readonly config: CinematicConfig,
  ) {
    this.follow = new FollowCameraRig(camera);
  }

  /** Starts a new clip: its shots, and a snapped subject and follow rig. */
  start(segments: readonly ShotSegment[]): void {
    if (segments.length === 0) throw new RangeError("A clip needs at least one shot");
    this.segments = [...segments].sort((a, b) => a.fromS - b.fromS);
    this.active = -1;
    this.previous = -1;
    this.initialized = false;
    this.follow.snap();
  }

  /** Kind of the shot being shown (for tests and the dev readout). */
  get activeShot(): ShotSpec | undefined {
    return this.segments[Math.max(0, this.active)]?.shot;
  }

  update(frame: RenderFrame, clipTimeS: number, dtS: number, aspect: number): CameraPose {
    const subject = this.updateSubject(frame, dtS);
    this.updateFollow(frame, dtS);

    const index = activeSegmentIndex(this.segments, clipTimeS);
    if (index !== this.active) {
      const blendS = this.segments[index]?.blendS ?? 0;
      this.previous = this.active >= 0 && blendS > 0 ? this.active : -1;
      this.previousAgeS = this.activeAgeS;
      this.active = index;
      this.activeAgeS = 0;
    } else {
      this.activeAgeS += dtS;
    }
    this.previousAgeS += dtS;

    const current = this.poseOf(this.active, subject, this.activeAgeS, aspect);
    if (this.previous < 0) return current;
    const blendS = this.segments[this.active]?.blendS ?? 0;
    const t = blendS <= 0 ? 1 : this.activeAgeS / blendS;
    if (t >= 1) {
      this.previous = -1;
      return current;
    }
    const before = this.poseOf(this.previous, subject, this.previousAgeS, aspect);
    return blendPoses(before, current, smoothstep(t));
  }

  private poseOf(index: number, subject: ShotSubject, ageS: number, aspect: number): CameraPose {
    const shot = this.segments[index]?.shot ?? { kind: "follow" };
    if (shot.kind === "follow") {
      return { eye: [...this.follow.eye], target: [...this.follow.target], fovDeg: this.follow.fovDeg };
    }
    return riggedShotPose(shot, subject, ageS, aspect, this.config);
  }

  private updateSubject(frame: RenderFrame, dtS: number): ShotSubject {
    const p = this.pose;
    interpolateTransformInto(p, frame.previousBoard.transform, frame.currentBoard.transform, frame.alpha);
    const s = this.config.subject;
    const board = frame.currentBoard;
    const v = board.linearVelocityMps;
    const noseX = Math.cos(frame.rider.headingRad);
    const noseZ = -Math.sin(frame.rider.headingRad);
    const wanted = targetHeading(v, noseX, noseZ, board.grounded, s.headingMinSpeedMps);
    if (!this.initialized) {
      this.sx.value = p.px;
      this.sy.value = p.py;
      this.sz.value = p.pz;
      this.sx.velocity = this.sy.velocity = this.sz.velocity = 0;
      this.heading.value = wanted ?? frame.rider.headingRad;
      this.heading.velocity = 0;
      this.initialized = true;
    } else {
      stepCriticallyDamped(this.sx, p.px, s.positionSmoothTimeS, dtS);
      stepCriticallyDamped(this.sy, p.py, s.positionSmoothTimeS, dtS);
      stepCriticallyDamped(this.sz, p.pz, s.positionSmoothTimeS, dtS);
      if (wanted !== null) {
        stepCriticallyDampedAngle(this.heading, wanted, s.headingSmoothTimeS, dtS);
      }
    }
    // Heel side relative to the travel: flips when the rider rolls fakie.
    const travelVsRider = Math.cos(this.heading.value - frame.rider.headingRad) >= 0 ? 1 : -1;
    // `heelSideSign` is relative to the camera's right when looking along the rider heading.
    return {
      position: [this.sx.value, this.sy.value, this.sz.value],
      headingRad: this.heading.value,
      heelSideSign: heelSideSign(frame.stance) * travelVsRider,
    };
  }

  /** The game's follow camera, driven exactly like `ThreeRenderer` drives it. */
  private updateFollow(frame: RenderFrame, dtS: number): void {
    for (const event of frame.recentEvents) {
      if (event.type === "BoardLanded") this.follow.notifyLanding(event.velocityMps.y);
      else if (event.type === "RiderBailed") this.follow.notifyBail();
    }
    const board = frame.currentBoard;
    const a = frame.previousRider.headingRad;
    const b = frame.rider.headingRad;
    const riderHeadingRad = a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * frame.alpha;
    this.follow.update(
      this.pose,
      board.linearVelocityMps,
      board.grounded,
      board.airtimeS,
      frame.stance,
      dtS,
      riderHeadingRad,
    );
  }
}
