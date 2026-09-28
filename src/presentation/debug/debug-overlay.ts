import * as THREE from "three";
import type { FootState } from "../../contexts/rider";
import { radToDeg } from "../../shared";
import type { PresentationConfig } from "../presentation.config";
import type { DebugVector, RenderFrame } from "../render-frame";
import { arrowLengthM, arrowOpacity, arrowRadiusM } from "./debug-style";

const UP = new THREE.Vector3(0, 1, 0);
const OVERLAY_RENDER_ORDER = 10;

/** Shaft (unit-height cylinder) + head (cone) that can be posed without allocation. */
class Arrow {
  readonly group = new THREE.Group();
  private readonly shaft: THREE.Mesh;
  private readonly head: THREE.Mesh;
  readonly material: THREE.MeshBasicMaterial;
  private readonly dir = new THREE.Vector3();

  constructor(shaftGeometry: THREE.BufferGeometry, headGeometry: THREE.BufferGeometry) {
    this.material = new THREE.MeshBasicMaterial({ transparent: true, depthTest: false });
    this.shaft = new THREE.Mesh(shaftGeometry, this.material);
    this.head = new THREE.Mesh(headGeometry, this.material);
    for (const m of [this.shaft, this.head]) {
      m.renderOrder = OVERLAY_RENDER_ORDER;
      this.group.add(m);
    }
    this.group.visible = false;
  }

  /** Poses the arrow from `origin` along (vx, vy, vz) with total `lengthM` and shaft `radiusM`. */
  set(
    origin: THREE.Vector3,
    vx: number,
    vy: number,
    vz: number,
    lengthM: number,
    radiusM: number,
  ): void {
    this.dir.set(vx, vy, vz);
    if (this.dir.lengthSq() < 1e-12 || lengthM < 1e-4) {
      this.group.visible = false;
      return;
    }
    this.dir.normalize();
    const headLength = Math.min(lengthM * 0.5, radiusM * 6);
    const shaftLength = lengthM - headLength;
    this.group.position.copy(origin);
    this.group.quaternion.setFromUnitVectors(UP, this.dir);
    this.shaft.scale.set(radiusM, shaftLength, radiusM);
    this.shaft.position.set(0, shaftLength / 2, 0);
    this.head.scale.set(radiusM * 2.6, headLength, radiusM * 2.6);
    this.head.position.set(0, shaftLength + headLength / 2, 0);
    this.group.visible = true;
  }

  dispose(): void {
    this.material.dispose();
  }
}

function footLine(label: string, foot: FootState): string {
  const d = foot.deckPosition;
  const contact = foot.contact === "attached" ? "on " : "off";
  const detached = foot.contact === "attached" ? "" : ` ${foot.detachedForS.toFixed(2)}s`;
  return `${label} ${contact} along ${d.alongM.toFixed(2)} across ${d.acrossM.toFixed(2)} p ${foot.pressure.toFixed(2)}${detached}`;
}

/**
 * Debug overlay (STYLE.md §Debug, toggled with F1): force/impulse arrows colored by foot,
 * contact points, board axes and a mono text panel. Owns its on/off state.
 */
export class DebugOverlay {
  readonly group = new THREE.Group();
  /** Add this to the board group so it follows the interpolated board. */
  readonly axes: THREE.AxesHelper;
  private readonly panel: HTMLPreElement;
  private readonly arrows: Arrow[] = [];
  private readonly contacts: THREE.Mesh[] = [];
  private readonly shaftGeometry: THREE.BufferGeometry;
  private readonly headGeometry: THREE.BufferGeometry;
  private readonly sphereGeometry: THREE.BufferGeometry;
  private readonly contactMaterial: THREE.MeshBasicMaterial;
  private readonly origin = new THREE.Vector3();
  private readonly colors: Record<"front" | "back" | "neutral", THREE.Color>;
  private enabled = false;
  private sinceTextS = Number.POSITIVE_INFINITY;
  private fps = 0;
  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== "F1") return;
    event.preventDefault();
    this.setEnabled(!this.enabled);
  };

  constructor(
    parent: HTMLElement,
    private readonly config: PresentationConfig,
  ) {
    const d = config.debug;
    this.group.name = "debug";
    this.shaftGeometry = new THREE.CylinderGeometry(1, 1, 1, 6);
    this.headGeometry = new THREE.ConeGeometry(1, 1, 8);
    this.sphereGeometry = new THREE.SphereGeometry(d.contactSphereRadiusM, 8, 6);
    this.contactMaterial = new THREE.MeshBasicMaterial({ color: "#ffffff", depthTest: false });
    this.colors = {
      front: new THREE.Color(config.palette.frontFoot),
      back: new THREE.Color(config.palette.backFoot),
      neutral: new THREE.Color(d.neutralColor),
    };
    for (let i = 0; i < d.maxArrows; i += 1) {
      const arrow = new Arrow(this.shaftGeometry, this.headGeometry);
      this.arrows.push(arrow);
      this.group.add(arrow.group);
    }
    for (let i = 0; i < d.maxContacts; i += 1) {
      const sphere = new THREE.Mesh(this.sphereGeometry, this.contactMaterial);
      sphere.renderOrder = OVERLAY_RENDER_ORDER;
      sphere.visible = false;
      this.contacts.push(sphere);
      this.group.add(sphere);
    }
    // AxesHelper colors are X red, Y green, Z blue (STYLE.md).
    this.axes = new THREE.AxesHelper(d.axesLengthM);
    const axesMaterial = this.axes.material as THREE.LineBasicMaterial;
    axesMaterial.depthTest = false;
    this.axes.renderOrder = OVERLAY_RENDER_ORDER;

    this.panel = document.createElement("pre");
    this.panel.className = "skate-debug-panel";
    parent.appendChild(this.panel);
    window.addEventListener("keydown", this.onKeyDown);
    this.setEnabled(false);
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.group.visible = enabled;
    this.axes.visible = enabled;
    this.panel.hidden = !enabled;
    this.sinceTextS = Number.POSITIVE_INFINITY;
  }

  update(frame: RenderFrame, dtS: number): void {
    if (dtS > 0) this.fps = this.fps === 0 ? 1 / dtS : this.fps + (1 / dtS - this.fps) * 0.05;
    if (!this.enabled) return;
    this.updateArrows(frame.debug.vectors);
    this.updateContacts(frame);
    this.sinceTextS += dtS;
    if (this.sinceTextS >= 1 / this.config.debug.textRefreshHz) {
      this.sinceTextS = 0;
      this.panel.textContent = this.text(frame);
    }
  }

  private updateArrows(vectors: readonly DebugVector[]): void {
    const d = this.config.debug;
    let used = 0;
    for (const v of vectors) {
      const arrow = this.arrows[used];
      if (arrow === undefined) break;
      const opacity = arrowOpacity(v, d);
      if (opacity <= 0) continue;
      const o = v.originWorldM;
      this.origin.set(o.x, o.y, o.z);
      const w = v.vectorWorld;
      arrow.set(this.origin, w.x, w.y, w.z, arrowLengthM(v, d), arrowRadiusM(v, d));
      arrow.material.color.copy(this.colors[v.foot ?? "neutral"]);
      arrow.material.opacity = opacity;
      used += 1;
    }
    for (let i = used; i < this.arrows.length; i += 1) {
      const arrow = this.arrows[i];
      if (arrow !== undefined) arrow.group.visible = false;
    }
  }

  private updateContacts(frame: RenderFrame): void {
    const points = frame.currentBoard.contactPoints;
    for (let i = 0; i < this.contacts.length; i += 1) {
      const sphere = this.contacts[i];
      if (sphere === undefined) continue;
      const contact = points[i];
      sphere.visible = contact !== undefined;
      if (contact !== undefined) {
        const p = contact.pointWorldM;
        sphere.position.set(p.x, p.y, p.z);
      }
    }
  }

  private text(frame: RenderFrame): string {
    const board = frame.currentBoard;
    const v = board.linearVelocityMps;
    const speed = Math.hypot(v.x, v.y, v.z);
    const state = board.grounded ? `ground (${board.wheelsDown} wheels)` : "air";
    const r = frame.debug.rotation;
    const rot =
      r === null
        ? "roll    -   yaw    -   pitch    -"
        : `roll ${radToDeg(r.rollRad).toFixed(0).padStart(5)}° yaw ${radToDeg(r.yawRad)
            .toFixed(0)
            .padStart(5)}° pitch ${radToDeg(r.pitchRad).toFixed(0).padStart(5)}°`;
    return [
      `fps      ${this.fps.toFixed(0)}`,
      `physics  ${frame.debug.physicsStepMs.toFixed(2)} ms × ${frame.debug.stepsThisFrame}`,
      `speed    ${speed.toFixed(2)} m/s  (${(speed * 3.6).toFixed(1)} km/h)`,
      `state    ${state}`,
      rot,
      `stance   ${frame.stance}`,
      footLine("front", frame.rider.front),
      footLine("back ", frame.rider.back),
      frame.rider.bailed ? "BAILED" : "",
      `vectors  ${frame.debug.vectors.length}  contacts ${board.contactPoints.length}`,
    ]
      .filter((line) => line !== "")
      .join("\n");
  }

  dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    this.panel.remove();
    for (const arrow of this.arrows) arrow.dispose();
    this.shaftGeometry.dispose();
    this.headGeometry.dispose();
    this.sphereGeometry.dispose();
    this.contactMaterial.dispose();
    this.axes.dispose();
  }
}
