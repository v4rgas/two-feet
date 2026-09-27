# Third-party assets

Every file here is CC0 (public domain) or SIL OFL 1.1. Nothing else may be added.

## Textures (`public/textures/`), CC0 1.0

All from [ambientCG](https://ambientcg.com) by Lennart Demes, released under
[CC0 1.0 Universal](https://docs.ambientcg.com/license/) (no attribution required; credited
anyway). Downloaded on 2026-09-27 as the `1K-JPG` packages.

| Folder | Source asset | Used for |
|---|---|---|
| `concrete-smooth/` | [Concrete016](https://ambientcg.com/view?id=Concrete016) | ramps, banks, ledges, stairs, barriers (the `body` and `edge` tones) |
| `concrete-ground/` | [Concrete047A](https://ambientcg.com/view?id=Concrete047A) | the plaza ground (one tile per 3 m slab) |
| `metal-brushed/` | [Metal009](https://ambientcg.com/view?id=Metal009) | rails, handrails, coping, posts (the `metal` tone) |
| `grip/` | [Asphalt031](https://ambientcg.com/view?id=Asphalt031) | the board's grip tape (a fine granular surface at 12 cm per tile) |

How they were processed (kept small, calm and tintable):

- Only three maps per set: `color`, `normal` (the OpenGL `NormalGL` map) and `roughness`.
  No displacement, AO or metalness.
- `color` is converted to neutral grey and re-levelled to a mean of 0.9 with reduced
  contrast (a "detail map"): the palette colour of the tone tints it in the material.
- `roughness` is re-levelled to a mean of 0.9 (the material's roughness is the target).
- Encoded as WebP (quality 80–82), 1024 px (grip 512 px). Total ≈ 1.05 MB.

## Fonts (`public/fonts/`), SIL Open Font License 1.1

Subset to Basic Latin (U+0020–007E) as WOFF2; the licence text sits next to each file.
Downloaded on 2026-09-27 from [google/fonts](https://github.com/google/fonts).

| File | Font | Copyright | Used for |
|---|---|---|---|
| `SpaceMono-Bold.latin.woff2` | Space Mono Bold | 2016 The Space Mono Project Authors | "v4rgas.com" on the v4rgas banner (the v4rgas.com site font) |
| `BagelFatOne-Regular.latin.woff2` | Bagel Fat One | 2022 The Bagel Fat Project Authors | the bubble letters of the generated graffiti (throw-up, wildstyle floor piece) |
| `SedgwickAve-Regular.latin.woff2` | Sedgwick Ave | 2017 The Sedgwick Ave Project Authors | the handstyle tags of the generated graffiti (tags and scribbles) |

## Sponsor brand assets (`public/sponsors/`), not open licensed

These are the sponsors' own marks, used with their owner's permission for their banners
only. They are NOT CC0/OFL: do not reuse them for anything else.

- `sponsors/bipbop/`: BipBop Labs (https://bipbop.cl). `head.svg` (the penguin head mark,
  copied from the brand source; `width`/`height` attributes added so it draws on a canvas),
  `wordmark.png` (generated "BipBop Labs_" wordmark) and `url.svg` (the pre-outlined
  "bipbop.cl" lettering taken from the brand's URL lockup sticker).
- `sponsors/v4rgas/`: v4rgas (https://v4rgas.com). `penguin.png`, the 32 × 32 pixel
  penguin (always drawn with nearest-neighbour filtering).
