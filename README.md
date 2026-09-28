# Two Feet

A physics skateboard game for the browser, played with two feet: each foot has its own keys. No trick
buttons: the feet push the board, the physics reacts, and the game names what the board
did. A game by [v4rgas](https://v4rgas.com).

## Run it

```sh
pnpm install
pnpm dev        # http://localhost:5173
pnpm build      # a static build in dist/ (runs the type check first)
pnpm preview    # serves dist/
```

Checks: `pnpm check && pnpm lint && pnpm test`, plus `pnpm montage:verify` (the montage
clips land) and `pnpm test:human` (lines played with sloppy human timing).

## Play

The first launch opens with a short intro (a hardflip down a two-foot drop, any key skips
it), then a short tutorial on flat ground (push, ollie, kickflip). After that you're on the
Street Course. Later launches open the last map you played; `Esc` → **Intro** replays the
intro.

| Keys (regular stance) | |
|---|---|
| `W A S D` | front foot |
| `↑ ← ↓ →` | back foot |
| `Space` | push on the ground, catch in the air |
| hold `↓` + `S`, let go of `↓`, then `W` | ollie |
| `A` / `D` after the pop | kickflip / heelflip |
| `←` / `→` after the pop | shove-it |
| `Q` / `E` | body spin, steer |
| `R` | restart at your checkpoint, or at the start |
| `C` | set a checkpoint (on four wheels) |
| `Esc` | menu: maps, stance, tutorial, intro, controls |

In goofy the two key clusters swap feet. Change stance in the menu. The menu's
**Controls** page shows every move in your stance.

Dev builds also have `F1` (debug overlay), `F3` (tuning panel), `?map=<id>` to open a
map directly, and `?montage` / `?demo`.

## Add a map

Add a folder `src/maps/<id>/` with a `map.ts` that exports a `MapDefinition` built from the
world context's obstacle kinds. Nothing else: the game finds it at build time and it
shows in the menu. See [`src/maps/README.md`](src/maps/README.md).

## More

- [`GAME.md`](GAME.md): the game shell (intro, tutorial, maps, menu, checkpoints)
- [`MECHANICS.md`](MECHANICS.md): the trick mechanics
- [`REQUIREMENTS.md`](REQUIREMENTS.md): architecture (DDD contexts, layer rules)
- [`STYLE.md`](STYLE.md): look and feel
- [`docs/adr/`](docs/adr): design decisions

## Deploy (Cloudflare Pages)

The game is a static Vite build, hosted on Cloudflare Pages as the project `two-feet`.

1. One time: `pnpm exec wrangler login` (opens a browser to authorise Cloudflare).
2. Deploy to production: `pnpm deploy` (runs the checks, builds `dist/`, uploads it).
3. Deploy a preview URL instead: `pnpm deploy:preview`.

`wrangler.toml` holds the project settings, and `public/_headers` sets the cache headers.
