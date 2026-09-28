# TWO FEET — LinkedIn promo (script)

A game by v4rgas (<https://v4rgas.com>). You steer **each foot** on its own keys (WASD for
the front foot, the arrows for the back foot in regular stance).

The video opens on a **real fingerboard clip**, dissolves into the game on the same trick,
and then climbs one new idea at a time: the basics in the player's own camera, a grind, a
new flip, a flip down a drop, a slide, the line that combines them, and El Toro last. Everything in the game half is **real input** replayed through the
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
4. **Escalate, one new idea per step, and never repeat a trick name on screen:** basics →
   the first grind → a new flip → a flip down a drop → a slide → the line that combines
   them → the biggest drop last.
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
| Length | 65.4 s |
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
| Lower-thirds (trick names only) | BS 50-50 · Heelflip · Kickflip · FS Tailslide · Kickflip → FS Tailslide → Hardflip out · 360 Flip |
| End card | **TWO FEET** · (pixel penguin) a game by v4rgas · v4rgas.com · small: music: Rio Samba by Liborio Conti |

## Structure and timings (video seconds)

| # | Time | Beat | Clip |
|---|---|---|---|
| 1 | 0:00–0:06.05 | Real fingerboard: trick 1, the reset, trick 2's approach and flick | source 0–6.05 s |
| 2 | 0:05.40–0:11.82 | The dissolve into the game over the lock, the grind on the long rail as the camera travels and pulls back, the kickflip out, the landing at full music, TWO FEET | `promo-desk-kickflip-fifty-fifty` |
| 3 | 0:11.82–0:28.50 | Basics in the player's camera, with the controls: push, ollie, kickflip | `promo-basics` |
| 4 | 0:28.50–0:34.39 | BS 50-50 on the flat bar (the first grind) | `promo-rail-fifty-fifty` |
| 5 | 0:34.39–0:39.31 | Heelflip off the euro gap (a new flip) | `promo-heelflip-gap` |
| 6 | 0:39.31–0:44.22 | Kickflip down the 7-stair (a flip plus a drop) | `promo-kickflip-seven-stair` |
| 7 | 0:44.22–0:49.13 | FS Tailslide on the hubba, ollie out (a slide on its own) | `promo-tailslide-hubba` |
| 8 | 0:49.13–0:55.02 | Kickflip → FS Tailslide → Hardflip out (it all together) | `promo-line-g4` |
| 9 | 0:55.02–1:01.89 | 360 Flip down El Toro (the 20-stair), the only 360 flip | `promo-tre-flip-el-toro` |
| 10 | 1:01.89–1:05.39 | End card | — |

### 1–2 · The opening, beat by beat

| Video | What happens |
|---|---|
| 0:00 | The real clip, cropped to 4:5 (352 × 440 at y 92–532 of 624): the watermark (y ≥ ≈ 549) is fully out. A crop check over 0–6 s at 4 fps shows the rail, the board and the hands in frame at every key moment; the only exits are during the reset between tricks (the hand leaves the top at 2.2–2.6 s, the board touches the bottom edge at 2.8–3.0 s). Lanczos upscale, light unsharp, fine grain, a soft vignette. The clacks play. |
| ≈ 0:01.2–0:02.1 | Trick 1 on the rail. |
| **0:01.95** | **The music comes in** at −24 dB under the clacks (the track from its 0:00). |
| ≈ 0:04.4 | Trick 2's approach. |
| 0:05.00–0:06.90 | The clacks fade out (qsin) while the music keeps rising: both audible together for ≈ 1.9 s. |
| **0:05.40–0:06.05** | **The dissolve** (0.65 s): real and game both play, the game clip from 1.29 s (game = source − 4.11 s). The flick is at 5.60 on both; the real board lands on the rail at 5.77 s, the game board locks at 1.66 s (video 5.77 s). The game camera is the phone's fitted pose. |
| 0:05.73 | The game camera starts travelling with the board (horizontally, eased over 0.2 s), so the board keeps the size it has at the lock (the real board's size) instead of growing as it comes at the lens. The game rail runs on past where the real one ends, off the left edge. |
| 0:06.71–0:08.51 | **The camera move:** a 1.8 s eased blend back and round to a low angle beside the rail (`lowSide`, 2.6 m out, 0.35 m up), revealing the game (its plaza, the barrier ring with the BipBop Labs and v4rgas banners). The grind plays at 0.6×. |
| 0:06.04–0:08.37 | **The desk look** (a dark "desk mat" ground `#4a423b`, warm dim light) eases back to the game's own look. |
| **0:08.55** | **The trick out:** ↓ + S from 3.15 s, ↓ let go at 3.40 s (clip) pops out of the grind, W + A flips it, Space at 3.93 s; the air at 0.5×. |
| **0:09.85** | **The landing:** the music reaches full level here, on the downbeat of its bar 4. |
| 0:09.90–0:11.8 | TWO FEET over the ride-away (real time), then a hard cut on bar 1. |

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
vertical FOV 68.1°, roll 0. The first fit at a 1.0 m rail made the board read small; 0.8
made it bigger than the real one right after the cut; **0.9** matches it (angles and FOV
don't change with the scale). Checked with 50/50 overlays: `overlay-before.png` (the first
estimate) and `overlay-after.png` (the fitted pose).

### 3 · Basics (the player's camera)

The game's own follow camera (the same rig the player sees), framed a little wider and
higher for the 4:5 frame (for the capture only: eye pulled back 1.4×, raised 0.18 m, FOV
+4°), so the board sits mid-frame with space round it. The input widgets are big in the
bottom corners, where the game's foot pads sit. Left is the WASD foot (front, green), right
the arrows foot (back, blue): each shows the smoothed stick with a trail, plus its key caps
lit from the clip's real key timeline, with a Space cap between them.

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

### 4–9 · The climb

Hard cuts on bars or half bars. The widgets are small on 4–8, off for El Toro. Trick
names only.

| Clip | Approach | Key moment (slow) | Landing | Ride-away |
|---|---|---|---|---|
| BS 50-50, flat bar | fisheye 1.05 s | low side, 0.5× over the pop and lock | 3.47 s | 1.7 s (follow cam) |
| Heelflip, euro gap | low side, 0.9 s | 0.5× over the air | 1.77 s | 2.4 s |
| Kickflip, 7-stair | fisheye from 1.3 s (1.3 s) | tripod, 0.5× over the air | ≈ 3.5 s | 1.8 s |
| FS Tailslide, hubba (ollie out) | fisheye, then low side | 0.6× over the slide | 2.72 s | 1.7 s (tracking side angle) |
| Kickflip → FS Tailslide → Hardflip out | fisheye, then low side | 0.6× slide, 0.5× hardflip | 2.67 s | 2.1 s (tracking side angle) |
| 360 Flip, El Toro | the fisheye push across the quad (from 0 s) | courtyard tripod, 0.4× over the whole air | 2.70 s | 2.25 s, then the fade |

## Music

**"Rio Samba" by Liborio Conti.** No-copyright, commercial use allowed; attribution
appreciated but not required. We don't claim it and don't redistribute the file. Paste
this line into the LinkedIn post:

> "Rio Samba" by Liborio Conti (Free No Copyright Royalty Free Music) https://www.youtube.com/LiborioConti

- **Tempo:** 122.25 BPM (autocorrelation of an onset envelope): a beat is 0.491 s, a bar
  1.963 s, and the first beat is 0.049 s into the track.
- **The ramp (no gap):** the track starts at video 1.951 s, from its 0:00, at −24 dB
  relative to its final level. It rises on a dB-linear (logarithmic) curve through the
  real clip, the dissolve and the grind, and reaches full level at the trick-out landing
  (9.853 s), which is the downbeat of the track's bar 4 (7.902 s in). The clacks fade out
  over 5.00–6.90 s with a qsin curve, under the rising music. `audio-envelope-0-14s.png`
  plots the RMS (50 ms windows) over 0–14 s: no dip at the seam. The lowest point between
  4 and 11 s is −25.4 dB (at 5.0 s, where the clacks start their fade), against about −20
  to −15 dB around it.
- **Cuts** (bars counted from the landing, at 9.853 + 1.963·n s):

  | Cut | Video | Bar |
  |---|---|---|
  | basics | 11.82 | 1 |
  | 50-50 | 28.50 | 9½ |
  | heelflip | 34.39 | 12½ |
  | kickflip 7-stair | 39.31 | 15 |
  | tailslide | 44.22 | 17½ |
  | the line | 49.13 | 20 |
  | El Toro | 55.02 | 23 |
  | end card | 61.89 | 26½ |

  Only the clip heads and tails moved to hit these; the tricks didn't.
- **End:** the music fades out over the last 1.5 s of the end card. Mixed, then normalised
  with a linear two-pass `loudnorm` to −14 LUFS and ≤ −1 dBTP (−13.9 LUFS, −1.6 dBTP).

## Edit (`promo/linkedin/compose.sh`)

- The real part: video 0–6.05 s, crop 352 × 440 at y 92, Lanczos to 1080 × 1350, unsharp,
  grain (`noise=alls=5`), vignette, 60 fps.
- `xfade=fade:duration=0.65:offset=5.40` into the game recording (which starts at desk clip
  1.29 s). The desk look is set in the engine.
- Audio: the source's own sound to 6.90 s, limited, faded out 5.00–6.90 s (qsin); the samba
  from 1.951 s with `volume='if(lt(t,R),pow(10,-24*(1-t/R)/20),1)':eval=frame` (R = 7.902
  s, the ramp), a 1.5 s fade-out at the end; `amix`, two-pass `loudnorm`, a limiter, AAC 48
  kHz 192 kbps.
- libx264 High, crf 17, `+faststart`. Preview: 30 fps, crf 26. The seam's RMS table goes to
  `/tmp/tf-rms.txt`.

## Self-review (after the render, frames checked at 2 fps)

v4 (65.4 s), against the rules above:

1. **Open on the thing itself:** yes. No text until TWO FEET at 9.9 s.
2. **Tricks breathe:** every climb step shows ≥ 1 s of approach and 1.7–2.4 s of
   ride-away. After the lock the camera travels with the board, horizontally only, so
   the board holds its lock-time size. A draft let it grow toward the lens and, with a
   vertical follow, dip the camera under the ground; both are fixed.
3. **Slow motion:** 0.4–0.6× on pops, locks, slides and airs only.
4. **Escalation, no repeats on screen:** BS 50-50 → Heelflip → Kickflip (7-stair) → FS
   Tailslide → the Kickflip → FS Tailslide → Hardflip out line → 360 Flip (El Toro only).
   The kickflip in the basics is taught by its captions and not named, so the only named
   Kickflip is the 7-stair one.
5. **Text:** the captions live in the basics only; each is ≤ 6 words and on screen 2.7–3.7
   s, and the 2 fps frames show each one fully readable for its whole hold. The first
   pair sits over the standing start again, with room to read.
6. **One title, one end card:** yes.
7. **Cuts on bars:** all cuts land on bars or half bars; hard cuts; the one dissolve (0.65
   s, both clips moving, over the lock) is the match; fades only into and out of the end
   card.
8. **No dead air:** the audio has no gap. The music rises continuously from −24 dB
   (1.95 s) to full level at the landing, and the lowest seam point is −25.4 dB.

Still imperfect:
- The continuing game rail crosses the upper-left corner near the lens during and after
  the dissolve.
- After the lock the real board slides out of the real frame while the game camera starts
  to travel, so the last ~0.3 s of the dissolve is not a perfect geometric overlay (the
  rail still is).
- The game rail's far post sits a little inward of the real one (a fixed post inset).
