import type { FootId, Stance } from "../../../shared";
import type { RiderConfig } from "../rider.config";
import { DeckPosition } from "./deck-position";
import { isOverTail } from "./deck-surface";
import type { DeckGeometry, FootControl, RiderControls } from "./foot-force-model";

/** A stick position (board axes: x → +Z, y → nose). */
type Stick = FootControl["stick"];

/**
 * Where a foot WANTS to be on the deck for a stick value: rest position plus the stick
 * scaled by the reach. May lie outside the deck (a full sideways stick reaches past the
 * edge) — that is how flicks and step-offs happen.
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

/** Normalised downward pressure of each foot, [0, 1]. */
export interface FeetPressure {
  readonly front: number;
  readonly back: number;
  /** The part of the back pressure that comes from deliberately holding the tail, [0, 1]. */
  readonly tailHold: number;
}

/**
 * Pressure from the sticks: every foot carries `standingPressure`; the back foot adds
 * the tail hold (−stick.y while it stands over the tail), and the front foot unweights
 * by the same fraction (weight shifts to the back foot).
 */
export function feetPressure(
  controls: RiderControls,
  positions: Readonly<Record<FootId, DeckPosition>>,
  deck: DeckGeometry,
  config: RiderConfig,
): FeetPressure {
  const standing = config.forces.standingPressure;
  const overTail = isOverTail(deck, positions.back, config.feet.tailZoneMarginM);
  const tailHold = overTail ? clamp01(-controls.back.stick.y) : 0;
  return {
    front: clamp01(standing * (1 - tailHold)),
    back: clamp01(standing + tailHold),
    tailHold,
  };
}

/**
 * Sign of the board's Z axis that is the TOE edge for a stance (ADR 0002): +1 regular
 * (the rider faces +Z), −1 goofy. A kickflip flicks toward the toe side, a heelflip
 * toward the heel side (−toe).
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
