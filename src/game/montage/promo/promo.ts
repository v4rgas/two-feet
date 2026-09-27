import type { TrickCards } from "../../../presentation/cinematic/lower-thirds";
import type { EndCard, TextOverlay } from "../../../presentation/cinematic/promo-overlays";
import type { MontageClip } from "../clip";
import type { VideoFormatId } from "../montage.config";

/*
 * PROMO SEQUENCE FORMAT (plain data): clips and cards played back to back as ONE video
 * (`?montage=<promo id>`, dev only), for a short social cut. Each clip is a normal montage
 * clip (real input replayed through the simulation, verified by `pnpm montage:verify`);
 * the promo adds the on-screen text, the fades between items and the output format.
 * Script first: each promo has a storyboard in `promo/<channel>/SCRIPT.md` at the repo root.
 */

interface PromoItemBase {
  /** Text drawn over the item (timed by item time: clip s, or card s). */
  readonly overlays?: readonly TextOverlay[];
  /** Fade from black at the start / to black at the end, video s (default: the montage's). */
  readonly fadeInS?: number;
  readonly fadeOutS?: number;
  /** Item times to save a still (PNG) at when recording: clip s, or card s. */
  readonly stillsAtS?: readonly number[];
}

export interface PromoClipItem extends PromoItemBase {
  readonly kind: "clip";
  readonly clip: MontageClip;
  /** Landed tricks' lower-thirds (the recognizer's real name) and their caption. */
  readonly tricks: TrickCards;
}

export interface PromoCardItem extends PromoItemBase {
  readonly kind: "card";
  /** Kebab-case, names the item's stills. */
  readonly id: string;
  readonly card: EndCard;
  /** Length of the card, video s. */
  readonly durationS: number;
}

export type PromoItem = PromoClipItem | PromoCardItem;

export interface PromoSequence {
  /** URL id (`?montage=<id>`), kebab-case; also names the video file. */
  readonly id: string;
  /** The output format it is cut for (`&format=` overrides it). */
  readonly format: VideoFormatId;
  readonly items: readonly PromoItem[];
}

/** Video length of an item at `fps`, s (clips: their slow motion stretches them). */
export function itemVideoS(item: PromoItem, fps: number): number {
  if (item.kind === "card") return item.durationS;
  const clip = item.clip;
  const stepS = 1 / fps / 4;
  let videoS = 0;
  for (let t = 0; t < clip.durationS - 1e-9; t += stepS) {
    let scale = 1;
    for (const w of clip.slowMotion ?? []) if (t >= w.fromS && t < w.toS) scale = w.scale;
    videoS += stepS / scale;
  }
  return videoS;
}

/** The whole promo's video length, s. */
export function promoVideoS(promo: PromoSequence, fps: number): number {
  return promo.items.reduce((sum, item) => sum + itemVideoS(item, fps), 0);
}

/** The clips of a promo, in order. */
export function promoClips(promo: PromoSequence): MontageClip[] {
  return promo.items.flatMap((i) => (i.kind === "clip" ? [i.clip] : []));
}
