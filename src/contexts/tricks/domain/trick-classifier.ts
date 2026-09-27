import type { Kick } from "../../../shared";
import { TAU } from "../../../shared";
import type { RotationStep, TrickDefinition, TrickPrefix, TrickTable } from "./trick-definition";

/** What one air session did, rider-normalised (see `rider-frame.ts`). */
export interface TrickInput {
  /** Board roll about its long axis, rad (+ = kickflip direction). */
  readonly flipRad: number;
  /** Board heading change, rad (+ = backside). */
  readonly shoveRad: number;
  /** Rider heading change (body spin), rad (+ = backside). */
  readonly bodyRad: number;
  /** The kick that popped. */
  readonly kick: Kick;
  /** Rolling backwards (relative to the rider heading) at the pop. */
  readonly fakie: boolean;
  /** Riding in the other stance at the pop. */
  readonly switchStance: boolean;
}

/** How far each channel may be from its nearest whole step and still count, rad. */
export interface ChannelTolerances {
  readonly flipRad: number;
  readonly shoveRad: number;
  readonly bodyRad: number;
}

/** The nearest step of one channel and how far off it the rotation ended. */
export interface ChannelMatch {
  readonly step: RotationStep;
  /** Signed rotation minus the step's ideal rotation, rad. */
  readonly errorRad: number;
  /** |error| within the channel's tolerance. */
  readonly complete: boolean;
}

/** Result of classifying one air session. */
export interface TrickClassification {
  /** Composite id, e.g. "nollie-fs180-heelflip". */
  readonly id: string;
  /** Display name, e.g. "Nollie FS 180 Heelflip". */
  readonly name: string;
  /** Every channel ended within tolerance of a whole step (else: under/over-rotated). */
  readonly complete: boolean;
  readonly flip: ChannelMatch;
  readonly shove: ChannelMatch;
  readonly body: ChannelMatch;
}

/** Size of one unit per channel: flips count full turns, shoves and body half turns. */
const FLIP_UNIT_RAD = TAU;
const HALF_TURN_RAD = Math.PI;

/**
 * The step of `steps` whose ideal rotation (`units × unitRad`) is closest to `valueRad`.
 * Rotations beyond the table snap to its largest step and so come out incomplete.
 */
export function nearestStep(
  steps: readonly RotationStep[],
  valueRad: number,
  unitRad: number,
  toleranceRad: number,
): ChannelMatch {
  let best: RotationStep | undefined;
  let bestError = Number.POSITIVE_INFINITY;
  for (const step of steps) {
    const error = valueRad - step.units * unitRad;
    if (Math.abs(error) < Math.abs(bestError)) {
      best = step;
      bestError = error;
    }
  }
  if (best === undefined) throw new RangeError("a rotation channel needs at least one step");
  return { step: best, errorRad: bestError, complete: Math.abs(bestError) <= toleranceRad };
}

function findCell(table: TrickTable, flip: RotationStep, shove: RotationStep) {
  return table.tricks.find((t) => t.flip === flip.id && t.shove === shove.id);
}

function baseName(
  table: TrickTable,
  cell: TrickDefinition | undefined,
  flip: RotationStep,
  shove: RotationStep,
  active: readonly TrickPrefix[],
): string {
  if (cell === undefined) {
    // A "—" cell of the matrix: the generic "<flip> + <shove>".
    return [flip.name, shove.name].filter((s) => s !== "").join(table.genericJoiner);
  }
  const omitted = cell.omitWith?.some((p) => active.includes(p)) ?? false;
  return omitted ? "" : cell.name;
}

/**
 * Names an air session from the TABLE (no per-trick branches): the nearest whole step of
 * each channel picks the flip × shove cell and the body spin, and the state at the pop
 * adds the prefixes, in the order Switch, Fakie, Nollie, body spin, trick —
 * e.g. "Nollie FS 180 Heelflip". An incomplete rotation still gets the closest name
 * (for `TrickBailed`), with `complete` false.
 */
export function classifyTrick(
  input: TrickInput,
  table: TrickTable,
  tolerances: ChannelTolerances,
): TrickClassification {
  const flip = nearestStep(table.flips, input.flipRad, FLIP_UNIT_RAD, tolerances.flipRad);
  const shove = nearestStep(table.shoves, input.shoveRad, HALF_TURN_RAD, tolerances.shoveRad);
  const body = nearestStep(table.bodies, input.bodyRad, HALF_TURN_RAD, tolerances.bodyRad);

  const prefixes: [TrickPrefix, boolean, string][] = [
    ["switch", input.switchStance, table.prefixes.switch],
    ["fakie", input.fakie, table.prefixes.fakie],
    ["nollie", input.kick === "nose", table.prefixes.nollie],
    ["body", body.step.units !== 0, body.step.name],
  ];
  const active = prefixes.filter(([, on]) => on).map(([p]) => p);
  const cell = findCell(table, flip.step, shove.step);
  const base = baseName(table, cell, flip.step, shove.step, active);

  const words = prefixes.filter(([, on]) => on).map(([, , word]) => word);
  const name = [...words, base].filter((s) => s !== "").join(" ");
  const ids = prefixes.filter(([, on]) => on).map(([p]) => (p === "body" ? body.step.id : p));
  const cellId = cell?.id ?? `${flip.step.id}+${shove.step.id}`;
  return {
    id: [...ids, cellId].join("-"),
    name,
    complete: flip.complete && shove.complete && body.complete,
    flip,
    shove,
    body,
  };
}
