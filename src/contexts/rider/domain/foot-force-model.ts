import type {
  FootId,
  GrindExit,
  GrindKind,
  GrindSide,
  Kick,
  Stance,
  Transform,
  Vec3,
} from "../../../shared";
import type { AssistLevel } from "../rider.config";
import type { FootForce } from "./foot-force";
import type { RiderState } from "./rider-state";

/*
 * The rider domain may not import other contexts (REQUIREMENTS §2.3 rule 1), so it
 * declares the MINIMAL SHAPES it needs from them. Other contexts' VOs satisfy these
 * structurally: input's `IntentFrame` is a `RiderControls`, board's `BoardSnapshot` is a
 * `BoardKinematics`, board's `BoardSpec` is a `DeckGeometry`. tsc checks it where the
 * application layer passes them in. See ADR 0001 ("structural ports").
 */

/** One foot's control input (satisfied by input's `FootIntent`). */
export interface FootControl {
  readonly foot: FootId;
  /** [-1, 1]²; x → the rider's +Z side, y → the rider's front. */
  readonly stick: { readonly x: number; readonly y: number };
  /** 1/s. */
  readonly stickVelocityPerS: { readonly x: number; readonly y: number };
  /** The keys held, per axis in {−1, 0, 1} (same axes as `stick`); absent = unknown. */
  readonly held?: { readonly x: number; readonly y: number };
}

/** Both feet's controls (satisfied by input's `IntentFrame`). */
export interface RiderControls {
  readonly front: FootControl;
  readonly back: FootControl;
  /** "Both feet down" (Space): a push on the ground, a catch in the air. */
  readonly feetDown: boolean;
  /** Decides which rider side is the toe side (regular: +Z). */
  readonly stance: Stance;
  /** Smoothed body spin in [−1, 1] (Q = −1: counter-clockwise from above). Absent = 0. */
  readonly spin?: number;
}

/** Board motion the rider needs (satisfied by board's `BoardSnapshot`). */
export interface BoardKinematics {
  readonly transform: Transform;
  readonly linearVelocityMps: Vec3;
  readonly angularVelocityRadps: Vec3;
  readonly grounded: boolean;
  /** Time since the board last left the ground, s (0 while grounded). Absent = 0. */
  readonly airtimeS?: number;
  /** `deck`: flat-section contact (e.g. lying upside down) — used for bail detection. */
  readonly contacts: { readonly tail: boolean; readonly nose: boolean; readonly deck: boolean };
  /**
   * What the board touches: the surface type (grindable skips the landing yaw check), the
   * part and the surface normal (the ground the board rolls on; a bad touchdown).
   */
  readonly contactPoints?: readonly {
    readonly surface: string;
    readonly part?: string;
    readonly normalWorld?: Vec3;
  }[];
}

/**
 * A grind edge (MECHANICS.md "Grinds and slides"), satisfied by world's `GrindEdge`: a
 * straight segment on top of a rail, a coping, the hubba's steel edge or a ledge's edge.
 */
export interface GrindEdgeView {
  readonly obstacleId: string;
  /** `grindable` (steel) or `ledge` (concrete). */
  readonly surface: string;
  /** Ends of the segment on top of the edge's profile, m (world). */
  readonly startM: Vec3;
  readonly endM: Vec3;
  /** Horizontal unit normal square to the edge, away from the obstacle (pop outs go there). */
  readonly outwardNormal: Vec3;
  /** A bar open on both sides (rail); else the top surface lies on the −outward side. */
  readonly twoSided: boolean;
  /** Half the width of the edge's profile, m. */
  readonly halfWidthM: number;
}

/** Deck dimensions the rider needs (satisfied by board's `BoardSpec`). */
export interface DeckGeometry {
  readonly deck: {
    readonly lengthM: number;
    readonly widthM: number;
    readonly thicknessM: number;
    readonly kickLengthM: number;
    readonly kickAngleRad: number;
  };
  readonly trucks: {
    readonly wheelbaseM: number;
    readonly heightM: number;
    /** Wheel-centre to wheel-centre across one axle, m (grinds: where the wheels hang). */
    readonly axleTrackM: number;
  };
  readonly wheels: { readonly radiusM: number; readonly widthM: number };
}

/**
 * Mass properties of the board, read through the physics port each step (the rider
 * application adapts `RigidBodyHandle`). Controllers use them to turn a target velocity
 * into an impulse, so the result does not depend on the board's mass or inertia.
 */
export interface BoardMassProperties {
  readonly massKg: number;
  readonly centerOfMassWorldM: Vec3;
  /**
   * World inertia tensor times a vector, `I·v` (board's `RigidBodyHandle`): the angular
   * impulse for a wanted Δω, or the torque for a wanted angular acceleration.
   */
  angularInertiaTimes(vectorWorld: Vec3): Vec3;
}

/** Everything the force model sees for one fixed step. */
export interface FootForceInput {
  readonly controls: RiderControls;
  readonly rider: RiderState;
  /** Board state from the PREVIOUS step's snapshot (the latest available before stepping). */
  readonly board: BoardKinematics;
  readonly mass: BoardMassProperties;
  readonly dtS: number;
  /**
   * Height of the ground straight below the board, m (world), probed in the air so the
   * airtime prediction lands on the real surface (stairs, a ramp). Absent: flat ground at 0.
   */
  readonly groundBelowYM?: number | null;
  /**
   * Grind edges near the board this step (the composition root queries the level's edges
   * around the board). Absent: no edges (flat ground).
   */
  readonly edgesNear?: readonly GrindEdgeView[];
  /** The active assist level (MECHANICS.md "Assists", ADR 0012). Absent: `pro` (none). */
  readonly assistLevel?: AssistLevel;
}

/** What the rider sees of a grind lock this step (read model data). */
export interface GrindReport {
  readonly kind: GrindKind;
  readonly side: GrindSide;
  readonly obstacleId: string;
  readonly surface: string;
  /** Balance in [−1, 1], + = toward the rider's toe side. */
  readonly balance: number;
  /** A slide (the board across the edge) rather than a grind (along it). */
  readonly slide: boolean;
}

/** What the model decided this step: forces for the board, cues for the `Rider`. */
export interface FootForceOutput {
  readonly forces: readonly FootForce[];
  /** The kick that popped this step (the rider jumps, the feet leave the deck), or null. */
  readonly popped: Kick | null;
  /** The board was caught this step: the feet snap back onto the deck. */
  readonly caught: boolean;
  /** A pop is loaded (both feet crouched on a kick): Q / E wind up the body. */
  readonly loading?: boolean;
  /** The board is locked on a grind edge this step (MECHANICS.md M4), or null / absent. */
  readonly grind?: GrindReport | null;
  /** The lock ended this step, and how. */
  readonly grindExit?: GrindExit | null;
  /**
   * A pop out of a slide: the rider turns back this much (rad, + = counter-clockwise from
   * above) in the air to line up with the travel again.
   */
  readonly realignRad?: number;
  /**
   * SPIN SNAP (assists): the rider heading a released body spin should ease to a stop at
   * (a stance angle to a grind edge ahead), rad, or null / absent for none.
   */
  readonly spinSnapHeadingRad?: number | null;
  /**
   * The foot flicking a kickflip right now (the guide foot swiping toward the heel edge in
   * a popped air), or null / absent. Visual: that foot points its toes down (STYLE.md).
   */
  readonly kickflipFlick?: FootId | null;
}

/**
 * Domain service: turns intents into forces, impulses and torques on the board (loop
 * step 2). It never touches physics; the rider application applies the output through
 * the `RigidBodyHandle` port, tells the `Rider` about pops and catches, and publishes
 * `BoardPopped`. May keep state across steps (trick phase, windows); `reset` clears it.
 */
export interface FootForceModel {
  computeForces(input: FootForceInput): FootForceOutput;
  reset(): void;
}
