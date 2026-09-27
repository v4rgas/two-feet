import type { FootId, Stance, Transform, Vec3 } from "../../../shared";
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
}

/** Both feet's controls (satisfied by input's `IntentFrame`). */
export interface RiderControls {
  readonly front: FootControl;
  readonly back: FootControl;
  /** "Both feet down" (Space): a push on the ground, a catch in the air. */
  readonly feetDown: boolean;
  /** Decides which rider side is the toe side (regular: +Z). */
  readonly stance: Stance;
}

/** Board motion the rider needs (satisfied by board's `BoardSnapshot`). */
export interface BoardKinematics {
  readonly transform: Transform;
  readonly linearVelocityMps: Vec3;
  readonly angularVelocityRadps: Vec3;
  readonly grounded: boolean;
  /** `deck`: flat-section contact (e.g. lying upside down) — used for bail detection. */
  readonly contacts: { readonly tail: boolean; readonly nose: boolean; readonly deck: boolean };
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
  readonly trucks: { readonly wheelbaseM: number; readonly heightM: number };
  readonly wheels: { readonly radiusM: number };
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
}

/** What the model decided this step: forces for the board, cues for the `Rider`. */
export interface FootForceOutput {
  readonly forces: readonly FootForce[];
  /** The pop fired this step: the rider jumps, the feet leave the deck. */
  readonly popped: boolean;
  /** The board was caught this step: the feet snap back onto the deck. */
  readonly caught: boolean;
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
