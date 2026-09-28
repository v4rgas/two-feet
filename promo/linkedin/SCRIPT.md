# TWO FEET — LinkedIn promo (script)

A game by v4rgas (<https://v4rgas.com>), played at **twofeet.v4rgas.com**. You steer **each foot** on its own keys (WASD for
the front foot, the arrows for the back foot in regular stance).

The video opens on a **real fingerboard clip**, dissolves into the game on the same trick,
and then climbs: the basics in the player's own camera, then six LINES (moves chained in
one shot that show what the physics does: balance, a grind following a rail's shape, a
bank, momentum, flips in and out of a grind, all of it together), a bail, and El Toro last. Everything in the game half is **real input** replayed through the
game's own input → rider → Rapier physics. Nothing is animated. Every clip is checked by
`pnpm montage:verify`: the recognizer must name the trick, and nothing may bail.

- **Game half:** `src/game/montage/promo/linkedin.ts` (`promoLinkedIn`); the desk set, the
  match camera and the desk look in `promo/desk-set.ts` and `promo/fingerboard-match.ts`.
- **Record the game half (dev):** `pnpm dev`, then `/?montage=promo-linkedin&record=frames`.
- **Match test:** `/?montage=promo-desk-match&record=frames` (stills at the match frames).
- **Edit:** `promo/linkedin/compose.sh <game.mp4> <out.mp4>` (ffmpeg): the real clip, the
  dissolve, the sound (the music ramp), a small preview and the seam's RMS table.
- **Sources (git-ignored, never committed):** `recordings/linkedin/source/fingerboard.mp4`
  (352 × 624, 30 fps, 12.1 s, AAC) and `rio-samba-liborio-conti.mp3`.

## What good looks like (research)

**Game trailers.**
- Derek Lieu, [How to think about pacing in a trailer](https://www.derek-lieu.com/blog/2020/11/16/how-to-think-about-pacing-in-a-trailer):
  vary the section lengths (his Spiritfarer example: 6-14-5-14-15-5-16-6 s), don't dwell
  on one idea, show similar things in threes, and after the peak give the viewer "a crucial
  moment to breathe". Text should be "short and easy to read". A slower stretch has to be
  earned by what comes before it.
- Derek Lieu, [Trailer editing essays](https://www.derek-lieu.com/essays) and
  [start here](https://www.derek-lieu.com/start-here): cold-open on the game itself; title
  cards only where they tell the viewer something they can't see.
- Valve, [Steamworks trailer docs](https://partner.steamgames.com/doc/store/trailer) and
  summaries ([presskit.gg](https://presskit.gg/field-guides/game-trailers-screenshots-guide),
  [quadral](https://www.quadral.io/blog/steam-game-trailer-requirements-the-ultimate-2025-guide-for-devs)):
  gameplay in the first 4–5 s, no logos or title cards up front, it autoplays muted,
  ideally under 60 s.

**Skate edits.**
- [MasterClass: Tony Hawk's tips for filming a skate video](https://www.masterclass.com/articles/tony-hawks-tips-for-filming-a-skate-video),
  [Motion Boardshop: filming and editing a skate video](https://www.motionboardshop.com/pages/how-to-filming-and-editing-a-skate-video),
  [Secrets of Skateboarding: how to make a skate video](http://www.secretsofskateboarding.com/make-skate-video/),
  [MiniTool: skate video editing tips](https://moviemaker.minitool.com/moviemaker/how-to-edit-skate-videos.html):
  show the roll-up and the ride-away, but not for long (no 6 s ride-aways), don't overdo
  slow motion, don't put two clips from the same angle back to back, hook early and end on
  the biggest trick.
- [Wistia: 5 tips from skate videos](https://wistia.com/learn/production/video-editing-skateboarding-tips):
  mix close, wide and long shots; build the edit as a story arc and end with a bang.
- [Session: Skate Sim](https://session-skatesim.com/en) (its replay editor and trailers):
  skate games sell themselves the way skate videos do, with real-time clips, a tripod or a
  follow cam, and no text over the tricks.

**Text on social video.**
- Subtitle standards ([Closed Caption Creator](https://www.closedcaptioncreator.com/blog/articles/subtitle-reading-speed.html),
  [Subtitling.net](https://subtitling.net/standards/subtitle-reading-speed),
  [DEV: subtitle CPS limits](https://dev.to/ray_mac/subtitle-reading-speed-cps-the-limits-and-why-ai-subtitles-break-them-892)):
  about 17 characters/s is comfortable, a card needs ≥ 0.8 s just to register, and nothing
  should stay past 7 s.
- LinkedIn ([OpusClip](https://www.opus.pro/blog/linkedin-video-caption-subtitle-best-practices),
  [ContentIn](https://contentin.io/blog/linkedin-video-format/),
  [Ligo Social](https://ligosocial.com/blog/linkedin-video-post-best-practices)): about 85 %
  watch muted. The first 3 s must work without sound. Text must be large, high contrast,
  one or two short lines, on screen 2–4 s, inside the central ~86 % of the frame. Don't
  caption everything.

### The rules this cut follows

1. **Open on the thing itself.** No title and no text over the fingerboard clip or the
   match cut. The cut speaks for itself.
2. **Every trick breathes:** ≥ 1 s of approach, the trick, and about 2 s of ride-away
   before the cut. Cut after the ride-away, never mid-trick.
3. **Slow motion only on the key moment,** at 0.4–0.6× (never 0.2–0.3×), and never on the
   approach or the ride-away.
4. **Escalate, one new idea per line, and never repeat a trick name on screen:** basics →
   lines of 2–4 moves in one shot, each showing one more thing the physics does → a bail
   ("try 1") → the biggest drop landed ("try 2").
5. **Text only where the picture can't explain it:** the controls, while the basics play.
   One idea per card, ≤ 6 words, lowercase, big (≈ 60 px on a 1080 frame), on screen for
   ≥ max(2 s, 1 s per 3 words + 1 s). A caption appears before its move. Trick names are
   the recognizer's own, with no sub-captions, each on screen ≥ 1.5 s.
6. **One title** ("TWO FEET"), at the moment of release (the music reaching full level),
   and the end card. No taglines, no filler.
7. **Cut on the music's bars (or half bars),** not on every beat. Hard cuts between clips;
   the one dissolve is the fingerboard → game match; the only fades are into and out of
   the end card.
8. **Length:** as long as the tricks need (the brief allows past a minute), with no dead
   air.

**Trick names: kept, small.** The game names every trick itself (that is a feature), and a
LinkedIn viewer who doesn't skate can't tell a tailslide from a 50-50. So each trick after
the basics gets its name only, in the lower-third, for ≥ 1.5 s after the landing. The
basics don't get names: their captions already say what happens.

## Format

| | |
|---|---|
| Deliverable | **1080 × 1350 (4:5 portrait)**, 60 fps, H.264 High, yuv420p, `+faststart` |
| Preview | `two-feet-linkedin-4x5-preview.mp4`: 30 fps, crf 26, < 25 MB |
| Length | ≈ 81 s (the brief allows past a minute; no dead air) |
| Sound | The fingerboard clacks, with "Rio Samba" coming in quietly under them and ramping up to full level at the trick-out landing; no gap. AAC 48 kHz 192 kbps, −14 LUFS, ≤ −1 dBTP. It works muted. |
| 16:9 | Skipped: the real clip is portrait, and the match only lines up in 4:5. |

## Copy (all the text in the video)

| Where | Text |
|---|---|
| Title, over the trick-out's ride-away | **TWO FEET** (with the short deck-red bar) |
| Basics, line 1 + line 2 | wasd moves the front foot / arrows move the back foot |
| Basics | space pushes |
| Basics | hold ↓ and s, let go of ↓ |
| Basics, line 1 then line 2 | tap a to flip it / space to catch |
| Input widget labels | front foot · back foot |
| Lower-thirds, one per line | Manual → Nose Manual → Kickflip · BS 50-50 · FS 50-50 · Fakie 360 · Heelflip → BS 50-50 → BS Pop Shove-it out · Kickflip → FS Tailslide → Hardflip out · 360 Flip |
| The bail | no text |
| End card (the game's OG image look) | **TWO FEET** · deck-red bar · (pixel penguin) a game by v4rgas (Space Mono, cream) · **twofeet.v4rgas.com** (Space Mono, grey: where to play, on screen ≈ 3.2 s) |

The lower-thirds are the recognizer's own names, except the manual line's: manuals carry no
recognizer name (it names only the pops: Ollie, Ollie, Kickflip), so that one is written out
as what the widgets show (the stick held back, then forward).

## Structure and timings (video seconds)

| # | Time | Beat | Clip |
|---|---|---|---|
| 1 | 0:00–0:06.05 | Real fingerboard: trick 1, the reset, trick 2's approach and flick | source 0–6.05 s |
| 2 | 0:05.40–0:11.80 | The dissolve into the game over the lock, the grind on the long rail as the camera travels and pulls back, the kickflip out, the landing at full music, TWO FEET | `promo-desk-kickflip-fifty-fifty` |
| 3 | 0:11.80–0:28.48 | Basics in the player's camera, with the controls: push, ollie, kickflip | `promo-basics` |
| 4 | 0:28.48–0:36.33 | **Line 1, balance:** ollie up, manual, ollie up, nose manual, kickflip out (the manual pads) | `promo-line-manual` |
| 5 | 0:36.33–0:42.23 | **Line 2, the rail's shape:** BS 50-50 down the kinked rail, through both kinks | `promo-line-kinked-rail` |
| 6 | 0:42.23–0:48.12 | **Line 3, a bank and a rail:** up the funbox bank, FS 50-50 over its down rail, off the end | `promo-line-funbox` |
| 7 | 0:48.12–0:54.99 | **Line 4, momentum:** up the quarter pipe, back down fakie, a Fakie 360 on the flat | `promo-line-quarter-pipe` |
| 8 | 0:54.99–1:00.88 | **Line 5, flips in and out:** Heelflip → BS 50-50 → BS Pop Shove-it out (flat bar) | `promo-line-flip-in-out` |
| 9 | 1:00.88–1:06.77 | **Line 6, all of it:** Kickflip → FS Tailslide → Hardflip out (the 7-stair hubba) | `promo-line-g4` |
| 10 | 1:06.77–1:10.70 | **The gag, "try 1":** a double kickflip down El Toro, never caught: it lands upside down, the rider bails, the board slides off on its back. Hard cut while it slides. | `promo-bail-el-toro` |
| 11 | 1:10.70–1:17.57 | **"Try 2":** the 360 Flip down El Toro (the only 360 flip) | `promo-tre-flip-el-toro` |
| 12 | 1:17.57–1:21.07 | End card: TWO FEET, a game by v4rgas, twofeet.v4rgas.com (re-rendered alone with `?montage=promo-linkedin-end-card` and spliced onto the recording at 72.2 s of it) | `promo-linkedin-end-card` |

### 1–2 · The opening, beat by beat

| Video | What happens |
|---|---|
| 0:00 | The real clip, cropped to 4:5 (352 × 440 at y 92–532 of 624): the watermark (y ≥ ≈ 549) is fully out. A crop check over 0–6 s at 4 fps shows the rail, the board and the hands in frame at every key moment; the only exits are during the reset between tricks. Lanczos upscale, light unsharp, fine grain, a soft vignette. The clacks play. |
| ≈ 0:01.2–0:02.1 | Trick 1 on the rail. |
| **0:01.93** | **The music comes in** at −24 dB under the clacks (the track from its 0:00). |
| 0:05.00–0:06.90 | The clacks fade out (qsin) while the music keeps rising: both audible together for ≈ 1.9 s. |
| **0:05.40–0:06.05** | **The dissolve** (0.65 s): real and game both play, the game clip from 1.29 s (game = source − 4.11 s). The flick at 5.60 on both; the lock at 5.77 on both. The game camera is the phone's fitted pose, static for the first ≈ 45 % of the dissolve. |
| 0:05.69 → | **The camera move** (checked with a per-frame camera trace, `camera-speed-opening.png`, and a 20 fps strip, `camera-move-strip-20fps.png`): from rest, the camera starts to travel with the board, its velocity easing up on a quintic smootherstep (zero velocity and acceleration at the start, 0 → 3.3 m/s over ≈ 0.25 s, never overshooting the board's speed); from 5.9 s it blends (quintic again, C2 at both ends; eye, look-at and FOV together, 68° → 42°) back and round to a low angle beside the rail, and settles into tracking (≈ 1.4 m/s) by ≈ 7.6 s. The one slow-motion window here eases in and out over 0.3 s instead of stepping, so the camera's speed stays continuous through it. The board stays in frame all the way; the move reveals the plaza and the BipBop Labs and v4rgas banners. |
| 0:06.0–0:08.4 | **The desk look** (a dark "desk mat" ground `#4a423b`, warm dim light) eases back to the game's own look. |
| **≈ 0:08.6** | **The trick out:** ↓ + S, ↓ let go at 3.40 s (clip) pops out of the grind, W + A flips it, Space at 3.93 s (0.55×). |
| **0:09.83** | **The landing:** the music reaches full level here, on the downbeat of its bar 4. |
| 0:09.9–0:11.8 | TWO FEET over the ride-away, then a hard cut on bar 1. |

**Camera match.** Measured on the real frame at 5.5 s (no hand), in the 4:5 crop (fractions
of width, height):

| Feature | Real | Game |
|---|---|---|
| Rail near end (bar axis) | (0.211, 0.433) | (0.20, 0.43) (the game rail continues past it, off-frame) |
| Rail far end | (0.435, 0.515) | (0.44, 0.52) |
| Horizon (from the posts) | v 0.559 | v 0.559 |
| Board at the lock | under the hand, ≈ 0.35–0.55 W, v ≈ 0.40 | ≈ 0.32–0.55 W, v ≈ 0.39 |

The bar's vanishing point (u 0.555) puts the rail 3.4° off the view axis; the camera sits
below the rail top; the lens is wide (≈ 68° vertical over the 4:5 crop). The **desk set**
(promo only): open ground, a round rail whose matched part is 0.9 m long and 0.2 m high,
then 4.6 m more rail toward and past the camera, and a barrier ring with the sponsors'
banners. **DESK_CAMERA**: eye (0.48, 0.103, −0.18) m (the real rail's near end at x = 0, the
rail along −X), looking back along the rail turned 3.4° toward +Z and pitched up 0.079 rad,
vertical FOV 68.1°, roll 0. Scale 0.9 of the first fit matches the real board's size.
`overlay-before.png` (the first estimate) and `overlay-after.png` (the fitted pose).

### 3 · Basics (the player's camera)

The game's own follow camera (the same rig the player sees), framed a little wider and
higher for the 4:5 frame (for the capture only: eye pulled back 1.4×, raised 0.18 m, FOV
+4°). The input widgets are big in the bottom corners, where the game's foot pads sit: left
the WASD foot (front, green), right the arrows foot (back, blue), each with the smoothed
stick and a trail, plus key caps lit from the clip's real key timeline.

| Clip time | Caption / move |
|---|---|
| 0.3 / 0.6 | "wasd moves the front foot" / "arrows move the back foot" (standing still) |
| 3.3 | "space pushes" |
| 5.0, 5.7, 6.4 | three pushes (≈ 3.3 m/s) |
| 7.0 | "hold ↓ and s, let go of ↓" |
| 8.60 → 8.96 | the load, the pop (0.5×): W levels, Space catches, landing 9.57 |
| 9.8 / 10.3 | "tap a to flip it" / "space to catch" |
| 11.40 → 11.76 | the load, the pop (0.5×): W + A flicks, Space at 12.30, landing 12.44 |
| 14.70 | cut (≈ 2 s of ride-away), on a half bar |

### 4–11 · The lines

Hard cuts on bars or half bars; the stick widgets small on every line (so the manual's stick
held back and the nose manual's stick pushed forward show), off for the gag and the finale.
Slow motion only on each line's peak.

| Line | What the physics shows | Camera | Slow motion (peak) | Landing | Ride-away |
|---|---|---|---|---|---|
| Manual → Nose Manual → Kickflip | balance: the tail pressed (nose up ≈ 0.08 rad) across the low pad, then the nose pressed across the high pad | low side, 3.4 m out, the whole line in frame | 0.5× over the kickflip out | 4.98 s | 2.1 s |
| BS 50-50, kinked rail | the board follows the rail's shape: flat, down, flat, no speed lost at the kinks | low side, 3.2 m out | 0.6× over the kinks | 3.85 s | 1.5 s |
| FS 50-50, funbox down rail | up a bank, a grind over the top and down the far side | low side (the open side), 3.2 m out | 0.6× over the rail's kink | 3.52 s | 1.8 s |
| Fakie 360, quarter pipe | momentum: up the transition, back down fakie, a body 360 that lands still fakie | fixed tripod at the quarter pipe's side, zooming 52° → 40° | 0.5× over the air | 3.71 s | 2.4 s |
| Heelflip → BS 50-50 → BS Pop Shove-it out | a flip into a grind and a shove-it out of it | fisheye, then low side | 0.5× over the flip-in and the lock | 3.37 s | 1.8 s |
| Kickflip → FS Tailslide → Hardflip out | all of it together | fisheye, low side, tripod, tracking side angle | 0.6× slide, 0.5× hardflip | 2.67 s | 2.1 s |
| The bail ("try 1") | the ragdoll: every controller lets go; the board lands upside down and slides off on its grip | fisheye push, then the courtyard tripod | 0.6× over the air and the impact | (bails at 2.99 s) | 0.8 s of sliding, hard cut on a downbeat |
| 360 Flip, El Toro ("try 2") | the biggest drop, landed | the fisheye push, then the courtyard tripod | 0.4× over the whole air | 2.70 s | 2.25 s, then the fade |

**Not built:** the brief's quarter pipe "BS 180 on the flat to ride forward again": a body
180 out of fakie under-rotated in every scan (spin holds 0.75–0.88 s); a longer hold spins a
full 360, and the Fakie 360 (hold 0.94 s) is what lands, so that is the line. The El Toro
handrail 50-50 before the finale was left out: the bail gag now sits there, and the
handrail would repeat the kinked-rail idea.

## Music

**"Rio Samba" by Liborio Conti.** No-copyright, commercial use allowed; attribution optional
(the video carries no credit). Optional line for the LinkedIn post:

> "Rio Samba" by Liborio Conti (Free No Copyright Royalty Free Music) https://www.youtube.com/LiborioConti

- **Tempo:** 122.25 BPM (autocorrelation of an onset envelope): a beat is 0.491 s, a bar
  1.963 s, and the first beat is 0.049 s into the track.
- **The ramp (no gap):** the track starts at video 1.927 s, from its 0:00, at −24 dB
  relative to its final level, and rises on a dB-linear (logarithmic) curve through the
  real clip, the dissolve and the grind to full level at the trick-out landing (9.829 s),
  the downbeat of the track's bar 4 (7.902 s in). The clacks fade out over 5.00–6.90 s
  (qsin) under it. `audio-envelope-0-14s.png`: no dip at the seam.
- **Cuts** (bars from the landing, 9.829 + 1.963·n s): basics 1 · manual line 9½ · kinked
  rail 13½ · funbox 16½ · quarter pipe 19½ · flip in/out 23 · the hubba line 26 · the bail
  29 (the hard cut to "try 2" at bar 31, a downbeat) · El Toro 31 · end card 34½. Only
  clip heads and tails moved to hit these; the tricks didn't.
- **End:** a 1.5 s fade-out over the end card. Two-pass `loudnorm` to −14 LUFS, ≤ −1 dBTP.

## Edit (`promo/linkedin/compose.sh`)

- The real part: video 0–6.05 s, crop 352 × 440 at y 92, Lanczos to 1080 × 1350, unsharp,
  grain (`noise=alls=5`), vignette, 60 fps.
- `xfade=fade:duration=0.65:offset=5.40` into the game recording (which starts at desk clip
  1.29 s). The desk look is set in the engine.
- Audio: the source's own sound to 6.90 s, limited, faded out 5.00–6.90 s (qsin); the samba
  from 1.927 s with `volume='if(lt(t,R),pow(10,-24*(1-t/R)/20),1)':eval=frame` (R = 7.902
  s), a 1.5 s fade-out at the end; `amix`, two-pass `loudnorm`, a limiter, AAC 48 kHz 192 kbps.
- libx264 High, crf 17, `+faststart`. Preview: 30 fps, crf 26. The seam's RMS table goes to
  `/tmp/tf-rms.txt`.

## Self-review (after the render, frames checked at 2 fps)

v5 (81.1 s), against the rules above:

1. **Open on the thing itself:** yes. No text until TWO FEET at 9.9 s.
2. **Lines breathe:** every line shows its full run, from approach to ride-away, in one
   shot, and cuts after 1.5–2.4 s of ride-away. The 2 fps check shows every move of every
   line in frame.
3. **Slow motion:** one peak per line, 0.4–0.6×. The opening's window eases in and out.
4. **Escalation, no repeats:** balance → the rail's shape → a bank → momentum → flips in
   and out → all of it → the bail → El Toro. Each named line appears once, and there is
   only one 360 Flip in the video.
5. **Text:** the captions are in the basics only; the lines get one lower-third each,
   readable ≥ 1.5 s; the bail and the end card have no extra text (the music credit is
   gone from the card).
6. **Camera move after the dissolve:** it starts from rest and eases up smoothly, blends
   C2 into the side angle and settles, with eye, look-at and FOV moving together.
   `camera-speed-opening.png` shows speed from a per-frame trace: 0 → 3.3 m/s, one smooth
   rise and fall, no jumps. `camera-move-strip-20fps.png` shows the board in frame
   throughout. An earlier spring-based version kept the speed smooth but left the board
   out of frame for about 1 s; it was dropped.
7. **Cuts on bars:** all cuts land on bars or half bars of the samba. The gag's hard cut to
   "try 2" lands on a downbeat.
8. **No dead air:** the music rises continuously from −24 dB at 1.9 s to full level at the
   landing, and the lowest point at the seam is −25.7 dB.

Still imperfect:
- The Fakie 360's tripod is far from where the spin happens, so the spin is small in frame.
- The camera starts moving at 45 % of the dissolve, not after it. Starting later lets the
  board run into the lens, so the last third of the dissolve has a slight drift; the rail
  still lines up.
- The Fakie 360 lands only at one spin setting (deterministic, so it replays; a person
  would find it hard).
