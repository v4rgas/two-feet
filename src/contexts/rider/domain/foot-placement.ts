import type { FootId, Stance } from "../../../shared";
import type { RiderConfig } from "../rider.config";
import { DeckPosition } from "./deck-position";
import { isOverTail } from "./deck-surface";
import type { DeckGeometry, FootControl, RiderControls } from "./foot-force-model";

/** A stick position (rider frame: x → the rider's +Z side, y → the rider's front). */
type Stick = FootControl["stick"];

/**
 * Where the rider holds a foot for a stick value, in the RIDER frame: rest position plus
 * the stick scaled by the reach.
 */
export function targetDeckPosition(
  foot: FootId,
  stick: Stick,
  feet: RiderConfig["feet"],
): DeckPosition {
  const restAlong = foot === "front" ? feet.frontRestAlongM : feet.backRestAlongM;
  return DeckPosition.create(
    restAlong + stick.y * feet.reachAlongM,
    feet.restAcrossM + stick.x * feet.reachAcrossM,
  );
}

/** Normalised weight on each foot, [0, 1] (HUD, feet squash). */
export interface FeetPressure {
  readonly front: number;
  readonly back: number;
  /** How hard the back foot holds a kicked end down (−stick.y over the tail), [0, 1]. */
  readonly tailHold: number;
}

/**
 * Weight split from the sticks: evenly on both feet, shifting to the back foot while it
 * holds the tail down (a manual or a load).
 */
export function feetPressure(
  controls: RiderControls,
  positions: Readonly<Record<FootId, DeckPosition>>,
  deck: DeckGeometry,
  config: RiderConfig,
): FeetPressure {
  const tailHold = isOverTail(deck, positions.back, config.feet.tailZoneMarginM)
    ? clamp01(-controls.back.stick.y)
    : 0;
  return { front: 0.5 * (1 - tailHold), back: 0.5 * (1 + tailHold), tailHold };
}

/**
 * Sign of the rider frame's Z axis that is the TOE edge for a stance (ADR 0002): +1
 * regular (the rider faces +Z), −1 goofy.
 */
export function toeSideSign(stance: Stance): 1 | -1 {
  return stance === "regular" ? 1 : -1;
}

/** Euclidean length of a stick value. */
export function stickMagnitude(stick: Stick): number {
  return Math.hypot(stick.x, stick.y);
}

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
