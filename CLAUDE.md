# Skate

A physics-based browser skate game where each foot is controlled separately.

**Read before changing anything:**
- [`REQUIREMENTS.md`](REQUIREMENTS.md) covers the game rules, the DDD bounded
  contexts, the layer rules, the loop order, and the conventions.
- [`STYLE.md`](STYLE.md) covers visuals, the HUD, the camera, and the palette.

Rules that matter most:
- Tricks are **emergent**. Never animate the board. Apply forces through the
  `PhysicsWorld` port.
- `domain/` must never import `three`, `@dimforge/*`, or the DOM.
- Contexts talk to each other through domain events and each context's
  `index.ts`.
- Constants go in `<ctx>.config.ts`, never inline.
- Before calling work done, run `pnpm check && pnpm lint && pnpm test`.
