# TWO FEET — LinkedIn promo (script)

A game by v4rgas (<https://v4rgas.com>). The pun: you steer **each foot** on its own,
and 2 ft ≈ 0.61 m.

Everything on screen is **real input**: key timelines replayed through the game's own
input → rider → Rapier physics path. Nothing is animated. Each clip is checked by
`pnpm montage:verify` (the recognizer must name the trick, and nothing may bail).

- **Source:** `src/game/montage/promo/linkedin.ts` (`promoLinkedIn`)
- **Play (dev):** `pnpm dev`, then open `/?montage=promo-linkedin`
- **Record:** `/?montage=promo-linkedin&record=frames` (the deterministic frames recorder;
  the dev server encodes an H.264 MP4 into `MONTAGE_OUT_DIR`). Add `&format=16x9` for the
  landscape cut.

## Format

| | |
|---|---|
| Main cut | **1080 × 1350 (4:5 portrait)**: the most feed space on LinkedIn |
| Second cut | 1920 × 1080 (16:9), the same edit (`&format=16x9`) |
| Frame rate | 60 fps |
| Codec | H.264 High, yuv420p, `+faststart`, no audio track |
| Length | ≈ 21 s (target 20–30 s) |
| Sound | none: LinkedIn autoplays muted, so the text carries the message |

**Rules for muted autoplay:** the first frame already shows the title and the board (no
fade-in), the text is big, and each line stays up at least 1.6 s. All text sits over a
soft ink scrim or on a paper card, so it reads over the bright plaza.

**Type** (STYLE.md): Inter 800 caps for the TWO FEET wordmark; Inter for the kickers and
lower-thirds; Space Mono for the v4rgas credit and URL.
**Colour:** cream `concrete-100` text, ink scrim, a deck-red accent bar on lower-thirds.
The end card uses the v4rgas brand: black, white, `.com` muted.

## Shot list

Times are video seconds (slow motion stretches the simulation). "Sim" means the clip's
simulation time.

### 1 · Deck reveal (0:00 – 0:04.6) — clip `promo-deck-reveal`

| | |
|---|---|
| Where | Street Course, on the 7-stair's deck, rolling slowly (1.3 m/s) |
| Action | Two shoes on the grip (green = front, blue = back). Pop at sim 1.4 s, then a **heelflip** (W + D). The penguin graphic on the underside turns toward the lens, then up, then round to the grip. Space catch, rolls on. |
| Camera | **`deckShowcase`**: a close, low, long-lens orbit from the heel side (≈ 2.4 m → 1.6 m, eye 0.16 → 0.4 m above the board). It pushes in over 3.2 s and frames 1.5 m → 1.05 m of board width in any aspect. The long lens flattens the background, which reads as a shallow focus. |
| Speed | 1× → 0.5× (sim 1.25 s) → **0.2×** through the flip (sim 1.52–1.98 s) → 1× |
| Text | **TWO FEET** (big, caps, the deck-red bar under it) / *one board* (Space Mono), on from frame 1 (the hook), held ≈ 3.4 s, fades out as the deck flips |
| Trick card | none (the title owns this shot) |
| Out | 0.2 s dip to black |

### 2 · Kickflip 50-50 (0:04.6 – 0:11.0) — clip `promo-kickflip-fifty-fifty`

| | |
|---|---|
| Where | Street Course, the 0.3 m flat bar |
| Action | Rolling at 4 m/s, pop at sim 1.05 s. W + A is the **flip-in**. Space goes in as the flip comes round (sim 1.56 s). It locks onto the bar with nothing held: a backside 50-50 (sim ≈ 1.58 s). It grinds 1.65 s to the end, rolls off and lands clean. |
| Camera | `fisheyeFollow` on the approach (low, wide, close) → **cut** to `lowSide` (left, 2.3 m, 44°) just before the pop → a 0.8 s blend into the game's `follow` camera along the grind |
| Speed | **0.3×** from just before the pop through the flip-in and the lock (sim 1.0–1.75 s), then 1× down the bar |
| Text | Kicker, top: "Each hand drives one foot." (1.6 s). On landing, the lower-third shows the recognizer's own name: **"Kickflip → BS 50-50"**, captioned STREET COURSE · FLAT BAR. |
| In / out | 0.2 s from black, 0.25 s to black |

### 3 · 360 flip down El Toro (0:11.0 – 0:17.9) — clip `promo-tre-flip-el-toro`

| | |
|---|---|
| Where | El Toro: the 20-stair (3.3 m) from the upper quad |
| Action | Rolling at 4.5 m/s, 9 m back, two pushes. A full load with → held (the 360 shove's pre-position). Pop at sim 1.4 s. W + A and ← together make a kickflip plus a backside 360 shove: the **tre flip**. Space as it comes round (sim 1.94 s). It rides the drop with the feet on, lands (sim 2.7 s) and rolls away toward the fence. |
| Camera | `fisheyeFollow` across the quad → **cut** at the pop to a `fixedTripod` in the courtyard, 11 m out on the +Z side (11, 1.2, 5.5). It frames the top of the set to the landing and zooms 38° → 27° over the air, so the rider stays readable in portrait. It holds while the rider rolls past the lens. (A first take from (15, 0.7, 7.5) at 62° → 46° left the rider too small in 4:5.) |
| Speed | **0.33×** for the whole air (sim 1.42–2.7 s), 1× for the roll-away |
| Text | Kicker: "20 stairs. Real physics." (1.8 s). Lower-third on landing: **"360 Flip"**, captioned EL TORO · 20 STAIRS. |
| In / out | 0.2 s from black, 0.35 s to black |

### 4 · End card (0:17.9 – 0:21.3)

| | |
|---|---|
| Look | Full-frame black (v4rgas brand) |
| Content | The intro's title card (STYLE.md "Wordmark") on the v4rgas black. **TWO FEET** (Inter 800, 0.04 em tracking), then a short `deck` bar, then "two feet. one board." (Space Mono). Next, the v4rgas 32 × 32 pixel penguin (`public/sponsors/v4rgas/penguin.png`, nearest-neighbour, integer scale) beside "a game by v4rgas". Then **v4rgas.com** (Space Mono, `.com` muted), and a small line at the bottom: "physics-based · every trick is real input". |
| In | 0.35 s from black, then holds |
| Brand | BipBop Labs appears only as its in-world banners (a sponsor), never on the card. The deck's penguin art stays on the deck only. |

## Stills (cover / thumbnail candidates)

The recorder saves these as PNGs next to the video: the deck at sim 0.6, 1.62 and 1.72 s,
the 50-50 at 1.5 and 1.9 s, El Toro at 1.75 and 2.15 s, and the end card at 2 s.

## Post copy (suggestion)

> TWO FEET: a physics skate game where each hand drives one foot. Every trick in this
> clip is real keyboard input replayed through the physics, not animation. Kickflip
> 50-50, then a 360 flip down El Toro. A game by v4rgas → v4rgas.com
