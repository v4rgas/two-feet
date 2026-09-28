# TWO FEET — LinkedIn promo (script)

A game by v4rgas (<https://v4rgas.com>). You steer **each foot** on its own keys (WASD
for the front foot, the arrows for the back foot in regular stance). Two feet is also
0.61 m.

The video opens on a **real fingerboard clip** and match-cuts into the game on the same
trick. Then it shows how the feet are controlled, three lines, El Toro, and the end card.
Everything in the game half is **real input**: key timelines replayed through the game's
own input → rider → Rapier physics path. Nothing is animated. Every clip is checked by
`pnpm montage:verify`: the recognizer must name the trick, and nothing may bail.

- **Game half:** `src/game/montage/promo/linkedin.ts` (`promoLinkedIn`), the desk set and
  the match camera in `promo/desk-set.ts` and `promo/fingerboard-match.ts`.
- **Record the game half (dev):** `pnpm dev`, then open
  `/?montage=promo-linkedin&record=frames`. The dev server encodes an H.264 MP4 into
  `MONTAGE_OUT_DIR`.
- **Match test:** `/?montage=promo-desk-match&record=frames` renders the desk clip from
  just before the lock, with stills at the match frames, to lay over the real frames.
- **Edit:** `promo/linkedin/compose.sh` (ffmpeg, see "Edit" below) crossfades the real clip
  into the game recording and lays the music under it.
- **Source clip:** `recordings/linkedin/source/fingerboard.mp4` (352 × 624, 30 fps, 12.1 s,
  AAC). It is git-ignored and never committed.

## Format

| | |
|---|---|
| Deliverable | **1080 × 1350 (4:5 portrait)**, 60 fps, H.264 High, yuv420p, `+faststart` |
| Length | ≈ 40.5 s |
| Sound | The fingerboard clacks on the real part. "Rio Samba" (Liborio Conti) comes in under the cut and runs to the end, cut to its beat. AAC 48 kHz, 192 kbps, −14 LUFS integrated, ≤ −1 dBTP. It must still work muted, since LinkedIn autoplays muted. |
| 16:9 | Skipped. The real clip is portrait, and the match cut only lines up in the 4:5 crop. |

## Copy

Plain words that say what is on screen: mostly lowercase, one idea per line, no hype, no
exclamation marks. Trick names are exactly as the recognizer writes them.

| Where | Text |
|---|---|
| Real clip, top | real fingerboard |
| After the cut, top | same trick. in the browser. |
| Lower-third on the landing | Kickflip → BS 50-50 (the recognizer's name) |
| Title | **TWO FEET** / one foot per hand |
| Controls, top | wasd moves the front foot / arrows move the back foot |
| Controls, steps | back foot pops · front foot flicks · space catches it |
| Controls, lower-third | Kickflip |
| Input widget labels | front foot · back foot |
| Lines, top | every trick is real input |
| Lines, lower-thirds | Kickflip → FS Tailslide → Hardflip out / 7-STAIR HUBBA · 360 Flip / EURO GAP · BS 180 Kickflip / FLAT, ROLLS AWAY FAKIE |
| El Toro, lower-third | 360 Flip / EL TORO - 20 STAIRS |
| End card | **TWO FEET** · (pixel penguin) a game by v4rgas · v4rgas.com |
| End card, bottom, small | music: Rio Samba by Liborio Conti |

**Type:** Inter 800 caps for TWO FEET (0.04 em tracking, a short `deck`-red bar under it),
Inter for the kickers and lower-thirds, and Space Mono for the sub-line, the credit and the
URL.

## Shot list

Times are in the final video.

### 1 · Real fingerboard (0:00 – 0:05.9)

The source clip, cropped to 4:5 (352 × 440 at y 92–532 of 624). This cuts the
`@codefingerboards` watermark out completely (it starts at y ≈ 555). It is scaled to
1080 × 1350 with Lanczos, a light unsharp, fine grain and a soft vignette to hide the
upscale. Trick 1 plays at 0:01–0:03, trick 2 from 0:05.2. The kicker "real fingerboard"
shows from 0:00.25 to 0:02.7. The clip's own audio plays.

### 2 · The match cut (0:05.72 – 0:05.89)

A 5-frame crossfade (0.167 s) from the real board to the game board at the lock. The game
clip `promo-desk-kickflip-fifty-fifty` enters at clip time 1.58 s, which is 5.72 s of the
source (game time = source time − 4.14 s). The real board lands on the rail at 5.77 s; the
game board locks at ≈ 1.63 s. The audio fades out over 5.47–5.87 s.

**Camera match** (the top priority). Measured on the real frame at 5.5 s (no hand), in
the 4:5 crop, as fractions of width and height:

| Feature | Real | Game (fitted) |
|---|---|---|
| Rail near end (bar axis, round cap) | (0.211, 0.433) | ≈ (0.20, 0.43) |
| Rail far end | (0.435, 0.515) | ≈ (0.44, 0.52) |
| Near post, top → base | x 0.269, 0.474 → 0.696 | x ≈ 0.28, base ≈ 0.65 |
| Far post, top → base | x 0.421, 0.508 → 0.641 | x ≈ 0.41 |
| Horizon (from the two posts) | v 0.559 | v 0.559 (from the pitch) |
| Board at the lock | ≈ 0.35–0.55 W, v ≈ 0.40 (under the hand) | ≈ 0.33–0.52 W, v ≈ 0.40 |

What the real frame says:
- The bar's vanishing point is at u 0.555. The rail runs only 3.4° off the view axis, so
  the board comes almost straight at the lens. Perspective makes it read as right → left.
- The camera is **below** the rail top, at 0.62 × the bar's underside.
- The rail's two ends put its near end 0.535 rail-lengths from the camera. Only a wide
  lens gives that: ≈ 68° vertical over the 4:5 crop (the phone's wide camera, ≈ 57°
  horizontal).

The game double: the **desk set** (promo only, not a map). It is flat ground and one round
rail, 1.0 m long with its bar top at 0.225 m. That is the real rail's height-to-length
ratio, at a size the rider can grind. The **camera** (`DESK_CAMERA`):

- Eye at (0.535, 0.114, −0.20) m, with the rail's near end at x = 0 and the rail along −X.
- It looks back along the rail, turned 3.4° toward +Z and pitched up 0.079 rad.
- Vertical FOV 68.1°. Roll 0. Locked off.

The fit is checked with 50/50 overlays of the game still over the real frame:
`overlay-before.png` (the first estimate, a 7.2° yaw and a 50.8° FOV: the rail too steep)
and `overlay-after.png` (the fitted pose: the rail lies on the real rail).

Two known limits:
- The game rail's posts are inset 0.35 m (a world constant), against about 0.24 of the
  length on the real rail. So the post bases sit about 4 % high.
- The real board is huge next to its rail (its wheelbase is about the rail's length). The
  game board reads a little smaller, but it sits where the real board and hand are.

**Board motion:** the direction matches (toward the lens, reading right → left). The screen
speed matches too: at 3.6 m/s the game board crosses about 1 frame width per second near
the rail, like the real one. The trick phase matches: the flip comes round and locks at
the same instant. So the game plays at 1× through the cut.

### 3 · Same trick, in the game (0:05.9 – 0:08.0)

The 50-50 grinds to the rail's near end, rolls off and lands. It cuts to a low side
angle for the roll-away. The kicker "same trick. in the browser." shows, and the
lower-third "Kickflip → BS 50-50".

### 4 · Title (0:08.0 – 0:12.4) — `promo-deck-reveal`

A slow roll on the street 7-stair's deck, with the `deckShowcase` long-lens orbit pushing
in low. A heelflip turns the penguin deck graphic to the lens in 0.2× slow motion.
**TWO FEET** / "one foot per hand".

### 5 · Controls (0:12.4 – 0:19.3) — `promo-controls-kickflip`

A kickflip on flat ground, from a low toe-side angle. The **input widgets** are big: two
pads along the bottom band. Left is the WASD foot (front, green), right the arrows foot
(back, blue).

- Each pad shows its foot's **smoothed stick** (the `IntentFrame` value the rider uses),
  with a 0.3 s trail, and its key caps.
- The caps light up with the raw keys from the clip's own timeline. A Space cap sits
  between the pads.
- Captions: "wasd moves the front foot" / "arrows move the back foot", then 0.25× slow
  motion from the load to the landing with "back foot pops" · "front foot flicks" ·
  "space catches it".

### 6 · Lines (0:19.3 – 0:31.1)

The widgets are small. Each line gets a lower-third with its real name:
- `promo-line-g4`: kickflip → FS tailslide → hardflip out on the 7-stair hubba.
- `promo-line-tre-gap`: 360 flip off the euro gap.
- `promo-line-bs180`: BS 180 kickflip on flat, rolling away fakie.

These are the montage clips, trimmed with lighter slow motion (the same keys, so the same
landings). "every trick is real input" shows over the first line.

### 7 · El Toro (0:31.1 – 0:37.5) — `promo-tre-flip-el-toro`

A push across the quad (fisheye) → a cut to a courtyard tripod at (11, 1.2, 5.5). It
zooms 38° → 27° through 0.33× slow motion for the whole air and holds as the rider rolls
past. The widgets are off. Lower-third: "360 Flip" / EL TORO - 20 STAIRS.

### 8 · End card (0:37.5 – 0:40.5)

The v4rgas black. **TWO FEET** with the deck-red bar, then the pixel penguin (crisp
nearest-neighbour) beside "a game by v4rgas", then **v4rgas.com** (`.com` muted). BipBop
Labs appears only as its in-world banners. The deck's penguin art stays on the deck.

## Music

**"Rio Samba" by Liborio Conti.** It is a no-copyright track that allows commercial use.
Attribution is appreciated but not required. We don't claim it, and we don't redistribute
the file (`recordings/linkedin/source/rio-samba-liborio-conti.mp3`, git-ignored). Paste
this line into the LinkedIn post:

> "Rio Samba" by Liborio Conti (Free No Copyright Royalty Free Music) https://www.youtube.com/LiborioConti

**Placement:** the track plays from its 0:00, since its opening is the intro. It starts at
0:05.50 under the clacks' fade-out (0:05.47–0:05.87), a 0.4 s overlap, with a 0.3 s fade-in.
It runs to the end and fades out over the last 1.5 s of the end card.

**Beat grid:** 122.25 BPM, found by autocorrelating an onset envelope. The beat is 0.491 s
and a bar (4 beats) is 1.963 s. The first beat is 0.049 s into the track, which is video
0:05.549. Bars fall at 5.549 + 1.963·n s of the video. The track changes section at its
bar 10 (0:19.7 into the track, video 0:25.2: the percussion comes in) and bar 17 (0:33.4,
video 0:38.9).

**Cuts on the music:** the clip boundaries were shifted by a few frames (heads trimmed,
tails lengthened), not the tricks.

| Cut | Video | On |
|---|---|---|
| Title (deck reveal) | 0:08.00 | beat (bar 1 + 1 beat) |
| Controls | 0:12.41 | beat (bar 3 + 2 beats) |
| Lines (G4) | 0:19.29 | downbeat, bar 7 |
| 360 Flip, euro gap | 0:23.96 | ≈ beat (bar 9 + 1.5 beats) |
| BS 180 Kickflip | 0:27.49 | ≈ beat (bar 11 + 0.7 beat) |
| El Toro | 0:31.07 | downbeat, bar 13 |
| El Toro landing | ≈ 0:35.99 | beat (bar 15 + 2 beats) |
| End card | 0:37.46 | beat (bar 16 + 1 beat) |

**Levels:** the clacks are limited (they peak at +1.9 dBTP in the source) and sit about
6 dB under the samba. The whole mix is normalised with a linear two-pass `loudnorm` to
−14 LUFS integrated and ≤ −1 dBTP.

## Edit

`promo/linkedin/compose.sh <game.mp4> <kicker.png> <out.mp4>` (ffmpeg), in words:
- The real part: trim 0–5.887 s, crop 352 × 440 at y 92, Lanczos to 1080 × 1350, unsharp,
  grain (`noise=alls=5`), a vignette, and 60 fps. The "real fingerboard" kicker PNG (drawn
  in the page, so it matches the game kickers) is overlaid with alpha fades.
- `xfade=fade:duration=0.167:offset=5.72` into the game recording. The game's first 1.6 s
  carry a warm, dim wash (50 % → 0 over 0.25–1.45 s). It bridges the room's warm, low light
  and the game's bright plaza, so the fade doesn't flash.
- Audio: the clacks (limited, faded out 5.47–5.87 s) plus the samba (from 5.50 s, a 0.3 s
  fade-in, a 1.5 s fade-out at the end). A linear two-pass `loudnorm` to −14 LUFS and
  ≤ −1 dBTP, then AAC 48 kHz 192 kbps.
- libx264 High, crf 17, yuv420p, `+faststart`.

## Not done

The kinked-rail and funbox down-rail 50-50s from the brief are not in the lines. There
are no montage clips for them yet, and the lines are already ≈ 10 s.
