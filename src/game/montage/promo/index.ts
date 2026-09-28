import type { MontageClip } from "../clip";
import { promoDeskMatch } from "./fingerboard-match";
import { promoLinkedIn, promoLinkedInEndCard } from "./linkedin";
import type { PromoSequence } from "./promo";
import { promoClips } from "./promo";

/** Every promo sequence (`?montage=<id>`). */
export const PROMOS: readonly PromoSequence[] = [
  promoLinkedIn,
  promoDeskMatch,
  promoLinkedInEndCard,
];

/** The promo with this id, or undefined. */
export function promoById(id: string): PromoSequence | undefined {
  return PROMOS.find((p) => p.id === id);
}

/** Every clip used by a promo (verified with the montage clips). */
export const PROMO_CLIPS: readonly MontageClip[] = [
  ...new Map(PROMOS.flatMap(promoClips).map((c) => [c.id, c])).values(),
];

export type { PromoCardItem, PromoClipItem, PromoItem, PromoSequence } from "./promo";
export { itemVideoS, promoVideoS } from "./promo";
