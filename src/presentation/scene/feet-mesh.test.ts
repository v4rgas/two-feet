import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { FootState, RiderState } from "../../contexts/rider";
import { DeckPosition } from "../../contexts/rider";
import { Vec3 } from "../../shared";
import { PRESENTATION_CONFIG } from "../presentation.config";
import { FeetMesh } from "./feet-mesh";

function foot(id: "front" | "back", boardM: Vec3 | null, worldM: Vec3): FootState {
  return {
    id,
    contact: boardM === null ? "airborne" : "attached",
    riderPosition: DeckPosition.create(0, 0),
    deckPosition: DeckPosition.create(0, 0),
    pressure: 0,
    positionWorldM: worldM,
    positionRiderM: Vec3.ZERO,
    positionBoardM: boardM,
    detachedForS: 0,
  };
}

function rider(front: FootState, back: FootState): RiderState {
  return {
    front,
    back,
    torsoPositionWorldM: Vec3.create(0, 1, 0),
    headingRad: 0,
    windUpRad: 0,
    bodySpinRateRadps: 0,
    bailed: false,
    grind: null,
    lastGrindExit: null,
    popOutTurnRad: 0,
    kickflipFlick: null,
  };
}

describe("feet mesh", () => {
  it("an attached foot is drawn on its board-frame point of the board as drawn (no lag)", () => {
    const feet = new FeetMesh(PRESENTATION_CONFIG);
    const prevLocal = Vec3.create(0.2, 0.1, 0.01);
    const curLocal = Vec3.create(0.21, 0.1, 0.02);
    // World positions far from the board: they must not be used for an attached foot.
    const far = Vec3.create(99, 99, 99);
    const previous = rider(foot("front", prevLocal, far), foot("back", null, Vec3.ZERO));
    const current = rider(foot("front", curLocal, far), foot("back", null, Vec3.ZERO));
    const pose = {
      position: new THREE.Vector3(3, 0.2, -1),
      quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.7),
    };
    const alpha = 0.4;
    feet.update(previous, current, alpha, new THREE.Quaternion(), "regular", {
      stickX: { front: 0, back: 0 },
      airborne: false,
      dtS: 1 / 60,
      boardPose: pose,
    });
    const shoe = feet.group.getObjectByName("foot:front");
    const local = new THREE.Vector3(
      prevLocal.x + (curLocal.x - prevLocal.x) * alpha,
      prevLocal.y,
      prevLocal.z + (curLocal.z - prevLocal.z) * alpha,
    );
    const expected = local.applyQuaternion(pose.quaternion).add(pose.position);
    expect(shoe?.position.distanceTo(expected)).toBeLessThan(1e-6);
    feet.dispose();
  });

  it("the foot flicking a kickflip points its toes down; otherwise the front foot lifts its toes", () => {
    const toeDrop = (flick: boolean): number => {
      const feet = new FeetMesh(PRESENTATION_CONFIG);
      const f = foot("front", null, Vec3.create(0, 0.5, 0));
      const state = {
        ...rider(f, foot("back", null, Vec3.ZERO)),
        kickflipFlick: flick ? ("front" as const) : null,
      };
      const inputs = {
        stickX: { front: -1, back: 0 },
        airborne: true,
        dtS: 0.1,
        boardPose: { position: new THREE.Vector3(), quaternion: new THREE.Quaternion() },
      };
      for (let i = 0; i < 10; i += 1) {
        feet.update(state, state, 1, new THREE.Quaternion(), "regular", inputs);
      }
      const shoe = feet.group.getObjectByName("foot:front");
      if (shoe === undefined) throw new Error("no shoe");
      shoe.updateMatrixWorld(true);
      const toe = new THREE.Vector3(0.1, 0, 0).applyMatrix4(shoe.matrixWorld);
      const heel = new THREE.Vector3(-0.1, 0, 0).applyMatrix4(shoe.matrixWorld);
      feet.dispose();
      return heel.y - toe.y;
    };
    expect(toeDrop(true)).toBeGreaterThan(0.02);
    expect(toeDrop(false)).toBeLessThan(-0.02);
  });
});
