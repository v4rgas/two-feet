import * as THREE from "three";
import type { BoardSpec } from "../contexts/board";
import { FollowCameraRig } from "./camera/follow-camera-rig";
import { DebugOverlay } from "./debug/debug-overlay";
import { Hud } from "./hud/hud";
import { createPose, interpolateTransformInto } from "./math/pose-interpolation";
import type { PresentationConfig } from "./presentation.config";
import type { RenderFrame, SceneSetup } from "./render-frame";
import type { Renderer } from "./renderer";
import type { BoardMesh } from "./scene/board-mesh";
import { buildBoardMesh } from "./scene/board-mesh";
import { FeetMesh } from "./scene/feet-mesh";
import type { LevelMesh } from "./scene/level-mesh";
import { buildLevelMesh } from "./scene/level-mesh";
import { buildSky } from "./scene/sky";

/** Longest frame delta fed to smoothing (tab switches, breakpoints), s. */
const MAX_FRAME_DT_S = 0.1;
/** A jump of the board larger than this between frames is a reset: snap the camera, m. */
const TELEPORT_DISTANCE_M = 3;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

export interface ThreeRendererOptions {
  readonly canvas: HTMLCanvasElement;
  /** Injected config; in dev builds a tunable clone, so camera/HUD values apply live. */
  readonly config: PresentationConfig;
  /** Parent of the HUD overlay. Defaults to the canvas's parent (or `document.body`). */
  readonly hudParent?: HTMLElement;
}

/**
 * Three.js implementation of the presentation `Renderer` (STYLE.md). Reads `RenderFrame`s
 * only: it never mutates domain state and never touches physics (REQUIREMENTS §2.3 rule 4).
 */
export class ThreeRenderer implements Renderer {
  private readonly config: PresentationConfig;
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly sun: THREE.DirectionalLight;
  private readonly sky: THREE.Mesh;
  private readonly rig: FollowCameraRig;
  private readonly hud: Hud;
  private readonly debug: DebugOverlay;
  private readonly feet: FeetMesh;
  private readonly boardPivot = new THREE.Group();
  private board: BoardMesh | null = null;
  private level: LevelMesh | null = null;
  private spec: BoardSpec | null = null;

  // Per-frame scratch (no allocation in `render`).
  private readonly pose = createPose();
  private readonly sunOffset = new THREE.Vector3();
  private readonly headingQuat = new THREE.Quaternion();
  private readonly lastBoardPosition = new THREE.Vector3();
  private lastTimeMs: number | null = null;
  private wheelAngleRad = 0;
  private wheelSpinRadps = 0;
  private flashAgeS = Number.POSITIVE_INFINITY;
  private hasRendered = false;
  private readonly onResize = (): void => this.resize();

  constructor(options: ThreeRendererOptions) {
    const { canvas, config } = options;
    this.config = config;
    this.canvas = canvas;
    const { palette, lighting, camera: cam } = config;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = config.renderer.toneMappingExposure;
    this.renderer.shadowMap.enabled = true;
    // PCFSoftShadowMap was folded into PCFShadowMap (three r18x); softness comes from `shadow.radius`.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene.fog = new THREE.Fog(palette.skyBottom, lighting.fogNearM, lighting.fogFarM);
    this.camera = new THREE.PerspectiveCamera(cam.fovDeg, 1, cam.nearM, cam.farM);

    this.sky = buildSky(config);
    this.scene.add(this.sky);

    const hemi = new THREE.HemisphereLight(
      lighting.hemiSkyColor,
      lighting.hemiGroundColor,
      lighting.hemiIntensity,
    );
    this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(lighting.sunColor, lighting.sunIntensity);
    this.sun.castShadow = true;
    const shadow = this.sun.shadow;
    const e = lighting.shadowHalfExtentM;
    shadow.mapSize.set(lighting.shadowMapSizePx, lighting.shadowMapSizePx);
    Object.assign(shadow.camera, {
      left: -e,
      right: e,
      top: e,
      bottom: -e,
      near: 0.5,
      far: lighting.sunDistanceM * 2,
    });
    shadow.camera.updateProjectionMatrix();
    shadow.radius = lighting.shadowRadiusPx;
    shadow.bias = lighting.shadowBias;
    shadow.normalBias = lighting.shadowNormalBias;
    this.scene.add(this.sun, this.sun.target);

    this.boardPivot.name = "board-pivot";
    this.scene.add(this.boardPivot);
    this.feet = new FeetMesh(config);
    this.scene.add(this.feet.group);

    this.rig = new FollowCameraRig(config.camera);
    const hudParent = options.hudParent ?? canvas.parentElement ?? document.body;
    this.hud = new Hud(hudParent, config);
    this.debug = new DebugOverlay(hudParent, config);
    this.scene.add(this.debug.group);
    this.boardPivot.add(this.debug.axes);

    window.addEventListener("resize", this.onResize);
    this.resize();
  }

  setup(setup: SceneSetup): void {
    this.board?.group.removeFromParent();
    this.board?.dispose();
    this.level?.group.removeFromParent();
    this.level?.dispose();

    this.spec = setup.boardSpec;
    this.board = buildBoardMesh(setup.boardSpec, this.config);
    this.boardPivot.add(this.board.group);
    this.level = buildLevelMesh(setup.level, this.config);
    this.scene.add(this.level.group);
    this.rig.snap();
  }

  render(frame: RenderFrame): void {
    const nowMs = performance.now();
    const dtS =
      this.lastTimeMs === null ? 0 : Math.min(MAX_FRAME_DT_S, (nowMs - this.lastTimeMs) / 1000);
    this.lastTimeMs = nowMs;

    this.handleEvents(frame);
    this.updateBoard(frame, dtS);

    const board = frame.currentBoard;
    const riderHeadingRad = lerpAngleRad(
      frame.previousRider.headingRad,
      frame.rider.headingRad,
      frame.alpha,
    );
    this.rig.update(
      this.pose,
      board.linearVelocityMps,
      board.grounded,
      board.airtimeS,
      frame.stance,
      dtS,
      riderHeadingRad,
    );
    this.camera.position.set(this.rig.eye[0], this.rig.eye[1], this.rig.eye[2]);
    this.camera.lookAt(this.rig.target[0], this.rig.target[1], this.rig.target[2]);
    if (Math.abs(this.camera.fov - this.rig.fovDeg) > 1e-3) {
      this.camera.fov = this.rig.fovDeg;
      this.camera.updateProjectionMatrix();
    }
    this.sky.position.copy(this.camera.position);

    this.updateSun();
    if (this.spec !== null) {
      // Feet are upright in the RIDER frame (MECHANICS.md): the rider heading, not the board.
      this.headingQuat.setFromAxisAngle(Y_AXIS, riderHeadingRad);
      this.feet.update(
        frame.previousRider,
        frame.rider,
        frame.alpha,
        this.headingQuat,
        frame.stance,
        {
          stickX: { front: frame.intents.front.stick.x, back: frame.intents.back.stick.x },
          airborne: !board.grounded,
          dtS,
        },
      );
    }
    this.debug.update(frame, dtS);
    this.hud.update(frame, dtS);
    this.renderer.render(this.scene, this.camera);
  }

  /** Debug overlay toggle (also bound to F1). */
  setDebugEnabled(enabled: boolean): void {
    this.debug.setEnabled(enabled);
  }

  dispose(): void {
    window.removeEventListener("resize", this.onResize);
    this.board?.dispose();
    this.level?.dispose();
    this.feet.dispose();
    this.debug.dispose();
    this.hud.dispose();
    this.sky.geometry.dispose();
    (this.sky.material as THREE.Material).dispose();
    this.renderer.dispose();
  }

  private handleEvents(frame: RenderFrame): void {
    for (const event of frame.recentEvents) {
      switch (event.type) {
        case "BoardLanded":
          this.rig.notifyLanding(event.velocityMps.y);
          break;
        case "RiderBailed":
          this.rig.notifyBail();
          break;
        case "TrickLanded":
          this.flashAgeS = 0;
          break;
        default:
          break;
      }
    }
  }

  private updateBoard(frame: RenderFrame, dtS: number): void {
    const pose = this.pose;
    interpolateTransformInto(
      pose,
      frame.previousBoard.transform,
      frame.currentBoard.transform,
      frame.alpha,
    );
    this.boardPivot.position.set(pose.px, pose.py, pose.pz);
    this.boardPivot.quaternion.set(pose.qx, pose.qy, pose.qz, pose.qw);
    this.boardPivot.updateMatrixWorld(true);

    if (
      this.hasRendered &&
      this.lastBoardPosition.distanceTo(this.boardPivot.position) > TELEPORT_DISTANCE_M
    ) {
      this.rig.snap();
    }
    this.lastBoardPosition.copy(this.boardPivot.position);
    this.hasRendered = true;

    const board = this.board;
    if (board === null || this.spec === null) return;

    // Wheels spin from the forward speed while rolling; they coast down in the air.
    const snap = frame.currentBoard;
    const v = snap.linearVelocityMps;
    const q = snap.transform.rotation;
    // Board +X in world: first column of the rotation matrix.
    const noseX = 1 - 2 * (q.y * q.y + q.z * q.z);
    const noseY = 2 * (q.x * q.y + q.w * q.z);
    const noseZ = 2 * (q.x * q.z - q.w * q.y);
    const forwardMps = v.x * noseX + v.y * noseY + v.z * noseZ;
    if (snap.grounded) {
      this.wheelSpinRadps = forwardMps / this.spec.wheels.radiusM;
    } else {
      this.wheelSpinRadps *= this.config.board.airborneSpinKeepPerS ** dtS;
    }
    this.wheelAngleRad = (this.wheelAngleRad - this.wheelSpinRadps * dtS) % (Math.PI * 2);
    for (const wheel of board.wheels) wheel.rotation.z = this.wheelAngleRad;

    // Clean catch: subtle white flash on the deck (STYLE.md: 80 ms).
    this.flashAgeS += dtS;
    const { catchFlashS, catchFlashIntensity } = this.config.board;
    board.deckMaterial.emissiveIntensity =
      this.flashAgeS < catchFlashS ? catchFlashIntensity * (1 - this.flashAgeS / catchFlashS) : 0;
  }

  /** The sun (and its tight shadow frustum) follows the board so shadows stay crisp. */
  private updateSun(): void {
    const l = this.config.lighting;
    const cosEl = Math.cos(l.sunElevationRad);
    this.sunOffset.set(
      Math.cos(l.sunAzimuthRad) * cosEl,
      Math.sin(l.sunElevationRad),
      -Math.sin(l.sunAzimuthRad) * cosEl,
    );
    this.sun.target.position.copy(this.boardPivot.position);
    this.sun.position
      .copy(this.boardPivot.position)
      .addScaledVector(this.sunOffset, l.sunDistanceM);
  }

  private resize(): void {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, this.config.renderer.maxPixelRatio),
    );
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }
}

/** Shortest-way interpolation between two angles, rad. */
function lerpAngleRad(a: number, b: number, t: number): number {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * t;
}
