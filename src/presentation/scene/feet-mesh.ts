import * as THREE from "three";
import type { FootState, RiderState } from "../../contexts/rider";
import type { FootId, Stance } from "../../shared";
import type { PresentationConfig } from "../presentation.config";
import { flatMaterial } from "./materials";
import { buildShoeGeometry, createShoeMaterials, shoeAnkleLocal } from "./shoe-geometry";

const UP = new THREE.Vector3(0, 1, 0);
const WIDTH_AXIS = new THREE.Vector3(0, 0, 1);

/** What the feet need besides the rider state: the sticks (ankle tilt) and air/ground. */
export interface FeetInputs {
  /** Each foot's stick x (+1 = board +Z side, the toe edge in regular). */
  readonly stickX: Readonly<Record<FootId, number>>;
  readonly airborne: boolean;
  readonly dtS: number;
}

/** One shoe + leg stub. */
class FootView {
  readonly shoe: THREE.Mesh;
  readonly leg: THREE.Mesh;
  private readonly solid: THREE.MeshStandardMaterial[];
  private readonly ghost: THREE.MeshStandardMaterial[];
  private readonly yaw = new THREE.Quaternion();
  private readonly tilt = new THREE.Quaternion();
  private readonly pivot = new THREE.Vector3();
  private tiltRad = 0;
  private readonly toTorso = new THREE.Vector3();
  private readonly ankle = new THREE.Vector3();

  constructor(
    readonly id: FootId,
    geometry: THREE.BufferGeometry,
    legGeometry: THREE.BufferGeometry,
    legMaterial: THREE.Material,
    private readonly config: PresentationConfig,
    private readonly ankleLocal: { readonly x: number; readonly y: number },
  ) {
    const p = config.palette;
    const colors = {
      upper: id === "front" ? p.frontFoot : p.backFoot,
      sole: p.shoeSole,
      lace: p.ink,
    };
    this.solid = createShoeMaterials(colors);
    this.ghost = createShoeMaterials(colors, config.feet.detachedOpacity);
    this.shoe = new THREE.Mesh(geometry, this.solid);
    this.shoe.name = `foot:${id}`;
    this.leg = new THREE.Mesh(legGeometry, legMaterial);
    this.leg.name = `leg:${id}`;
  }

  /**
   * At the foot's world position, upright in the rider heading; semi-transparent when
   * detached.
   */
  update(
    previous: FootState,
    foot: FootState,
    alpha: number,
    headingQuat: THREE.Quaternion,
    torso: THREE.Vector3,
    stance: Stance,
    inputs: FeetInputs,
  ): void {
    const f = this.config.feet;
    const attached = foot.contact === "attached";
    const squash = 1 - f.pressureSquash * (attached ? foot.pressure : 0);
    // Shoe +X (toe) → the toe edge (+Z regular, −Z goofy), then turned toward the nose (+X).
    const towardNoseRad = this.id === "front" ? f.frontFootYawRad : f.backFootYawRad;
    const toeSign = stance === "regular" ? 1 : -1;
    this.yaw.setFromAxisAngle(UP, toeSign * (towardNoseRad - Math.PI / 2));

    // Feet belong to the rider (MECHANICS.md): always upright in the rider heading, never
    // turned with the board. The domain moves the foot continuously (an attached one onto the
    // grip tape); here the shoe's sole sits on that point, interpolated between physics
    // steps like the board.
    const a = previous.positionWorldM;
    const b = foot.positionWorldM;
    this.shoe.position.set(
      a.x + (b.x - a.x) * alpha,
      a.y + (b.y - a.y) * alpha,
      a.z + (b.z - a.z) * alpha,
    );
    this.shoe.quaternion.copy(headingQuat).multiply(this.yaw);
    this.applyAnkleTilt(inputs);
    this.shoe.material = attached ? this.solid : this.ghost;
    this.shoe.scale.set(1, squash, 1);

    // Leg stub: from the ankle opening (collar) toward the torso, fixed length.
    this.ankle
      .set(this.ankleLocal.x, this.ankleLocal.y * squash, 0)
      .applyQuaternion(this.shoe.quaternion)
      .add(this.shoe.position);
    this.toTorso.copy(torso).sub(this.ankle);
    if (this.toTorso.lengthSq() < 1e-6) this.toTorso.copy(UP);
    this.toTorso.normalize();
    this.leg.quaternion.setFromUnitVectors(UP, this.toTorso);
    this.leg.position.copy(this.ankle).addScaledVector(this.toTorso, f.legLengthM / 2);
    this.leg.visible = attached;
  }

  /**
   * Ankle tilt (STYLE.md, visual only): in the air, sideways stick (|x|, either edge) tilts
   * the shoe about its width axis around the ball of the foot — the back foot toe down, the
   * front foot toes up; flat on the ground. The shoe is raised just enough
   * that no part of the sole goes below the sole's resting plane (never into the deck).
   */
  private applyAnkleTilt(inputs: FeetInputs): void {
    const f = this.config.feet;
    // The back foot always points its toe down, the front foot lifts its toes; the amount
    // follows |stick x| of that foot (either edge).
    const amount = Math.min(1, Math.abs(inputs.stickX[this.id]));
    const direction = this.id === "back" ? -1 : 1;
    const wanted = inputs.airborne ? direction * amount * f.ankleTiltMaxRad : 0;
    const k = inputs.dtS > 0 ? 1 - Math.exp(-inputs.dtS / f.ankleTiltResponseS) : 0;
    this.tiltRad += (wanted - this.tiltRad) * k;
    if (Math.abs(this.tiltRad) < 1e-4) return;
    const half = f.shoe.lengthM / 2;
    const ballX = half * f.ankleBallFraction;
    const sin = Math.sin(this.tiltRad);
    // Lowest sole end after tilting about the ball (heel at −half, toe at +half).
    const lowest = Math.min((-half - ballX) * sin, (half - ballX) * sin, 0);
    this.tilt.setFromAxisAngle(WIDTH_AXIS, this.tiltRad);
    // Keep the ball in place: origin += R·(ball − tilt·ball), then lift (R is yaw only).
    this.pivot.set(ballX, 0, 0).applyQuaternion(this.tilt);
    this.pivot.set(ballX - this.pivot.x, -this.pivot.y - lowest, -this.pivot.z);
    this.shoe.position.add(this.pivot.applyQuaternion(this.shoe.quaternion));
    this.shoe.quaternion.multiply(this.tilt);
  }

  dispose(): void {
    for (const m of this.solid) m.dispose();
    for (const m of this.ghost) m.dispose();
  }
}

/** The rider's two feet (STYLE.md: low-poly skate shoes in the foot colors, a hint of legs). */
export class FeetMesh {
  readonly group = new THREE.Group();
  private readonly geometry: THREE.BufferGeometry;
  private readonly legGeometry: THREE.BufferGeometry;
  private readonly legMaterial: THREE.MeshStandardMaterial;
  private readonly front: FootView;
  private readonly back: FootView;
  private readonly torso = new THREE.Vector3();

  constructor(config: PresentationConfig) {
    const f = config.feet;
    this.group.name = "feet";
    // Shoe frame: +X toe; `FootView` yaws it across the deck (the rider stands sideways).
    this.geometry = buildShoeGeometry(f.shoe);
    const ankle = shoeAnkleLocal(f.shoe);
    this.legGeometry = new THREE.CylinderGeometry(
      f.legRadiusM * 0.8,
      f.legRadiusM,
      f.legLengthM,
      8,
    );
    this.legMaterial = flatMaterial(config.palette.concrete600, f.legOpacity);
    this.legMaterial.depthWrite = false;
    this.front = new FootView(
      "front",
      this.geometry,
      this.legGeometry,
      this.legMaterial,
      config,
      ankle,
    );
    this.back = new FootView(
      "back",
      this.geometry,
      this.legGeometry,
      this.legMaterial,
      config,
      ankle,
    );
    for (const view of [this.front, this.back]) this.group.add(view.shoe, view.leg);
  }

  /** Draws the feet between the previous and the current rider state (`alpha` in [0, 1)). */
  update(
    previous: RiderState,
    rider: RiderState,
    alpha: number,
    headingQuat: THREE.Quaternion,
    stance: Stance,
    inputs: FeetInputs,
  ): void {
    const a = previous.torsoPositionWorldM;
    const b = rider.torsoPositionWorldM;
    this.torso.set(a.x + (b.x - a.x) * alpha, a.y + (b.y - a.y) * alpha, a.z + (b.z - a.z) * alpha);
    this.front.update(previous.front, rider.front, alpha, headingQuat, this.torso, stance, inputs);
    this.back.update(previous.back, rider.back, alpha, headingQuat, this.torso, stance, inputs);
  }

  dispose(): void {
    this.geometry.dispose();
    this.legGeometry.dispose();
    this.legMaterial.dispose();
    this.front.dispose();
    this.back.dispose();
  }
}
