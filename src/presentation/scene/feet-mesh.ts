import * as THREE from "three";
import { BoardSpec } from "../../contexts/board";
import type { FootState, RiderState } from "../../contexts/rider";
import type { FootId, Stance } from "../../shared";
import type { PresentationConfig } from "../presentation.config";
import { flatMaterial } from "./materials";
import { buildShoeGeometry, createShoeMaterials, shoeAnkleLocal } from "./shoe-geometry";

const UP = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/** One shoe + leg stub. */
class FootView {
  readonly shoe: THREE.Mesh;
  readonly leg: THREE.Mesh;
  private readonly solid: THREE.MeshStandardMaterial[];
  private readonly ghost: THREE.MeshStandardMaterial[];
  private readonly local = new THREE.Vector3();
  private readonly world = new THREE.Vector3();
  private readonly kick = new THREE.Quaternion();
  private readonly yaw = new THREE.Quaternion();
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
   * Attached: stands on the deck at `deckPosition` of the (interpolated) board, tilted
   * with the kick. Detached: at its world position, heading-aligned, semi-transparent.
   */
  update(
    foot: FootState,
    spec: BoardSpec,
    board: THREE.Object3D,
    headingQuat: THREE.Quaternion,
    torso: THREE.Vector3,
    stance: Stance,
  ): void {
    const f = this.config.feet;
    const attached = foot.contact === "attached";
    const squash = 1 - f.pressureSquash * (attached ? foot.pressure : 0);
    // Shoe +X (toe) → the toe edge (+Z regular, −Z goofy), then turned toward the nose (+X).
    const towardNoseRad = this.id === "front" ? f.frontFootYawRad : f.backFootYawRad;
    const toeSign = stance === "regular" ? 1 : -1;
    this.yaw.setFromAxisAngle(UP, toeSign * (towardNoseRad - Math.PI / 2));

    if (attached) {
      const { alongM, acrossM } = foot.deckPosition;
      const top = BoardSpec.deckTopPointLocal(spec, alongM, acrossM);
      const halfFlat = BoardSpec.flatLengthM(spec) / 2;
      const onKick = Math.abs(top.x) > halfFlat;
      const kickRad = onKick ? Math.sign(top.x) * spec.deck.kickAngleRad : 0;
      this.kick.setFromAxisAngle(Z_AXIS, kickRad);
      // Shoe origin is the centre of its sole's bottom face: it sits right on the grip.
      this.local.set(top.x, top.y, top.z);
      this.world.copy(this.local).applyMatrix4(board.matrixWorld);
      this.shoe.position.copy(this.world);
      this.shoe.quaternion.copy(board.quaternion).multiply(this.kick).multiply(this.yaw);
      this.shoe.material = this.solid;
    } else {
      const p = foot.positionWorldM;
      this.shoe.position.set(p.x, p.y, p.z);
      this.shoe.quaternion.copy(headingQuat).multiply(this.yaw);
      this.shoe.material = this.ghost;
    }
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

  update(
    rider: RiderState,
    spec: BoardSpec,
    board: THREE.Object3D,
    headingQuat: THREE.Quaternion,
    stance: Stance,
  ): void {
    const t = rider.torsoPositionWorldM;
    this.torso.set(t.x, t.y, t.z);
    this.front.update(rider.front, spec, board, headingQuat, this.torso, stance);
    this.back.update(rider.back, spec, board, headingQuat, this.torso, stance);
  }

  dispose(): void {
    this.geometry.dispose();
    this.legGeometry.dispose();
    this.legMaterial.dispose();
    this.front.dispose();
    this.back.dispose();
  }
}
