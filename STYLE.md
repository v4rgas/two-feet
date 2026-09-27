# Skate — Style Guide

How the game looks, feels, and sounds. The code conventions are in
[`REQUIREMENTS.md` §2](REQUIREMENTS.md#2-code-requirements).

## Direction

**Clean low-poly concrete.** The mood is an empty plaza on a late afternoon.
Surfaces are flat-shaded, shadows are soft, and nothing distracts from the
board. The board is the star. The rider is secondary; for now it is just two
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
| `sky-top` | `#f3d9b1` | sky gradient top (warm) |
| `sky-bottom` | `#cfe0e6` | sky gradient horizon (cool) |
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
  low-poly. No textures in M1–M3, except a simple grip tape noise.
- Lighting: 1 directional sun, warm, low angle, casting shadows, plus a
  hemisphere fill. Use PCF soft shadows. Only the board and obstacles cast
  shadows.
- Proportions follow the real board, with the physics values as the source of
  truth: deck about 0.80 × 0.21 m, wheelbase about 0.36 m, wheels 54 mm.
  Rendering must match the collider shapes exactly, because the player reads
  the physics from the visuals.
- Feet are rounded boxes (shoe shaped) in the foot colors. A detached foot
  turns semi-transparent.

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
