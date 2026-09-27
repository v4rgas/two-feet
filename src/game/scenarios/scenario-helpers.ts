/*
 * Shared gestures and measurements for the full-loop scenarios (test support only).
 * Gestures follow MECHANICS.md; keys are chosen by foot role and board edge, so the same
 * script plays in both stances (regular: WASD = front, arrows = back).
 */
import type { FootId, Kick, Stance } from "../../shared";
import { Transform, Vec3 } from "../../shared";
import type { FootDirection, HarnessOptions, StepRecord } from "./scenario-harness";
import { ScenarioHarness } from "./scenario-harness";

/** Standing start, then `pushS` of Space; returns the harness rolling (or still). */
export async function rolling(
  pushS: number,
  options: HarnessOptions = {},
): Promise<ScenarioHarness> {
  const h = await ScenarioHarness.create(options);
  h.run(0.3);
  if (pushS > 0) h.press({ code: "Space", atS: 0, holdS: pushS });
  h.run(pushS + 0.2);
  return h;
}

/** Stick direction toward the toe edge (+Z in regular, −Z in goofy). */
export function toe(stance: Stance): FootDirection {
  return stance === "regular" ? "right" : "left";
}

/** Stick direction toward the heel edge. */
export function heel(stance: Stance): FootDirection {
  return stance === "regular" ? "left" : "right";
}

/** The pop foot of a kick (back on the tail, front on the nose) and the guide foot. */
export function popFoot(kick: Kick): FootId {
  return kick === "tail" ? "back" : "front";
}
export function guideFoot(kick: Kick): FootId {
  return kick === "tail" ? "front" : "back";
}

/** Stick direction of a foot toward a kick (the tail is "down", the nose "up"). */
export function toward(kick: Kick): FootDirection {
  return kick === "tail" ? "down" : "up";
}

/** Stick direction away from a kick (the guide foot's level key: W for an ollie). */
export function awayFrom(kick: Kick): FootDirection {
  return kick === "tail" ? "up" : "down";
}

/**
 * The set-up (MECHANICS.md "Load" / "Pop"): the pop foot goes onto its kick, the guide
 * foot sets toward the same kick 0.02 s later and stays set; the pop foot is released at
 * `popAtS` (the pop) while the set is still held. Ollie (regular): ↓, S, release ↓.
 * Nollie: W, ↑, release W. Times from now.
 */
export function loadAndPop(h: ScenarioHarness, popAtS = 0.22, kick: Kick = "tail"): void {
  h.foot(popFoot(kick), toward(kick), 0, popAtS);
  h.foot(guideFoot(kick), toward(kick), 0.02, popAtS + 0.05);
}

/** Press Space (catch in the air) at `atS` for 0.1 s. */
export function catchAt(h: ScenarioHarness, atS: number): void {
  h.press({ code: "Space", atS, holdS: 0.1 });
}

/**
 * How far short of the target rotation a player hits Space, rad. The catch is feet, not
 * magic (MECHANICS.md "Catch"): it damps a spin at ≤ `catchMaxAlphaRadps2`, so Space goes
 * in at the end of the rotation, when the flip or shove has settled.
 */
export const CATCH_SLACK_RAD = 0.15;

/**
 * Runs until the air's roll and yaw are near their targets (rad, magnitudes) and the board
 * looks upright, then presses Space: how a player catches a combo. Stops at touchdown.
 */
export function spaceWhenDone(
  h: ScenarioHarness,
  t0: number,
  rollRad: number,
  yawRad: number,
): void {
  for (let i = 0; i < 150 && !h.board.grounded; i += 1) {
    const air = airSummary(h, t0);
    const rolled = Math.abs(air.rollRad) >= rollRad - CATCH_SLACK_RAD;
    const turned = Math.abs(air.yawRad) >= yawRad - CATCH_SLACK_RAD;
    if (rolled && turned && h.tiltRad() <= 0.5) break;
    h.run(1 / 120);
  }
  catchAt(h, 0);
}

/** A board edge (MECHANICS.md: sideways keys are defined by edge). */
export type Edge = "heel" | "toe";

/** Stick direction of a foot toward an edge, in the harness's stance. */
export function edgeKey(h: ScenarioHarness, edge: Edge): FootDirection {
  return edge === "heel" ? heel(h.stance) : toe(h.stance);
}

/** The other edge. */
export function opposite(edge: Edge): Edge {
  return edge === "heel" ? "toe" : "heel";
}

/**
 * How long a swipe's key is pressed, s. From the middle a 0.08 s tap is enough (the
 * smoothed stick peaks ≈ 0.75); from the opposite edge the stick has twice as far to go
 * and reaches the far side (−0.6) ≈ 0.1 s after the key goes down, so it is held longer.
 */
export const TAP_S = 0.08;
export const EDGE_TO_EDGE_S = 0.14;

/**
 * A sideways SWIPE of `foot` toward `edge` at `atS` (MECHANICS.md "Swipe size"): a tap of
 * that edge's key. One unit (a flip / a 180 shove) swipes from the middle. Two units (a
 * double flip / a 360 shove) swipe edge to edge: the foot is held on the opposite edge
 * from `preFromS` (the pre-position, e.g. during the load) and let go at `atS`, when the
 * other key goes down.
 */
export function swipe(
  h: ScenarioHarness,
  foot: FootId,
  edge: Edge,
  atS: number,
  units: 1 | 2 = 1,
  preFromS = atS - 0.19,
  tapS = units === 2 ? EDGE_TO_EDGE_S : TAP_S,
): void {
  if (units === 2) h.foot(foot, edgeKey(h, opposite(edge)), preFromS, atS - preFromS);
  h.foot(foot, edgeKey(h, edge), atS, tapS);
}

/** Pop from `kick`; the guide foot levels and flicks, the pop foot sweeps (swipes). */
export interface ComboInputs {
  readonly kick: Kick;
  /** Guide foot flick edge, or null. */
  readonly flick: Edge | null;
  /** Pop foot sweep side, or null. */
  readonly sweep: Edge | null;
  /** Swipe size: 1, or 2 (edge to edge, pre-positioned during the load: a double / a 360). */
  readonly flickUnits?: 1 | 2;
  readonly sweepUnits?: 1 | 2;
}

/**
 * Plays a combo from now: load and pop at 0.2 s — at `FULL_POP_S` (a full load) for a
 * double flip, which needs the whole air at the capped rate — with a double's or a 360's
 * foot pre-positioned on the opposite edge from 0.06 s (during the load); then 0.05 s
 * after the pop, the level key and the swipes. Returns the pop time (from now), s.
 */
export function playCombo(h: ScenarioHarness, c: ComboInputs): number {
  const popAtS = c.flickUnits === 2 ? FULL_POP_S : 0.2;
  loadAndPop(h, popAtS, c.kick);
  const guide = guideFoot(c.kick);
  const atS = popAtS + 0.05;
  h.foot(guide, awayFrom(c.kick), atS, 0.1);
  if (c.flick !== null) swipe(h, guide, c.flick, atS, c.flickUnits ?? 1, 0.06);
  if (c.sweep !== null) swipe(h, popFoot(c.kick), c.sweep, atS, c.sweepUnits ?? 1, 0.06);
  return popAtS;
}

/** Load time for a full pop (≥ `loadMaxS` after the set 0.02 s in), s. */
export const FULL_POP_S = 0.34;

/** Summary of the air after `fromS`. */
export interface AirSummary {
  /** Highest rise of the board origin above its start height, m. */
  readonly riseM: number;
  readonly maxClearanceM: number;
  readonly maxPitchRad: number;
  readonly airtimeS: number;
  readonly landingUpDot: number | null;
  /** Roll about the board's X accumulated in the air; heading change from `fromS` on, rad. */
  readonly rollRad: number;
  readonly yawRad: number;
  readonly bailed: boolean;
  readonly popped: boolean;
}

export function airSummary(h: ScenarioHarness, fromS: number): AirSummary {
  const records = h.since(fromS);
  const startY = records[0]?.board.transform.positionM.y ?? 0;
  const landings = h.eventsOf("BoardLanded").filter((e) => e.timeS >= fromS);
  const main = [...landings].sort((a, b) => b.airtimeS - a.airtimeS)[0];
  let rollRad = 0;
  let yawRad = 0;
  let prev: StepRecord | undefined;
  for (const r of records) {
    if (prev !== undefined) {
      const dt = r.timeS - prev.timeS;
      // Yaw = change of the board's heading (unwrapped), not ∫ω_y: a flip about a pitched
      // axis has a world-Y component that is not a heading change.
      const dYaw = wrap(h.headingRad(r.board) - h.headingRad(prev.board));
      yawRad += dYaw;
      if (!r.board.grounded) {
        // Roll = the flip coordinate: ω·X minus the part of a heading turn (about world up)
        // that lies along a pitched long axis (a varial on a nose-up board).
        const x = Transform.toWorldDirection(r.board.transform, Vec3.UNIT_X);
        rollRad += Vec3.dot(r.board.angularVelocityRadps, x) * dt - dYaw * x.y;
      }
    }
    prev = r;
  }
  return {
    riseM: Math.max(0, ...records.map((r) => r.board.transform.positionM.y - startY)),
    maxClearanceM: Math.max(0, ...records.map((r) => r.wheelClearanceM)),
    maxPitchRad: Math.max(...records.map((r) => h.pitchRad(r.board))),
    airtimeS: main?.airtimeS ?? 0,
    landingUpDot: main?.upDot ?? null,
    rollRad,
    yawRad,
    bailed: h.eventsOf("RiderBailed").some((e) => e.timeS >= fromS),
    popped: h.eventsOf("BoardPopped").some((e) => e.timeS >= fromS),
  };
}

/** Both feet attached. */
export function feetOn(h: ScenarioHarness): boolean {
  return h.rider.front.contact === "attached" && h.rider.back.contact === "attached";
}

/** Horizontal speed, m/s. */
export function horizontalSpeed(r: StepRecord): number {
  const v = r.board.linearVelocityMps;
  return Math.hypot(v.x, v.z);
}

export const STANCES: readonly Stance[] = ["regular", "goofy"];

function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
