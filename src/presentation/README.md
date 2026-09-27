# presentation

Three.js renderer, HUD, debug overlay and cinematic camera. Reads `RenderFrame`s only;
it never mutates domain state. The look is in [`STYLE.md`](../../STYLE.md).

## Level surfaces (`scene/`, `textures/`)

- `level-mesh.ts` builds the level from the world's `obstacleGeometry` (the collider
  pieces): one merged world-space mesh per tone (`body`, `edge`, `metal`), one per banner
  sponsor, one per graffiti piece, plus the ground slabs. Built once per level.
- UVs come from `world-uv.ts`: a box (triplanar-style) projection in **world** space, per
  flat triangle, so every obstacle kind tiles at the same real scale
  (`surfaces.<tone>.metresPerRepeat`) with no per-kind UV code.
- `LevelAssets` (surface materials, banner and graffiti materials) are created once by
  `ThreeRenderer` and shared by every level. `TextureLibrary` loads each CC0 texture set
  (`public/textures/<set>/`, see its `LICENSES.md`) once, with mipmaps and anisotropy.
  Materials show their flat palette colour until the textures arrive, and in Node/tests.
- Contact shading: the concrete materials darken vertical faces in the lowest
  `contactShadeHeightM` (a per-pixel stand-in for AO where walls meet the ground).

## Sponsor banners (`sponsors/`)

- `sponsor-registry.ts`: id → name, url, background, files. Only the real sponsors:
  `bipbop` (BipBop Labs, composed from their own head mark, wordmark and pre-outlined
  "bipbop.cl", on their cream with the moss glows) and `v4rgas` (black,
  nearest-neighbour pixel penguin, Space Mono). No house banners: `sponsorById` returns
  undefined for an unknown id and `level-mesh.ts` draws that barrier plain (its banner
  plate in concrete, no banner mesh).
- `banner-art.ts` paints each banner tile (2560 × 512, 5:1) on a canvas at load;
  `banner-materials.ts` caches one material per banner. A banner face gets a whole number
  of tiles along its length (`bannerFaceUvs`).
- Adding a sponsor: copy only their files into `public/sponsors/<id>/`, add a registry
  entry and a painter that follows their brand rules, and list the files in
  `public/textures/LICENSES.md`. Never invent a real brand.

## Graffiti (`graffiti/`)

- `graffiti-registry.ts`: pieces made only from our own marks (the v4rgas pixel penguin,
  lettering), each with a fixed seed. BipBop's marks are never stylised, and the deck's
  penguin art is the board's decal only (`deck-art-only-on-the-board` in
  `.dependency-cruiser.cjs`: only `scene/board-mesh.ts` may import it).
- `graffiti-art.ts` sprays each piece on a canvas: overspray halo, rough outline, drips,
  speckle, all from the seed (deterministic).
- `graffiti-decals.ts`: every placement of a piece becomes a quad just off its wall, merged
  per piece, drawn unlit with multiply blending (the concrete and its shadows show
  through), no depth write, polygon offset. No collider, no per-frame cost.
- Maps place pieces through the world context (`Level.graffiti`, `graffitiOnFace`); see
  the world README.
