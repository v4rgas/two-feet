# ADR 0011: The catch is feet, not magic (capped correction, spin settle, ride-in)

- Status: accepted (refines ADR 0005's catch)
- Date: 2026-09-27

## Context

Player feedback: "catches are super odd, literally impossible to bail if you press Space,
and it flicks like crazy". The old catch was a PD (ω 25 rad/s, uncapped) that killed any
spin within a few steps, levelled the board and snapped its yaw to 0/180°, inside a wide
cone (tilt 0.7, yaw 0.6); a caught landing bailed only beyond 50° of tilt.
[MECHANICS.md](../../MECHANICS.md) "Catch" replaces it.

## Decision

### Cone (`catchConeMiss`, pure)

Roll within `catchRollRad` (0.5) of upright, pitch within `catchPitchRad` (0.6), yaw
within `catchYawRad` (0.45) of 0/180° from the rider heading — each measured as a signed
angle against the support normal (atan2, so an upside-down board reads ≈ ±π) — and
|ω| < `catchMaxOmegaRadps` (14). Outside, the feet stay off and Space is locked out
`catchRetryS`. `catchConeMiss` returns which limit failed, with no side effects, so the
assists' catch buffer (Space held until the board enters the cone) can ask it each step.

### Correction (`catchAssist`)

A PD toward level and the nearest stance yaw, critically damped to settle over
`catchSettleS` (0.18 s, ω_n = 5.8 / 0.18), gain `catchAssist`:
- the angular acceleration is capped at `catchMaxAlphaRadps2` (60), and that cap is eased
  in (smoothstep) over the feet's reach `feet.catchReachS` (0.1 s): nothing snaps;
- it may fix at most `catchMaxCorrectionRad` (0.35) of each axis' error when it starts;
  the PD aims at the leftover, which the landing judges;
- the spin is damped **relative to the body**, and the body's own spin acceleration is fed
  forward uncapped: the feet stand in the rider frame, so a body 360 easing out carries the
  caught board with it (that is the body, not a correction).

A caught landing is judged like any other: tilt > `landTiltRad` (0.5) or yaw off the travel
bails (`bail.maxLandingTiltRad` 50° is gone).

### Spin settle and ride-in (the part the spec did not spell out)

With the spec's caps the catch cannot stop a spinning trick: a 60 rad/s² catch needs
ω²/120 rad to stop a spin (16 rad/s → 2.1 rad), and the cone refuses |ω| ≥ 14 anyway, so a
flip held at its rate until the catch could never be landed. Instead the channel does the
slowing, as the trick finishes:
- each flip / shove eases its held rate down near its target, decelerating at
  rate / `spinSettleS` (0.12 s: flip and shove settle together), to `spinCoastRadps` (5) at
  the target, and keeps coasting past it if nobody catches it (so an uncaught flip still
  turns on and lands off);
- flip and shove are started to finish **together** (the later of their finishing
  times, `alignedRate`), so a varial or hardflip settles as one;
- caught before its target, a channel **rides in** under the feet to the target, slowing
  to `catchRideInRadps` (3); then the capped correction takes over. When a shove ends this
  way the body follow re-picks which way round (0/π) the board sits.

The well-timed Space is therefore at the end of the rotation (the scenario helpers and
`findCatchTimeS` press it 0.15 rad short of the target; shoves, always < 14 rad/s, 0.4 rad
short).

## Consequences

- Caught boards bail: a shove caught 0.4 rad past 180° just before touchdown lands off the
  travel (scenario 9a). MECHANICS' own 9a example — a **roll** error of 0.45 rad — cannot be
  made to bail on flat: an under-rotated flip is ridden in to its target, an uncaught flip
  overshoots by ≤ 0.35 rad before touchdown, and 0.45 < `landTiltRad`. The scenario uses the
  yaw case, and a second one checks the ridden-in under-rotated flip lands.
- |ω| ≥ 14 does not catch (upright in the middle of a double flip), and a caught board's
  angular acceleration stays ≤ 60 rad/s² (scenario 9a).
- Catch windows are narrow on combos: the G4 hardflip out of the hubba has ≈ 0.06 s. A catch
  buffer (assists) that fires on cone entry would catch combos near |ω| = 14, early.
- Landings keep the catch's small yaw leftover, which the wheels turn into a slight change
  of travel (≈ 0.1 rad for a shove caught at the end).
- The G3 slide scenarios catch 0.05 s later (after the body quarter turn eases out).
