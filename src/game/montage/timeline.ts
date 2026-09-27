import type { KeyPress, Stance } from "../../contexts/input";
import { clusterForFoot, INPUT_CONFIG } from "../../contexts/input";
import type { FootId, Kick } from "../../shared";

/** A stick direction of one foot, by role (the stance picks the physical key). */
export type FootDirection = "up" | "down" | "left" | "right";
/** A board edge: the heel edge or the toe edge (MECHANICS.md: keys are defined by edge). */
export type Edge = "heel" | "toe";

/**
 * Builds a clip's key timeline in the words of MECHANICS.md (load, pop, level, flick,
 * sweep, catch, push, body spin) for one stance, so a clip reads like the gesture and
 * plays in either stance. The same gestures as the scenario helpers
 * (`scenarios/scenario-helpers.ts`), as plain data. Times are clip seconds.
 */
export class KeyTimeline {
  private readonly presses: KeyPress[] = [];

  constructor(readonly stance: Stance) {}

  /** A raw key by `KeyboardEvent.code`. */
  key(code: string, atS: number, holdS: number): this {
    this.presses.push({ code, atS, holdS });
    return this;
  }

  /** A foot's direction key (regular: front = WASD, back = arrows). */
  foot(foot: FootId, direction: FootDirection, atS: number, holdS: number): this {
    const cluster = clusterForFoot(this.stance, foot);
    return this.key(INPUT_CONFIG.keys[cluster][direction], atS, holdS);
  }

  /** Space on the ground: a push. */
  push(atS: number, holdS = 0.12): this {
    return this.key(INPUT_CONFIG.keys.feetDown, atS, holdS);
  }

  /** Space in the air: the catch. */
  catch(atS: number, holdS = 0.1): this {
    return this.key(INPUT_CONFIG.keys.feetDown, atS, holdS);
  }

  /**
   * Load and pop from `kick`: the pop foot goes onto the kick at `fromS`, the guide foot
   * sets toward it 0.02 s later; releasing the pop foot at `popAtS` pops (the set is
   * released 0.07 s after). Ollie: ↓ + S, release ↓. Nollie: W + ↑, release W.
   */
  loadAndPop(kick: Kick, fromS: number, popAtS: number): this {
    const toward = kick === "tail" ? "down" : "up";
    this.foot(popFoot(kick), toward, fromS, popAtS - fromS);
    return this.foot(guideFoot(kick), toward, fromS + 0.02, popAtS - fromS + 0.05);
  }

  /** The guide foot slides away from the kick: levels the board (W on an ollie). */
  level(kick: Kick, atS: number, holdS = 0.15): this {
    return this.foot(guideFoot(kick), kick === "tail" ? "up" : "down", atS, holdS);
  }

  /** The guide foot flicks off an edge: heel edge = kickflip, toe edge = heelflip. */
  flick(kick: Kick, edge: Edge, atS: number, holdS = 0.1): this {
    return this.foot(guideFoot(kick), this.edgeDirection(edge), atS, holdS);
  }

  /** The pop foot sweeps toward an edge: a shove-it (held ≥ 0.12 s = 360). */
  sweep(kick: Kick, edge: Edge, atS: number, holdS = 0.1): this {
    return this.foot(popFoot(kick), this.edgeDirection(edge), atS, holdS);
  }

  /** Body spin: Q (left, counter-clockwise from above) or E (right). */
  spin(direction: "left" | "right", atS: number, holdS: number): this {
    return this.key(INPUT_CONFIG.keys.spin[direction], atS, holdS);
  }

  build(): readonly KeyPress[] {
    return [...this.presses].sort((a, b) => a.atS - b.atS);
  }

  /** Stick direction toward an edge: the toe edge is screen right (+Z) in regular. */
  private edgeDirection(edge: Edge): FootDirection {
    const toeIsRight = this.stance === "regular";
    return (edge === "toe") === toeIsRight ? "right" : "left";
  }
}

/** The pop foot of a kick (back on the tail, front on the nose). */
export function popFoot(kick: Kick): FootId {
  return kick === "tail" ? "back" : "front";
}

/** The guide foot of a kick (the other foot). */
export function guideFoot(kick: Kick): FootId {
  return kick === "tail" ? "front" : "back";
}
