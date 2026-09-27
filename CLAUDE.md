# Skate

A physics-based browser skate game where each foot is controlled separately.

**Read before changing anything:**
- [`REQUIREMENTS.md`](REQUIREMENTS.md) covers the game rules, the DDD bounded
  contexts, the layer rules, the loop order, and the conventions.
- [`MECHANICS.md`](MECHANICS.md) is the trick mechanics spec (assisted physics). It overrides
  REQUIREMENTS §1.2 and ADR 0004 where they conflict.
- [`GAME.md`](GAME.md) covers the game shell: tutorial, maps (`src/maps/<id>/`), the menu, and
  restart/checkpoint.
- [`STYLE.md`](STYLE.md) covers visuals, the HUD, the camera, and the palette.

Rules that matter most:
- Never animate the board. Tricks are targeted impulses plus PD assists applied through
  the `PhysicsWorld` port (MECHANICS.md). Feet never add horizontal thrust.
- `domain/` must never import `three`, `@dimforge/*`, or the DOM.
- Contexts talk to each other through domain events and each context's
  `index.ts`.
- Constants go in `<ctx>.config.ts`, never inline.
- Before calling work done, run `pnpm check && pnpm lint && pnpm test`.
