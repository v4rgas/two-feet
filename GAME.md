# Skate — Game Shell

This file covers how the game works as a game: first launch, tutorial, maps,
menu, restart and checkpoints. The trick rules are in
[`MECHANICS.md`](MECHANICS.md) and the look is in [`STYLE.md`](STYLE.md).

## First launch
1. **No tutorial done yet** (the localStorage key `skate.tutorialDone` isn't
   set): the game opens straight into the **tutorial** on the flat map.
2. **Tutorial done:** the game opens on the **Street Course**, or on the last
   map played (`skate.lastMap`).
3. Storage reads and writes are wrapped in try/catch. With no storage, the
   player gets the tutorial on every launch, and that's fine.

## Tutorial (on the flat map)
These are short steps. Each one shows a prompt card at the top centre (a title
plus key-cap visuals, per STYLE.md) and moves on when the step is actually
done in the physics, not after a timer.

| # | Prompt | Done when |
|---|---|---|
| 1 | **Push**: tap `Space` a few times | board speed ≥ 3 m/s |
| 2 | **Ollie**: hold `↓` + `S`, let go of `↓`, then `W` to level. `Space` in the air to catch | a `TrickLanded` named "Ollie" |
| 3 | **Kickflip**: push, pop, tap `A` while in the air, then `Space` to catch | a `TrickLanded` named "Kickflip" |
| — | "Nice. Welcome to the Street Course." (about 2 s) | the game loads the Street Course, and `skate.tutorialDone` = true |

- The keys in the prompts follow the current stance. In goofy, the pads and
  keys mirror, so the card shows `S` + `↓` and so on.
- A bail during a step just resets to the tutorial spawn. The step doesn't
  reset.
- The step's prompt stays visible until it's done. After the step's first
  failed attempt (a bail or a wrong trick), a small hint line appears, e.g.
  "Let go of ↓ to pop — keep holding S".
- **Skipping:** `Esc` → menu → "Skip tutorial" goes straight to the Street
  Course and marks the tutorial done. "Tutorial" in the menu replays it at
  any time.

## Maps
- **Maps are data in their own folder:** `src/maps/<map-id>/`, one folder per
  map.
  - `map.ts` exports a `MapDefinition`: `id`, `name`, a one-line
    `description`, `createLevel(): Level` (built from the world context's
    obstacle kinds), the spawn, and an optional `tutorial` flag.
  - Maps are found automatically with `import.meta.glob("../maps/*/map.ts",
    { eager: true })` in `src/game`, so adding a map means adding a folder
    and nothing else.
  - A map's parameters (positions, sizes) live in its own folder, not in
    `world.config.ts`.
- **Shipped maps:**
  - `street`: the Street Course, the default.
  - `flat`: flat ground, also used by the tutorial.
  - `el-toro`: El Toro, the 20-stair with a handrail. A big-drop challenge map.
- **The old park is removed.** That's `skatepark.ts`, `?level=park`, and its
  config. Its tests and montage clips are ported to the Street Course, which
  has a hubba stair set, rails, ledges, banks and quarter pipes. The
  obstacle *kinds* stay in the world domain, because maps are built from
  them.
- `?level=<id>` / `?map=<id>` still pick a map directly, for dev and links.

## Controls outside tricks
| Key | Action |
|---|---|
| `R` | **Restart** at the checkpoint if one is set, otherwise at the map spawn |
| `C` | **Set checkpoint** at the current board position, heading and velocity. Only allowed while grounded on 4 wheels and not bailed. A short, subtle "checkpoint" toast fades after about 0.8 s. A second `C` overwrites it |
| `Esc` | Open or close the **menu**. The game pauses while it's open |
| `F1` | Debug overlay (dev) |
| `F3` | **Tuning panel** (lil-gui, dev builds only). Hidden by default, toggled with `F3` |

- Auto-reset after a bail also goes to the checkpoint, or to the spawn if no
  checkpoint is set.
- Changing map clears the checkpoint.
- Restarting keeps the board's saved velocity from the checkpoint, so a line
  can be re-tried with the same speed. A checkpoint set at a standstill
  restarts at a standstill.
- The rider comes back upright with both feet on the deck and all per-air
  state cleared.

## Menu (`Esc`)
A centred card over a dimmed, paused game, keyboard-navigable (arrow keys and
`Enter`, plus the mouse), styled per STYLE.md:
- **Resume**
- **Maps:** a list of every registered map (name and description). Picking
  one loads it.
- **Restart** (same as `R`) and **Clear checkpoint**
- **Stance:** regular / goofy (saved, as now)
- **Tutorial:** replay it, or "Skip tutorial" while it's running
- **Controls:** a compact key reference covering push, ollie, flips,
  shoves, spin and steer, grinds, catch, R, C and Esc, drawn with key caps
  in the current stance.

While the menu is open the simulation doesn't step, and game keys don't
reach the input.

## HUD while playing
Only the foot pads, the trick popup, the grind balance bar and the brief
checkpoint toast. There is no other persistent text. Tutorial prompt cards
appear only in the tutorial.

## Acceptance
- **First launch with empty storage lands in the tutorial.** Completing it
  with scripted real key events (tutorial scenario) lands on the Street
  Course with `tutorialDone` set. The next launch goes straight to the
  street.
- **Each tutorial step advances only on the real event.** A scenario
  covers bail-and-retry, and the hint line appears after a failure.
- **`C` then `R`:**
  - The board comes back at the checkpoint pose and velocity within 1 mm,
    feet on, no bail.
  - `C` in the air or while bailed does nothing.
  - A bail auto-resets to the checkpoint.
  - A map change clears it.
- **`Esc` pauses and resumes exactly:** the simulation tick doesn't advance,
  and no keys leak through.
- **Map switching and the map list:**
  - Switching maps from the menu works both ways (street ↔ flat) with no
    leaks: the physics world is rebuilt, and the old meshes and bodies are
    disposed.
  - Adding a dummy map folder in a test registers it in the menu list.
- **Porting from the park:** every former park scenario, G1–G7 (including
  the G4 line), the montage clips and `pnpm test:human` run on the Street
  Course. Floors are re-measured there.
- **The tuning panel** is hidden on load and toggles with `F3`.
- **Builds and checks:**
  - `pnpm build` produces a working static build, and `pnpm preview` plays
    it: tutorial, street, menu, R, C.
  - The dev-only pieces (tuning panel, `?demo`, `?montage`) are not in the
    production bundle.
