import * as THREE from "three";
import { BoardSpec, WHEEL_IDS } from "../../contexts/board";
import type { PresentationConfig } from "../presentation.config";
import { flatMaterial } from "./materials";

/**
 * Board meshes built ONLY from `BoardSpec` geometry helpers, so what the player sees is
 * exactly the collider (STYLE.md §3D). The group's local frame is the board frame.
 */
export interface BoardMesh {
  readonly group: THREE.Group;
  /** Wheel pivots in `WHEEL_IDS` order (rotate around local Z to spin). */
  readonly wheels: readonly THREE.Object3D[];
  /** Deck material, for the catch flash. */
  readonly deckMaterial: THREE.MeshStandardMaterial;
  dispose(): void;
}

/**
 * Side profile (XY) of the deck's top surface, tail tip → nose tip, from
 * `BoardSpec.deckTopPointLocal`: the tips, and the two bends where the kicks start.
 */
export function deckTopProfile(spec: BoardSpec): THREE.Vector2[] {
  const halfLen = spec.deck.lengthM / 2;
  const halfFlat = BoardSpec.flatLengthM(spec) / 2;
  return [-halfLen, -halfFlat, halfFlat, halfLen].map((x) => {
    const p = BoardSpec.deckTopPointLocal(spec, x, 0);
    return new THREE.Vector2(p.x, p.y);
  });
}

/** A slab following `top` (side profile), `thicknessM` thick below it, extruded across Z. */
function profileSlab(
  top: THREE.Vector2[],
  thicknessM: number,
  widthM: number,
): THREE.BufferGeometry {
  const outline = [...top, ...top.map((p) => new THREE.Vector2(p.x, p.y - thicknessM)).reverse()];
  const shape = new THREE.Shape(outline);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: widthM, bevelEnabled: false });
  geometry.translate(0, 0, -widthM / 2);
  return geometry;
}

/** 64×64 speckle used as the grip tape's only texture (STYLE.md allows grip noise). */
function gripNoiseTexture(): THREE.DataTexture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  let seed = 1337;
  for (let i = 0; i < size * size; i += 1) {
    seed = (seed * 16807) % 2147483647;
    const v = 200 + (seed % 56);
    data.set([v, v, v, 255], i * 4);
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function buildTruck(spec: BoardSpec, x: number, metal: THREE.Material): THREE.Group {
  const truck = new THREE.Group();
  const { thicknessM } = spec.deck;
  const { heightM, axleTrackM } = spec.trucks;
  const underside = -thicknessM / 2;
  const axleY = underside - heightM;

  const baseplate = new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.006, 0.056), metal);
  baseplate.position.set(x, underside - 0.003, 0);
  const riser = new THREE.Mesh(new THREE.BoxGeometry(0.03, heightM * 0.6, 0.034), metal);
  riser.position.set(x, underside - heightM * 0.35, 0);
  const hangerWidth = axleTrackM - spec.wheels.widthM;
  const hanger = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.018, hangerWidth), metal);
  hanger.position.set(x, axleY + 0.006, 0);
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, axleTrackM, 6), metal);
  axle.rotation.x = Math.PI / 2;
  axle.position.set(x, axleY, 0);
  for (const part of [baseplate, riser, hanger, axle]) {
    part.castShadow = true;
    truck.add(part);
  }
  return truck;
}

function buildWheel(
  spec: BoardSpec,
  config: PresentationConfig,
  wheel: THREE.Material,
  hub: THREE.Material,
): THREE.Object3D {
  const { radiusM, widthM } = spec.wheels;
  const pivot = new THREE.Object3D();
  const tire = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusM, radiusM, widthM, config.board.wheelSegments),
    wheel,
  );
  tire.rotation.x = Math.PI / 2;
  tire.castShadow = true;
  pivot.add(tire);
  // Off-centre hub marks so the spin reads even at low poly counts.
  const mark = new THREE.Mesh(
    new THREE.BoxGeometry(radiusM * 0.9, radiusM * 0.25, widthM * 1.02),
    hub,
  );
  mark.position.x = radiusM * 0.35;
  pivot.add(mark);
  return pivot;
}

export function buildBoardMesh(spec: BoardSpec, config: PresentationConfig): BoardMesh {
  const { palette, board: look } = config;
  const group = new THREE.Group();
  group.name = "board";

  const deckMaterial = flatMaterial(palette.deck);
  deckMaterial.emissive.set("#ffffff");
  deckMaterial.emissiveIntensity = 0;
  const gripTexture = gripNoiseTexture();
  gripTexture.repeat.set(8, 2);
  const gripMaterial = flatMaterial(palette.ink);
  gripMaterial.map = gripTexture;
  gripMaterial.roughness = 1;
  const metal = flatMaterial(palette.metal);
  metal.metalness = 0.4;
  metal.roughness = 0.5;
  const wheelMaterial = flatMaterial(palette.wheel);
  const hubMaterial = flatMaterial(palette.concrete300);

  const top = deckTopProfile(spec);
  const deck = new THREE.Mesh(
    profileSlab(top, spec.deck.thicknessM, spec.deck.widthM),
    deckMaterial,
  );
  deck.castShadow = true;
  deck.receiveShadow = true;
  group.add(deck);

  // Grip sits on top of the collider surface (a hair above, visual only), inset from the edge.
  const gripTop = top.map((p) => new THREE.Vector2(p.x * 0.995, p.y + look.gripThicknessM));
  const grip = new THREE.Mesh(
    profileSlab(gripTop, look.gripThicknessM * 1.5, spec.deck.widthM - 2 * look.gripInsetM),
    gripMaterial,
  );
  grip.receiveShadow = true;
  group.add(grip);

  const halfBase = spec.trucks.wheelbaseM / 2;
  group.add(buildTruck(spec, halfBase, metal));
  group.add(buildTruck(spec, -halfBase, metal));

  const wheels: THREE.Object3D[] = [];
  for (const id of WHEEL_IDS) {
    const pivot = buildWheel(spec, config, wheelMaterial, hubMaterial);
    const c = BoardSpec.wheelCenterLocal(spec, id);
    pivot.position.set(c.x, c.y, c.z);
    // Right wheels (+Z) show their hub mark outward; mirror the left ones.
    if (!id.includes("Right")) pivot.scale.z = -1;
    group.add(pivot);
    pivot.name = id;
    wheels.push(pivot);
  }

  return {
    group,
    wheels,
    deckMaterial,
    dispose(): void {
      group.traverse((node) => {
        if (node instanceof THREE.Mesh) node.geometry.dispose();
      });
      for (const m of [deckMaterial, gripMaterial, metal, wheelMaterial, hubMaterial]) m.dispose();
      gripTexture.dispose();
    },
  };
}
