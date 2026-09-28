# TWO FEET — LinkedIn promo (script)

A game by v4rgas (<https://v4rgas.com>). You steer **each foot** on its own keys (WASD for
the front foot, the arrows for the back foot in regular stance).

The video opens on a **real fingerboard clip**, match-cuts into the game on the same trick,
and then climbs: the basics in the player's own camera, a grind and a stair, the technical
line, and El Toro last. Everything in the game half is **real input** replayed through the
game's own input → rider → Rapier physics. Nothing is animated. Every clip is checked by
`pnpm montage:verify`: the recognizer must name the trick, and nothing may bail.

- **Game half:** `src/game/montage/promo/linkedin.ts` (`promoLinkedIn`); the desk set, the
  match camera and the desk look in `promo/desk-set.ts` and `promo/fingerboard-match.ts`.
- **Record the game half (dev):** `pnpm dev`, then `/?montage=promo-linkedin&record=frames`.
- **Match test:** `/?montage=promo-desk-match&record=frames` (stills at the match frames).
- **Edit:** `promo/linkedin/compose.sh <game.mp4> <out.mp4>` (ffmpeg): the real clip, the
  crossfade, the sound, and a small preview.
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
2. **Every trick breathes:** ≥ 1 s of approach, the trick, and ≥ 1.5 s of ride-away before
   the cut (about 2 s). Cut after the ride-away, never mid-trick.
3. **Slow motion only on the key moment,** at 0.4–0.6× (never 0.2–0.3×), and never on the
   approach or the ride-away.
4. **Escalate:** basics → a grind and a stair → the technical line → the biggest drop last.
   Similar beats come in threes (push, ollie, kickflip; grind, stair; line, gap, El Toro).
5. **Text only where the picture can't explain it:** the controls, while the basics play.
   One idea per card, ≤ 6 words, lowercase, big (≈ 60 px on a 1080 frame), on screen for
   ≥ max(2 s, 1 s per 3 words + 1 s). A caption appears ≥ 2 s before its move where it
   can. Trick names are the recognizer's own, with no sub-captions (no "euro gap" or
   "flat, rolls away fakie"), each on screen ≥ 1.5 s.
6. **One title** ("TWO FEET"), at the moment of release (the music's entry), and the end
   card. No taglines, no filler ("real fingerboard", "same trick. in the browser.",
   "every trick is real input" are all gone).
7. **Cut on the music's bars (or half bars),** not on every beat. Hard cuts between clips;
   the only fades are into and out of the end card.
8. **Length:** as long as the tricks need, and no longer. 60 s here, since each trick gets
   its approach and ride-away.

**Trick names: kept, small.** The game names every trick itself (that is a feature), and a
LinkedIn viewer who doesn't skate can't tell a tailslide from a 50-50. So each trick after
the basics gets its name only, in the lower-third, for ≥ 1.5 s after the landing. The
basics don't get names: their captions already say what happens.

## Format

| | |
|---|---|
| Deliverable | **1080 × 1350 (4:5 portrait)**, 60 fps, H.264 High, yuv420p, `+faststart` |
| Preview | `two-feet-linkedin-4x5-preview.mp4`: 30 fps, crf 26, < 25 MB |
| Length | 60.0 s |
| Sound | The fingerboard clacks, a faint room tone through the in-game grind, then "Rio Samba" from the trick-out landing (a drop). AAC 48 kHz 192 kbps, −14 LUFS, ≤ −1 dBTP. It works muted. |
| 16:9 | Skipped: the real clip is portrait, and the match cut only lines up in 4:5. |

## Copy (all the text in the video)

| Where | Text |
|---|---|
| Title, over the trick-out's ride-away | **TWO FEET** (with the short deck-red bar) |
| Basics, line 1 then line 2 | wasd moves the front foot / arrows move the back foot |
| Basics | space pushes |
| Basics | hold ↓ and s, let go of ↓ |
| Basics, line 1 then line 2 | tap a to flip it / space to catch |
| Input widget labels | front foot · back foot |
| Lower-thirds (trick names only) | BS 50-50 · Ollie · Kickflip → FS Tailslide → Hardflip out · 360 Flip · 360 Flip |
| End card | **TWO FEET** · (pixel penguin) a game by v4rgas · v4rgas.com · small: music: Rio Samba by Liborio Conti |

## Structure and timings (video seconds)

| # | Time | Beat | Clip |
|---|---|---|---|
| 1 | 0:00–0:05.7 | Real fingerboard: trick 1, the reset, trick 2's approach and flick | source 0–5.89 s |
| 2 | 0:05.7–0:11.9 | The match cut, the grind on the long rail as the camera pulls back, the kickflip out, **the drop** and TWO FEET | `promo-desk-kickflip-fifty-fifty` |
| 3 | 0:11.9–0:29.5 | Basics in the player's camera, with the controls: push, ollie, kickflip | `promo-basics` |
| 4 | 0:29.5–0:35.4 | Ollie to 50-50 on the flat bar | `promo-rail-fifty-fifty` |
| 5 | 0:35.4–0:40.3 | Ollie down the 7-stair | `promo-ollie-seven-stair` |
| 6 | 0:40.3–0:46.2 | Kickflip → FS Tailslide → Hardflip out (7-stair hubba) | `promo-line-g4` |
| 7 | 0:46.2–0:51.1 | 360 Flip off the euro gap | `promo-line-tre-gap` |
| 8 | 0:51.1–0:57.0 | 360 Flip down El Toro (the 20-stair) | `promo-tre-flip-el-toro` |
| 9 | 0:57.0–1:00.0 | End card | — |

### 1–2 · The opening, beat by beat

| Video | What happens |
|---|---|
| 0:00 | The real clip, cropped to 4:5 (352 × 440 at y 92–532 of 624). The watermark (y ≥ ≈ 549) is fully out. A crop check over 0–5.9 s at 4 fps shows the rail, the board and the hands in frame at every key moment. The only exits are 2.2–2.6 s (the hand leaves the top) and 2.8–3.0 s (the board at the bottom edge), both during the reset between tricks. Lanczos upscale, light unsharp, fine grain, a soft vignette. The clacks play. |
| ≈ 0:01.2–0:02.1 | Trick 1 on the rail. |
| ≈ 0:04.4 | Trick 2's approach from the right. |
| 0:05.60 | The flick (the kickflip in). |
| **0:05.72** | **The match cut:** a 5-frame crossfade (0.167 s) into the game clip at 1.61 s (game = source − 4.11 s). The real board lands on the rail at 5.77 s; the game board locks at 1.66 s (video 5.77 s). The clacks fade out over 5.60–6.00 s, and a faint room tone takes over. |
| 0:05.72–0:05.91 | The game camera is locked at the phone's pose (below). The game rail runs on past where the real rail ends, off the left edge of the frame, so the board keeps grinding. |
| 0:05.91–0:07.71 | **The camera move:** a 1.8 s eased blend from the locked pose back and round to a low angle beside the rail (`lowSide`, 2.6 m out, 0.35 m up). Revealing the game: its plaza, the barrier ring with the BipBop Labs and v4rgas banners. The grind plays at 0.6×. |
| 0:06.04–0:08.37 | **The desk look** (a dark "desk mat" ground `#4a423b`, warm dim light) eases back to the game's own look. |
| **0:08.55** | **The trick out:** ↓ + S from 3.15 s, let go of ↓ at 3.40 s (clip) pops out of the grind, W + A flips it, Space at 3.93 s. The air plays at 0.5×. |
| **0:09.85** | **The landing = the drop:** the samba's first beat lands here. |
| 0:09.90–0:11.9 | TWO FEET over the ride-away (real time), then a hard cut on bar 1. |

**Camera match.** Measured on the real frame at 5.5 s (no hand), in the 4:5 crop, as
fractions of width and height:

| Feature | Real | Game |
|---|---|---|
| Rail near end (bar axis) | (0.211, 0.433) | (0.20, 0.43) (the game rail continues past it, off-frame) |
| Rail far end | (0.435, 0.515) | (0.44, 0.52) |
| Horizon (from the posts) | v 0.559 | v 0.559 |
| Board at the lock | under the hand, ≈ 0.35–0.55 W, v ≈ 0.40 | ≈ 0.30–0.55 W, v ≈ 0.38 |

- The bar's vanishing point (u 0.555) means the rail runs 3.4° off the view axis. The
  camera sits below the rail top, and the lens is wide: ≈ 68° vertical over the 4:5 crop.
- **Desk set** (promo only): open ground, a round rail whose matched part is 0.8 m long,
  0.18 m high, then 4.6 m more rail toward and past the camera, and a barrier ring
  (34 × 18 m) with the sponsors' banners.
- **DESK_CAMERA:** eye (0.428, 0.091, −0.16) m, with the real rail's near end at x = 0 and
  the rail along −X. It looks back along the rail, turned 3.4° toward +Z and pitched up
  0.079 rad. Vertical FOV 68.1°, roll 0, locked off until 1.8 s of clip time.
- **Board size:** the first fit (a 1.0 m rail, the camera 0.535 m out) scaled by 0.8. The
  angles don't change, and the fixed-size board reads 25 % bigger, closer to the real one.
- **Check:** `overlay-before.png` (the first estimate: the rail too steep) and
  `overlay-after.png` (the fitted pose at the 0.8 scale, with the desk look: the rail on
  the real rail, the board where the real board and hand are, the rail's continuation off
  the left edge).
- **Known limits:** the game rail's far post sits a little inward of the real one (a fixed
  0.35 m inset), and the continuing rail crosses the upper-left corner near the lens.

### 3 · Basics (the player's camera)

The game's own follow camera (the same rig the player sees). The input widgets are big in
the bottom corners, where the game's foot pads sit. Left is the WASD foot (front, green),
right the arrows foot (back, blue). Each shows the smoothed stick with a trail, plus its
key caps lit from the clip's real key timeline, with a Space cap between them.

| Clip time | Video | Caption / move |
|---|---|---|
| 0.1 / 0.4 | 11.96 / 12.26 | "wasd moves the front foot" / "arrows move the back foot" (standing still) |
| 3.2 | 15.06 | "space pushes" |
| 5.0, 5.7, 6.4 | 16.86, 17.56, 18.26 | three pushes (≈ 3.3 m/s) |
| 7.0 | 18.86 | "hold ↓ and s, let go of ↓" |
| 8.60 → 8.96 | 20.46 → 21.18 | the load, then the pop (0.5×): W levels, Space catches, landing 9.57 |
| 10.3 / 11.2 | 22.94 / 23.84 | "tap a to flip it" / "space to catch" |
| 12.40 → 12.76 | 25.04 → 25.84 | the load, then the pop (0.5×): W + A flicks, Space at 13.30, landing 13.44 |
| 15.39 | 29.54 | cut (≈ 2 s of ride-away), bar 10 |

### 4–8 · The climb

Hard cuts on bars. The widgets are small on 4–7 and off for El Toro. Trick names only.

| Clip | Approach | Key moment (slow) | Landing | Ride-away |
|---|---|---|---|---|
| BS 50-50, flat bar | fisheye 1.05 s | low side, 0.5× over the pop and lock | 3.47 s | 1.7 s (follow cam) |
| Ollie, 7-stair | the high wide shot, then the tripod | 0.5× over the air | 1.77 s | 2.2 s |
| Kickflip → FS Tailslide → Hardflip out | fisheye, then low side | 0.6× slide, 0.5× hardflip | 2.67 s | 2.1 s (distant tripod) |
| 360 Flip, euro gap | low side | 0.45× over the air | 1.77 s | 2.2 s |
| 360 Flip, El Toro | fisheye push across the quad (from 0.4 s) | courtyard tripod, 0.4× over the whole air | 2.70 s | 1.7 s, then the fade |

## Music

**"Rio Samba" by Liborio Conti.** It is a no-copyright track that allows commercial use.
Attribution is appreciated but not required. We don't claim it and don't redistribute
the file. Paste this line into the LinkedIn post:

> "Rio Samba" by Liborio Conti (Free No Copyright Royalty Free Music) https://www.youtube.com/LiborioConti

- **Tempo:** 122.25 BPM (autocorrelation of an onset envelope). A beat is 0.491 s, a bar
  1.963 s, and the first beat is 0.049 s into the track.
- **Entry:** the track starts at video 9.803 s, so its first beat hits the trick-out
  landing at 9.852 s (the drop). Before that there are only the clacks and a faint room
  tone: the build-up, then the release.
- **Cuts** (bars counted from the drop, at 9.901 + 1.963·n s):

  | Cut | Video | Bar |
  |---|---|---|
  | basics | 11.86 | 1 |
  | 50-50 | 29.54 | 10 |
  | 7-stair | 35.43 | 13 |
  | G4 line | 40.34 | 15½ |
  | euro gap | 46.23 | 18½ |
  | El Toro | 51.15 | 21 |
  | end card | 57.04 | 24 |

  Only the clip heads and tails moved to hit these; the tricks didn't.
- **End:** the music fades out over the last 1.5 s of the end card. The clacks are
  limited and sit under the music's level. The mix is normalised with a linear two-pass
  `loudnorm`.

## Edit (`promo/linkedin/compose.sh`)

- The real part: trim 0–5.887 s, crop 352 × 440 at y 92, Lanczos to 1080 × 1350, unsharp,
  grain (`noise=alls=5`), vignette, 60 fps.
- `xfade=fade:duration=0.167:offset=5.72` into the game recording. The warm bridge is now
  in the engine (the desk look), not an ffmpeg wash.
- Audio: clacks (out 5.60–6.00 s), brown-noise room tone at about −52 dBFS (5.5 s to the
  drop), the samba from 9.803 s. Two-pass `loudnorm`, AAC 48 kHz 192 kbps.
- libx264 High, crf 17, `+faststart`. Preview: 30 fps, crf 26.

## Self-review (after the render, frames checked at 2 fps)

Against the rules above:

1. **Open on the thing itself:** yes. The first frame is the real clip, with no text until
   TWO FEET at 9.9 s.
2. **Tricks breathe:** yes. Every game trick shows its approach (≥ 1 s, except the 50-50,
   whose approach is 1.05 s at 4 m/s through a fisheye) and ≈ 1.7–2.2 s of ride-away
   before the cut. The first render showed the board leaving the frame for about 1 s right
   after the match cut (it ran at the locked camera); a `travelWith` camera now keeps it
   framed. The G4 ride-away ran into its tripod; it now eases into a tracking side angle.
3. **Slow motion:** 0.4–0.6× on pops, locks and airs only; approaches and ride-aways are
   real time.
4. **Escalation:** yes: push → ollie → kickflip → 50-50 → 7-stair ollie → the hubba line →
   the euro-gap 360 flip → El Toro.
5. **Text:** the basics carry the only captions. Each is ≤ 6 words and on screen 2.7–3.7 s
   (the 2 fps frames show each one fully readable for its whole hold), in the player's
   camera. "space pushes" appears 1.8 s before the first push, "hold ↓ and s, let go of ↓"
   2 s before the ollie's pop, and "tap a to flip it" 2.5 s before the flick. Trick names
   only, each readable ≥ 1.5 s.
6. **One title, one end card:** yes. The removed lines ("real fingerboard", "same trick. in
   the browser.", "every trick is real input", "one foot per hand", and the sub-captions)
   are gone.
7. **Cuts on bars:** all cuts land on bars or half bars of the samba, all hard cuts; the
   only fades are into and out of the end card (no more dark frames mid-video).
8. **Length:** 60.05 s. That is the upper edge of the 45–60 s the brief allowed. The next
   thing to trim, if needed, is the first basics caption pair (the board stands still for
   5 s).

Still imperfect:
- The continuing game rail crosses the upper-left corner near the lens right after the
  cut (it's the rail running on, as asked, but it's close to the lens).
- The follow camera frames the board large and low in 4:5; the widgets sit just beside
  it, not over it.
- At the seam, the game board reads about 20 % smaller than the real one even after the
  0.8× set scale.
