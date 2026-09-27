import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { BoardSpec } from "../../contexts/board";
import type { FootState, RiderState } from "../../contexts/rider";
import type { FootId } from "../../shared";
import type { PresentationConfig } from "../presentation.config";
import { flatMaterial } from "./materials";

const UP = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);

/** One shoe + leg stub. */
class FootView {
  readonly shoe: THREE.Mesh;
  readonly leg: THREE.Mesh;
  private readonly solid: THREE.MeshStandardMaterial;
  private readonly ghost: THREE.MeshStandardMaterial;
  private readonly local = new THREE.Vector3();
  private readonly world = new THREE.Vector3();
  private readonly kick = new THREE.Quaternion();
  private readonly yaw = new THREE.Quaternion();
  private readonly toTorso = new THREE.Vector3();

  constructor(
    readonly id: FootId,
    geometry: THREE.BufferGeometry,
    legGeometry: THREE.BufferGeometry,
    legMaterial: THREE.Material,
    private readonly config: PresentationConfig,
  ) {
    const color = id === "front" ? config.palette.frontFoot : config.palette.backFoot;
    this.solid = flatMaterial(color);
    this.ghost = flatMaterial(color, config.feet.detachedOpacity);
    this.ghost.depthWrite = false;
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
  ): void {
    const f = this.config.feet;
    const attached = foot.contact === "attached";
    const squash = 1 - f.pressureSquash * (attached ? foot.pressure : 0);
    const yawRad = this.id === "front" ? f.frontFootYawRad : f.backFootYawRad;
    this.yaw.setFromAxisAngle(UP, yawRad);

    if (attached) {
      const { alongM, acrossM } = foot.deckPosition;
      const top = BoardSpec.deckTopPointLocal(spec, alongM, acrossM);
      const halfFlat = BoardSpec.flatLengthM(spec) / 2;
      const onKick = Math.abs(top.x) > halfFlat;
      const kickRad = onKick ? Math.sign(top.x) * spec.deck.kickAngleRad : 0;
      this.kick.setFromAxisAngle(Z_AXIS, kickRad);
      // Shoe origin is its centre: lift it by half its (squashed) height along the kick normal.
      const lift = (f.shoeHeightM * squash) / 2;
      this.local.set(-Math.sin(kickRad) * lift, Math.cos(kickRad) * lift, 0);
      this.local.x += top.x;
      this.local.y += top.y;
      this.local.z += top.z;
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

    // Leg stub: from the top of the shoe toward the torso, fixed length.
    this.toTorso.copy(torso).sub(this.shoe.position);
    if (this.toTorso.lengthSq() < 1e-6) this.toTorso.copy(UP);
    this.toTorso.normalize();
    this.leg.quaternion.setFromUnitVectors(UP, this.toTorso);
    this.leg.position
      .copy(this.shoe.position)
      .addScaledVector(this.toTorso, f.legLengthM / 2 + (f.shoeHeightM * squash) / 2);
    this.leg.visible = attached;
  }

  dispose(): void {
    this.solid.dispose();
    this.ghost.dispose();
  }
}

/** The rider's two feet (STYLE.md: rounded-box shoes in the foot colors, a hint of legs). */
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
    // Long axis across the deck (board Z): the rider stands sideways.
    this.geometry = new RoundedBoxGeometry(
      f.shoeWidthM,
      f.shoeHeightM,
      f.shoeLengthM,
      2,
      f.shoeCornerRadiusM,
    );
    this.legGeometry = new THREE.CylinderGeometry(
      f.legRadiusM * 0.8,
      f.legRadiusM,
      f.legLengthM,
      8,
    );
    this.legMaterial = flatMaterial(config.palette.concrete600, f.legOpacity);
    this.legMaterial.depthWrite = false;
    this.front = new FootView("front", this.geometry, this.legGeometry, this.legMaterial, config);
    this.back = new FootView("back", this.geometry, this.legGeometry, this.legMaterial, config);
    for (const view of [this.front, this.back]) this.group.add(view.shoe, view.leg);
  }

  update(
    rider: RiderState,
    spec: BoardSpec,
    board: THREE.Object3D,
    headingQuat: THREE.Quaternion,
  ): void {
    const t = rider.torsoPositionWorldM;
    this.torso.set(t.x, t.y, t.z);
    this.front.update(rider.front, spec, board, headingQuat, this.torso);
    this.back.update(rider.back, spec, board, headingQuat, this.torso);
  }

  dispose(): void {
    this.geometry.dispose();
    this.legGeometry.dispose();
    this.legMaterial.dispose();
    this.front.dispose();
    this.back.dispose();
  }
}
