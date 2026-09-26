/*
 * Compile-time checks of the STRUCTURAL PORTS (ADR 0001): domains declare the minimal
 * shape they need from other contexts; these assertions make tsc fail if a producer's
 * VO drifts away from what a consumer's domain expects. No runtime code.
 */
import type { BoardSnapshot, BoardSpec, StaticColliderDesc } from "../contexts/board";
import type { IntentFrame } from "../contexts/input";
import type { BoardKinematics, DeckGeometry, RiderControls } from "../contexts/rider";
import type { MotionSample } from "../contexts/tricks";
import type { Obstacle } from "../contexts/world";

type Assert<T extends true> = T;
type Extends<A, B> = [A] extends [B] ? true : false;

export type StructuralContractChecks = [
  Assert<Extends<IntentFrame, RiderControls>>,
  Assert<Extends<BoardSnapshot, BoardKinematics>>,
  Assert<Extends<BoardSpec, DeckGeometry>>,
  Assert<Extends<BoardSnapshot, MotionSample>>,
  Assert<Extends<Obstacle, StaticColliderDesc>>,
];
