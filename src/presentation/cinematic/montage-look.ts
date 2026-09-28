/**
 * A shot's own look for videos (`ThreeRenderer.setMontageLook`): colours and scales that
 * replace the game's lighting and ground for one shot (the promo's desk match, so the game
 * side of the cut feels like the same room). Absent fields keep the game's value.
 */
export interface MontageLook {
  /** The ground slab's colour (the texture's tint), `#rrggbb`. */
  readonly groundColor?: string;
  readonly sunColor?: string;
  readonly sunIntensityScale?: number;
  readonly hemiSkyColor?: string;
  readonly hemiGroundColor?: string;
  readonly hemiIntensityScale?: number;
}

/** How a clip uses a look: full until `holdS`, then eased back to the game's by `releaseS` (clip s). */
export interface MontageLookCue {
  readonly look: MontageLook;
  readonly holdS: number;
  readonly releaseS: number;
}

/** Weight of a look cue at clip time `tS`: 1, then a smooth ease to 0. */
export function lookWeightAt(cue: MontageLookCue, tS: number): number {
  if (tS <= cue.holdS) return 1;
  if (tS >= cue.releaseS) return 0;
  const x = (tS - cue.holdS) / (cue.releaseS - cue.holdS);
  return 1 - x * x * (3 - 2 * x);
}
