import { INTRO_CLIP } from "../../intro/intro-clip";
import type { MontageClip } from "../clip";
import { elToroKickflip } from "./el-toro";
import { bs180KickflipFlat, nollieHeelflipFlat } from "./flat";
import { ledgeBoardslide, railFiftyFifty } from "./grinds";
import { quarterPipeFakie, treFlipEuroGap } from "./ramps";
import { kickflipStairs, stairsTailslideHardflip, varialHeelflipStairs } from "./stairs";
import { ollieSevenStair } from "./street";

/**
 * Every montage clip, in playing order. To add one: write it in a file here (see
 * `stairs.ts`), add it to this list, run `pnpm montage:verify`, and tune its timeline
 * (`findCatchTimeS` finds the catch) until it lands. The last one is the game's opening
 * cinematic (`src/game/intro`), so its landing is verified with the rest.
 */
export const MONTAGE_CLIPS: readonly MontageClip[] = [
  stairsTailslideHardflip,
  kickflipStairs,
  treFlipEuroGap,
  nollieHeelflipFlat,
  bs180KickflipFlat,
  varialHeelflipStairs,
  quarterPipeFakie,
  railFiftyFifty,
  ledgeBoardslide,
  ollieSevenStair,
  elToroKickflip,
  INTRO_CLIP,
];

/** The clip with this id, or undefined. */
export function clipById(id: string): MontageClip | undefined {
  return MONTAGE_CLIPS.find((c) => c.id === id);
}
