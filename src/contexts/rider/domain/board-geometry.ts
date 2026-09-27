import { Transform, Vec3 } from "../../../shared";
import { DeckPosition } from "./deck-position";
import { deckTopPointLocal } from "./deck-surface";
import type { BoardKinematics, DeckGeometry } from "./foot-force-model";

/*
 * World-space reads of the board used by the rider domain (pure functions over
 * `BoardKinematics`). Angles follow ADR 0002: pitch + = nose up, roll about board X.
 */

/** Board local +Y in world. */
export function boardUp(board: BoardKinematics): Vec3 {
  return Transform.toWorldDirection(board.transform, Vec3.UNIT_Y);
}

/** Board local +X (nose) in world. */
export function boardForward(board: BoardKinematics): Vec3 {
  return Transform.toWorldDirection(board.transform, Vec3.UNIT_X);
}

/** Angle between the board's up axis and world up, rad. */
export function tiltRad(board: BoardKinematics): number {
  return Math.acos(Math.max(-1, Math.min(1, boardUp(board).y)));
}

/** Nose elevation above the horizon, rad (+ = nose up). */
export function pitchRad(board: BoardKinematics): number {
  return Math.asin(Math.max(-1, Math.min(1, boardForward(board).y)));
}

/**
 * A TOUCHDOWN OUTSIDE TOLERANCE (MECHANICS.md "Bail: the board goes ragdoll"): in the air
 * for at least `minAirS`, a deck / tail / nose touching the ground or a ramp (grind edges
 * and ledges are the lock-on's) with the board's up more than `maxTiltRad` from that
 * contact's normal. Returns the worst up · normal, or null when there is no such touch.
 */
export function offAngleTouchUpDot(
  board: BoardKinematics,
  minAirS: number,
  maxTiltRad: number,
): number | null {
  if (board.grounded || (board.airtimeS ?? 0) < minAirS) return null;
  const up = boardUp(board);
  let worst: number | null = null;
  for (const c of board.contactPoints ?? []) {
    if (c.part !== "deck" && c.part !== "tail" && c.part !== "nose") continue;
    if (c.surface === "grindable" || c.surface === "ledge" || c.normalWorld === undefined) continue;
    const upDot = Vec3.dot(up, c.normalWorld);
    if (worst === null || upDot < worst) worst = upDot;
  }
  return worst !== null && worst < Math.cos(maxTiltRad) ? worst : null;
}

/** Heading of the board's long axis (+X flattened), rad around world +Y, or null if vertical. */
export function boardHeadingRad(board: BoardKinematics, minHorizontal = 0.2): number | null {
  const f = boardForward(board);
  if (Math.hypot(f.x, f.z) < minHorizontal) return null;
  return Math.atan2(-f.z, f.x);
}

/**
 * The deck spot of a rider-frame foot position for a foot STANDING on the deck: the
 * rider-frame offset turned by the rider heading's yaw in the board's own plane, so it
 * holds on a bank or a transition as on the flat (a vertical line would spread the feet
 * onto the kicks of a steep board). On a flat board it is `spotUnder` of the held point
 * over the board centre. Null when the heading has no direction in the deck's plane.
 */
export function spotStanding(
  board: BoardKinematics,
  riderHeadingRad: number,
  riderPosition: DeckPosition,
): DeckPosition | null {
  const heading = Vec3.create(Math.cos(riderHeadingRad), 0, -Math.sin(riderHeadingRad));
  const h = Transform.toLocalDirection(board.transform, heading);
  if (Math.hypot(h.x, h.z) < 0.2) return null;
  const d = Math.atan2(-h.z, h.x);
  const { alongM: a, acrossM: c } = riderPosition;
  return DeckPosition.create(a * Math.cos(d) + c * Math.sin(d), -a * Math.sin(d) + c * Math.cos(d));
}

/**
 * The deck spot (board frame) straight under a world point: where a vertical line through
 * it meets the deck's mid-plane. Falls back to the projection along board Y when the
 * board is on edge (the line runs along the deck).
 */
export function spotUnder(board: BoardKinematics, worldM: Vec3): DeckPosition {
  const local = Transform.toLocalPoint(board.transform, worldM);
  const down = Transform.toLocalDirection(board.transform, Vec3.create(0, -1, 0));
  if (Math.abs(down.y) < 0.2) return DeckPosition.create(local.x, local.z);
  const t = -local.y / down.y;
  return DeckPosition.create(local.x + down.x * t, local.z + down.z * t);
}

/** Grip-tape point (world) of a deck spot. */
export function deckPointWorld(
  deck: DeckGeometry,
  board: BoardKinematics,
  spot: DeckPosition,
): Vec3 {
  return Transform.toWorldPoint(
    board.transform,
    deckTopPointLocal(deck, spot.alongM, spot.acrossM),
  );
}

/** Height of the board origin above flat ground when resting on its wheels, m. */
export function restHeightM(deck: DeckGeometry): number {
  return deck.wheels.radiusM + deck.trucks.heightM + deck.deck.thicknessM / 2;
}

/** Wraps an angle to (−π, π]. */
/**
 * The ground the board rolls on: the mean normal of its wheel contacts (unit), or world up
 * when no wheel touches (or the snapshot carries no contacts).
 */
export function supportNormal(board: BoardKinematics): Vec3 {
  let sum = Vec3.ZERO;
  for (const c of board.contactPoints ?? []) {
    if (c.normalWorld === undefined || c.part === undefined || !c.part.endsWith("Wheel")) continue;
    sum = Vec3.add(sum, c.normalWorld);
  }
  return Vec3.lengthSq(sum) > 1e-9 ? Vec3.normalize(sum) : Vec3.UNIT_Y;
}

export function wrapPi(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** Signed distance of an angle to the nearer of 0 and π (i.e. the board either way round). */
export function axisErrorRad(a: number): number {
  let e = wrapPi(a);
  if (e > Math.PI / 2) e -= Math.PI;
  else if (e < -Math.PI / 2) e += Math.PI;
  return e;
}
