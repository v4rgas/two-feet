/*
 * The trick table as DATA (REQUIREMENTS §1.5, MECHANICS.md "Names the recognizer must
 * produce"). A trick is one step on each of three independent rotation channels plus
 * the state at the pop. Adding a trick or renaming a cell = editing `TRICK_TABLE` in
 * `tricks.config.ts`; the classifier has no per-trick code.
 *
 * All rotations are RIDER-NORMALISED (see `rider-frame.ts` and ADR 0007):
 * - flip  (board roll about its own long axis): + = kickflip direction;
 * - shove (board heading change):               + = backside;
 * - body  (rider heading change, Q / E):        + = backside.
 */

/**
 * One step of a rotation channel: a signed whole number of units and the words it adds
 * to the name. Flip units are full turns (2π); shove and body units are half turns (π).
 */
export interface RotationStep {
  /** Stable id, part of the trick id, e.g. "kickflip", "bs", "fs360". */
  readonly id: string;
  /** Words used in names, e.g. "Kickflip", "BS Shove-it", "FS 180". Empty for none. */
  readonly name: string;
  /** Signed units: flips in full turns, shoves and body spins in half turns. */
  readonly units: number;
}

/** Prefix that can be omitted from / added to a name. */
export type TrickPrefix = "switch" | "fakie" | "nollie" | "body";

/** One named cell of the flip × shove matrix. */
export interface TrickDefinition {
  /** Stable id, e.g. "tre-flip". */
  readonly id: string;
  /** Display name, e.g. "360 Flip". */
  readonly name: string;
  /** Id of the `RotationStep` in `flips`. */
  readonly flip: string;
  /** Id of the `RotationStep` in `shoves`. */
  readonly shove: string;
  /**
   * The name is dropped when one of these prefixes is present: a plain ollie popped from
   * the nose is a "Nollie", with a body 180 a "BS 180" (not "Nollie Ollie", "BS 180 Ollie").
   */
  readonly omitWith?: readonly TrickPrefix[];
}

/** The whole naming table. */
export interface TrickTable {
  /** Flip channel steps (units = full turns, + = kickflip). Must contain units 0. */
  readonly flips: readonly RotationStep[];
  /** Shove channel steps (units = half turns, + = backside). Must contain units 0. */
  readonly shoves: readonly RotationStep[];
  /** Body spin steps (units = half turns, + = backside). Must contain units 0. */
  readonly bodies: readonly RotationStep[];
  /** Named flip × shove cells. A missing cell gets the generic name `<flip> + <shove>`. */
  readonly tricks: readonly TrickDefinition[];
  /** Words for the state prefixes. */
  readonly prefixes: {
    readonly switch: string;
    readonly fakie: string;
    readonly nollie: string;
  };
  /** Joins the flip and shove names of a generic cell, e.g. " + ". */
  readonly genericJoiner: string;
}
