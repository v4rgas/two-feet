import type { FootId, Transform, Vec3 } from "../../../shared";
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
  /** [-1, 1]²; x → +Z side, y → nose. */
  readonly stick: { readonly x: number; readonly y: number };
  /** 1/s. */
  readonly stickVelocityPerS: { readonly x: number; readonly y: number };
}

/** Both feet's controls (satisfied by input's `IntentFrame`). */
export interface RiderControls {
  readonly front: FootControl;
  readonly back: FootControl;
  readonly push: boolean;
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
  readonly trucks: { readonly wheelbaseM: number };
}

/** Everything the force model sees for one fixed step. */
export interface FootForceInput {
  readonly controls: RiderControls;
  readonly rider: RiderState;
  /** Board state from the PREVIOUS step's snapshot (the latest available before stepping). */
  readonly board: BoardKinematics;
  readonly dtS: number;
}

/**
 * Domain service: maps foot intents to forces/impulses on the deck (loop step 2).
 * It never touches physics; the rider application applies the returned forces through
 * the `RigidBodyHandle` port and publishes `BoardPopped` for any `label: "pop"` impulse.
 * May keep gesture state across steps (pop charge, flick detection); `reset` clears it.
 * Returns forces only for attached feet (plus `push`, which requires grounded + neutral feet).
 */
export interface FootForceModel {
  computeForces(input: FootForceInput): readonly FootForce[];
  reset(): void;
}
