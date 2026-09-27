import type { MontageClip } from "../clip";
import { bs180KickflipFlat, nollieHeelflipFlat } from "./flat";
import { quarterPipeFakie, treFlipKicker } from "./ramps";
import { kickflipStairs, varialHeelflipStairs } from "./stairs";

/**
 * Every montage clip, in playing order. To add one: write it in a file here (see
 * `stairs.ts`), add it to this list, run `pnpm montage:verify`, and tune its timeline
 * (`findCatchTimeS` finds the catch) until it lands.
 */
export const MONTAGE_CLIPS: readonly MontageClip[] = [
  kickflipStairs,
  treFlipKicker,
  nollieHeelflipFlat,
  bs180KickflipFlat,
  varialHeelflipStairs,
  quarterPipeFakie,
];

/** The clip with this id, or undefined. */
export function clipById(id: string): MontageClip | undefined {
  return MONTAGE_CLIPS.find((c) => c.id === id);
}
