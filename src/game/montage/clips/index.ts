import type { MontageClip } from "../clip";
import { bs180KickflipFlat, nollieHeelflipFlat } from "./flat";
import { ledgeBoardslide, railFiftyFifty } from "./grinds";
import { quarterPipeFakie, treFlipKicker } from "./ramps";
import { kickflipStairs, stairsTailslideHardflip, varialHeelflipStairs } from "./stairs";

/**
 * Every montage clip, in playing order. To add one: write it in a file here (see
 * `stairs.ts`), add it to this list, run `pnpm montage:verify`, and tune its timeline
 * (`findCatchTimeS` finds the catch) until it lands.
 */
export const MONTAGE_CLIPS: readonly MontageClip[] = [
  stairsTailslideHardflip,
  kickflipStairs,
  treFlipKicker,
  nollieHeelflipFlat,
  bs180KickflipFlat,
  varialHeelflipStairs,
  quarterPipeFakie,
  railFiftyFifty,
  ledgeBoardslide,
];

/** The clip with this id, or undefined. */
export function clipById(id: string): MontageClip | undefined {
  return MONTAGE_CLIPS.find((c) => c.id === id);
}
