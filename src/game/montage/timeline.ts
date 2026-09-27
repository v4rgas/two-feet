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

  /**
   * The pop foot sweeps toward an edge from the middle: a 180 shove-it. (Sweeps and flicks
   * are swipes, MECHANICS.md "Swipe size": their size is how far the foot travels.)
   */
  sweep(kick: Kick, edge: Edge, atS: number, holdS = 0.1): this {
    return this.foot(popFoot(kick), this.edgeDirection(edge), atS, holdS);
  }

  /**
   * Double flip: the guide foot waits on the opposite edge from `fromS` (the pre-position,
   * during the load: S + D for a double kickflip in regular), lets go at `atS` and swipes
   * across to `edge` (edge to edge: ≈ 0.1 s to reach the far side, so held a bit longer).
   */
  doubleFlick(kick: Kick, edge: Edge, fromS: number, atS: number, holdS = EDGE_TO_EDGE_S): this {
    this.foot(guideFoot(kick), this.edgeDirection(other(edge)), fromS, atS - fromS);
    return this.flick(kick, edge, atS, holdS);
  }

  /**
   * 360 shove: the pop foot waits on the opposite side from `fromS` (during the load, kept
   * through the pop: ↓ + → then release ↓ in regular), lets go at `atS` and swipes across.
   */
  sweep360(kick: Kick, edge: Edge, fromS: number, atS: number, holdS = EDGE_TO_EDGE_S): this {
    this.foot(popFoot(kick), this.edgeDirection(other(edge)), fromS, atS - fromS);
    return this.sweep(kick, edge, atS, holdS);
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

/** How long an edge-to-edge swipe's key is held: the stick reaches the far side ≈ 0.1 s in, s. */
const EDGE_TO_EDGE_S = 0.14;

function other(edge: Edge): Edge {
  return edge === "heel" ? "toe" : "heel";
}

/** The pop foot of a kick (back on the tail, front on the nose). */
export function popFoot(kick: Kick): FootId {
  return kick === "tail" ? "back" : "front";
}

/** The guide foot of a kick (the other foot). */
export function guideFoot(kick: Kick): FootId {
  return kick === "tail" ? "front" : "back";
}
