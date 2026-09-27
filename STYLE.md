# Skate — Style Guide

How the game looks, feels, and sounds. The code conventions are in
[`REQUIREMENTS.md` §2](REQUIREMENTS.md#2-code-requirements).

## Direction

**Clean low-poly concrete.** The mood is an empty plaza on a late afternoon.
Surfaces are flat-shaded, shadows are soft, and nothing distracts from the
board. Real (CC0) textures add grain up close, never pattern: the silhouettes
stay low-poly and the palette stays the palette. The board is the star. The rider is secondary; for now it is just two
feet and a hint of legs.

What we want the game to feel like:
- **Weighty and honest.** You can feel the board's mass. A pop snaps. Landing
  compresses the trucks.
- **Readable.** From the board alone you can always tell what your feet are
  doing.
- **Calm.** No neon, no particle spam, no screen shake unless you bail.

## Palette

| Token | Hex | Use |
|---|---|---|
| `concrete-100` | `#e9e6df` | ground, main surfaces |
| `concrete-300` | `#c9c4b8` | obstacles, ramps |
| `concrete-600` | `#7d786e` | edges, coping, shadows tint |
| `ink` | `#1c1b19` | griptape, HUD text |
| `sky-zenith` | `#a9c6d8` | sky high up (soft blue) |
| `sky-horizon` | `#ece3d3` | hazy warm horizon, and the fog colour |
| `sun-glow` | `#ffd9a8` | glow around the low sun on the sky dome |
| `deck` | `#c8553d` | deck underside / graphic |
| `wheel` | `#f4efe3` | wheels |
| `metal` | `#9aa0a6` | trucks, rails |
| `front-foot` | `#3d7a3a` | front foot + its HUD pad (green) |
| `back-foot` | `#3b6ea5` | back foot + its HUD pad (blue) |
| `warn` | `#b54836` | bail, detached foot |

The foot colors are **semantic**. Green always means the front foot and blue
always means the back foot, in the 3D scene, in the HUD, and in the debug
overlay. When stance changes, the key clusters swap and the colors stay with
front and back.

## 3D

- Materials are `MeshStandardMaterial` with `flatShading: true`. Keep geometry
  low-poly.
- **Textures (CC0 only):** each level tone has a detail set (color + normal +
  roughness, 1K WebP, `public/textures/`, licences in `LICENSES.md`): smooth
  trowelled concrete on ramps, ledges, stairs and barriers; a rougher broom-finish
  concrete on the ground (one tile per 3 m slab, so the joints hide the repeat);
  brushed steel on rails and coping; a fine granular grip tape on the deck.
  - The colour maps are neutral grey detail maps: the palette token tints them, so a
    textured surface keeps its token (`concrete-300` obstacles still read as
    `concrete-300`). Normal strength ≈ 0.35–0.55: grain you notice up close, not
    from across the plaza.
  - UVs are projected in world space (box/triplanar style), so every obstacle tiles
    at the same real scale: ≈ 3 m per repeat for concrete, 0.6 m for steel.
  - Until textures load (and in tests) surfaces show their flat palette colours.
- **Contact shading:** vertical faces darken slightly (≤ 22 %) in the lowest
  35 cm, a cheap stand-in for ambient occlusion where walls meet the ground.
- Lighting: 1 directional sun, warm (`#ffead4`), low angle, casting shadows,
  plus a hemisphere fill (cool sky `#dfe8ee` over a concrete bounce). PCF soft
  shadows (radius 4 on a 4096 map over ±7 m around the board, so nearby obstacles
  shadow too). Only the board and obstacles cast shadows.
- Sky: a dome from the warm hazy horizon (the fog colour, so the far ground melts
  into it) to a soft blue zenith, with a warm glow around the sun. Fog from 30 m
  to 130 m. Tone mapping: Khronos PBR Neutral with sRGB output (it keeps base
  colours true, which the foot colours and the sponsors' brand colours need;
  ACES filmic is available in `presentation.config.ts` but shifts hues). No
  post-processing.

## Barriers, banners and graffiti

- **Perimeter barriers:** low (0.9 m) chamfered concrete walls in the obstacle
  tones, never grindable. A banner is a thin plate on the park-facing side.
- **Banners** are calm, flat artwork at a 5:1 tile, each sponsor exactly by its
  own brand rules. BipBop Labs: cream `#f7f5f0`, the penguin head mark (the only
  logo; never the body mark), "BipBop Labs_" with "Bop" and the underscore in moss
  `#3d7a3a`, "bipbop.cl". v4rgas: black, the 32 × 32 pixel penguin with crisp
  nearest-neighbour pixels, "v4rgas.com" in Space Mono. Only these real sponsors get
  banners: there are no house banners and no game taglines; every other segment
  is plain concrete (an unknown sponsor id also renders plain). No neon, no motion.
- **The deck's penguin art** (`deck-penguin.jpg`) is the deck decal ONLY: never a
  banner, a graffiti piece or any other surface (enforced by a dependency-cruiser rule).
- **Graffiti:** a couple of pieces per map, never everywhere. Only our own marks
  (the v4rgas pixel penguin and lettering, never the deck art), sprayed: soft overspray halo,
  rough outline, a few drips, speckle. Multiplied into the wall so the concrete
  shows through, a little faded. Palette colours only (moss, blue, deck red, a
  muted gold, ink).
- Proportions follow the real board, with the physics values as the source of
  truth: deck about 0.80 × 0.21 m, wheelbase about 0.36 m, wheels 54 mm.
  Rendering must match the collider shapes exactly, because the player reads
  the physics from the visuals.
- Feet are simple low-poly skate shoes (a cream sole slab, a chamfered upper in the
  foot color, a dark ankle opening), toes toward the toe edge. A detached foot
  turns semi-transparent.
- **Ankle tilt in the air:** sideways stick input (either direction) tilts the shoe
  about its width axis, the way an ankle does. The direction depends on the foot,
  not on which way the stick moves:
  - **Back foot:** always tilts **down**: the toe points down and the heel lifts.
  - **Front foot:** tilts **up**: the toes lift and the heel drops.
  - **Exception: kickflips.** The foot doing a kickflip flick (the guide
    foot swiping toward the heel edge; the back foot on a nollie kickflip)
    points its toes **down** while it flicks, like flicking off the corner
    of the nose, then eases back to its normal tilt. Heelflips keep toes up.
  - The amount follows |stick x|, up to `ankleTiltMaxRad` (≈ 0.45 rad), smoothed
    (`ankleTiltResponseS` ≈ 0.06 s), and goes back to flat as the stick returns.
  - This is visual only and never moves the physics. On the ground, feet
    stay flat on the grip.

## Camera

- The default follow camera is **close**: about 1.1 m behind the board, 0.65 m up,
  and offset about 0.4 m toward the heel side, so the view is three-quarter rather
  than end-on. It looks at a point about 0.45 m ahead of the board, just above the
  deck. The board and the feet fill a good part of the screen. (The first draft had
  2.2 m / 1.2 m; the board read too small.) Values live in
  `presentation.config.ts` → `camera`.
- Its position follows with critical damping. It does **not** copy the board's
  roll or flip rotation. The camera follows the board's direction of travel,
  so a flip reads clearly.
- FOV is 55°. When airborne, zoom out slightly (+5°), and ease back in on
  landing.

## HUD

- A minimal DOM overlay. The font is `Inter`, with `JetBrains Mono` for debug.
- **Foot pads**, bottom-left and bottom-right: two rounded squares, each with a
  dot showing that foot's stick position. The border uses the foot color.
  Holding at the tail shows a ring. A flick leaves a trail. When a foot is
  detached, its pad is dashed in `warn`.
- The pads are laid out to **match the keys**. The WASD foot's pad is always on
  the left and the arrows foot's pad on the right, whichever of them is the
  front foot.
- **Trick popup**, upper center: the trick name in large type, fading in and
  out over about 1.2 s. A bail shows a short "bail" in `warn`.
- No health bars, no minimap, no score until M5.

## Debug overlay (F1)

- Forces are arrows colored by foot. Impulses are thicker and fade after
  200 ms. Contact points are small white spheres. The board axes use
  X = red, Y = green, Z = blue.
- A text panel in the top-left, set in mono, shows: fps, physics ms, board
  speed, air/ground state, the accumulated roll/yaw/pitch, and each foot's
  state.

## Motion and feedback

- Landing: a small camera dip (trucks compressing) and a sound. No shake.
- Bail: a short screen shake (≤150 ms), the board tumbles, then fade and reset
  after 1.5 s.
- A clean catch gets a subtle white flash on the deck edge (80 ms).

## Audio (M5)

Wheel roll loop, pitched by speed. Pop is a sharp wood click. Landing is a
thump plus a truck rattle. Grinds get a metal scrape loop. The mix is
dry and close, like a phone recording in the plaza.
