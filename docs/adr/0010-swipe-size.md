# ADR 0010: Trick size from swipe travel, slower spin rates

- Status: accepted (replaces the "doubles by hold" rule of ADR 0005)
- Date: 2026-09-27

## Context

Player feedback: "it spins too fast when I flick. Double kickflips should be done by
starting with the foot pressing D then pressing A, so how strong the flick is corresponds
to how big the travel is. Same for shove-it and 360 shove-it."

Before, a flick or sweep key held for `doubleFlickHoldS` / `shove360HoldS` (0.12 s)
upgraded the trick to a double / 360, and the rates were capped at 60 / 30 rad/s, so a
kickflip snapped round in about 0.1 s. [MECHANICS.md](../../MECHANICS.md) "Swipe size"
replaces both.

## Decision

### Swipe detection (`SwipeTracker`, rider domain)

- The sticks are spring-smoothed keys (input context), so a swipe is a **stick
  trajectory**. Each foot's sideways value `x` (stance resolved: −1 heel edge, +1 toe
  edge) is recorded every step, on the ground, on an edge and in the air, for
  `swipeLookbackS` (0.3 s).
- A swipe **ends** on the step `x` enters the far side (|x| ≥ `swipeEndMin`). It
  **starts** at the opposite extreme within the lookback, which may be before the pop.
  Travel = |x_end − x_start|. Travel ≥ `swipeMinTravel` is one unit, ≥
  `swipeDoubleTravel` two. The direction is the side it ends on.
- Letting go of a key never enters the far side, and a position held there does not
  enter it again, so neither is a swipe. That is what makes pre-positioning work:
  `S` + `D` held through the load and the pop does nothing until `A` swipes across.
- The controller keeps each foot's last swipe with its end time. The flip (guide foot)
  and the shove (pop foot) start from a swipe that ended **at or after this air's pop**
  and within the flick / shove window. The board can still touch the ground for a
  step or two after the pop, so the swipe is consumed on the first air step rather
  than only on the step it ends. It works the same for a pop out of a grind and for a
  nollie (the roles swap).
- The size is known when the trick starts, so the channel's rate is set once. The
  upgrade logic (`trackChannels`, `upgrade`, the key-hold bookkeeping) is gone.

### Thresholds (tuned from the spec's first guesses)

| Key | Spec | Used | Why |
|---|---|---|---|
| `swipeLookbackS` | 0.3 | 0.3 | |
| `swipeEndMin` | 0.8 | **0.6** | With the input spring (ω 28, ζ 0.9) a key tapped for 0.05 / 0.08 s peaks at 0.60 / 0.75, so at 0.8 a normal quick tap never flipped. A tap now needs ≥ ≈ 0.05 s. |
| `swipeMinTravel` | 0.7 | **0.55** | From the middle the travel is ≈ `swipeEndMin`, so it has to be below it. |
| `swipeDoubleTravel` | 1.6 | **1.45** | Edge to edge is ≈ 1.6; 1.45 needs a start at x ≤ −0.85, i.e. a key really held on the opposite edge. A brief opposite tap (≈ −0.6) stays single. |

From the opposite edge the stick reaches −0.6 about 0.1 s after the key goes down
(0.07 s from the middle), so the second key of a double must be held about that long;
a 0.08 s tap from the far edge peaks at −0.48 and does nothing. Releasing a held key
overshoots 0 by < 0.002, never near the far side.

### Spin rates

- rate = units · 2π / (T_remaining · `flipCompleteFraction`), with
  `flipCompleteFraction` 0.92, capped at units × `maxFlipRatePerTurnRadps` (16).
- Shoves: halfTurns · π / (T · `shoveCompleteFraction` 0.85), capped at halfTurns ×
  `maxShoveRatePerHalfTurnRadps` (9). The scoop lasts `scoopDurationFraction` of the
  whole spin.
- The first trick of an air still sets the shared end time, so a varial / tre flip
  finishes both channels together.

Measured on flat (swipe 0.05 s after the pop, with the level):

| Load | Air | Single kickflip turning | Double kickflip |
|---|---|---|---|
| half (0.2 s) | 0.52 s | 0.39 s, lands | at the 32 rad/s cap it is ≈ 6% short and bails; 17/turn would land it |
| full (0.3 s) | 0.62 s | 0.39 s, lands | 0.42 s, lands |
| full (0.35 s) | 0.66 s | 0.43 s, lands | 0.45 s, lands |

A full-pop double completes at the specified caps, so **the caps are not raised**. A
double needs a full load; the matrix plays doubles with a full load (`FULL_POP_S`).

## Consequences

- A flip now visibly turns (≈ 0.4 s instead of ≈ 0.1 s). Timing matters more: a flick
  on a sloppy half-load pop without the level has too little air left (the varial
  scenario now levels), and a late swipe under-rotates.
- The swipe adds latency: the trick starts when the stick reaches the far side
  (≈ 0.07 s after a tap, ≈ 0.1 s edge to edge) instead of at the 0.5 key threshold.
  The 0.2 s shove window still fits a 360 swipe started ≈ 0.05 s after the pop.
- A 360 shove out of the G4 hubba tailslide is read as a 360 but comes down ≈ 0.4 rad
  short: the pop-out air is short and the body's own turn back to the travel happens
  during the spin. A 180 out (the hardflip) lands.
- Scenarios: `swipes.scenario.test.ts` (released keys and held positions are no swipes,
  tap = single, edge to edge = double / 360, carving off while loaded, both stances and
  kicks), the 100-case matrix with edge-to-edge doubles and 360s, the G4 swipe out, and
  `swipe-tracker.test.ts`.
