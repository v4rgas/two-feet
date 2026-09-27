# Skate — Trick Mechanics

This defines how the feet make tricks. It **replaces** the gesture rules in
[`REQUIREMENTS.md` §1.2](REQUIREMENTS.md#12-controls) and ADR 0004 wherever
they conflict.

## Approach: assisted physics

We do what Session and Skater XL do. The board stays a real Rapier rigid body:
collisions, ramps, grinds, landings and bails are all simulated. The feet stop
being free force sources. Instead:

1. **Gesture → intent.** The key sequence is read as an intent: *load*, *pop*,
   *level*, *flick*, *shove*, *catch*.
2. **Intent → targeted impulse.** Each intent computes the impulse or torque
   that reaches a target, for example a pop height or one full flip over the
   remaining airtime, and applies it to the board through the physics port.
3. **Assists.** Catch, levelling and landing are helped by damped spring
   controllers (PD). Each has a strength in config, from 0 (pure physics) to 1
   (full help).

Timing still matters. A late flick has less airtime left, so it under-rotates.
No level makes the board land nose-high. Not catching means the board keeps
spinning. Bad input gives a bad result, but the result is always
**predictable**.

**Hard rules:**
- **No horizontal thrust from the feet.** Trick impulses are angular, plus the
  pop's vertical impulse through the centre of mass. The only things that
  change ground speed are `Space` (push), gravity and collisions.
- **Feet are positions, not forces.** The feet are kinematic points in the
  rider frame. They are always upright and never rotate with the board (see
  REQUIREMENTS §1.3). They are drawn on the deck when attached. They never
  push the board except through the controllers below.
- **Nothing pushes the board through the ground.** A tail press is a
  controller that holds an angle, never a raw force.

## Keys

Sideways keys are defined by board edge, so the mechanic is the same in both
stances. With the follow camera behind the board, screen right is the board's
+Z side. That is the **toe edge in regular** and the **heel edge in goofy**.

| Action | Regular (WASD = front, arrows = back) | Goofy (arrows = front, WASD = back) |
|---|---|---|
| Back foot → tail | `↓` | `S` |
| Front foot → nose | `W` | `↑` |
| Front foot → toe edge ("set") | `D` | `←` |
| Front foot → heel edge (kickflip) | `A` | `→` |
| Back foot → heel side (backside shove) | `←` | `D` |
| Back foot → toe side (frontside shove) | `→` | `A` |
| Push (ground) / catch (air) | `Space` | `Space` |

The rest of this document uses regular-stance keys.

## States and gestures

```
ROLLING ──(↓ held, no set)──────────▶ TAIL PRESS (manual)  ──release──▶ ROLLING (no pop)
   │
   └──(↓ + D held ≥ loadMinS)──▶ LOADED ──release ↓──▶ POP ──▶ AIR ──land──▶ ROLLING / BAIL
                                                          │
                              within windows after pop:   ├─ W        → level (ollie)
                                                          ├─ A / W+A  → kickflip (+level if W)
                                                          └─ ← / →    → shove-it (BS / FS)
```

### Rolling
- Both feet are on the deck.
- `A`/`D` and `←`/`→` pressed toward the **same edge** lean the board, which
  carves.
- `Space` pushes.

### Tail press (manual)
- **Gesture:** hold `↓` without the front foot set.
- **Physics:** a PD controller holds the board at `manualPitchRad`, about 8–10°
  nose up. The tail may touch the ground but never goes into it. The torque is
  capped. There is no pop on release.
- This is also the base for manuals later.

### Load
- **Gesture:** hold `↓` and `D` together for at least `loadMinS` (≈ 0.08 s).
- **Physics:** the board stays on four wheels (no tail press). Carving is off
  while loaded.
- **HUD:** the back pad shows a filled ring and the front pad shows "set".
- Longer loading gives a higher pop, up to `loadMaxS` (≈ 0.35 s). Beyond that,
  holding longer adds nothing.

### Pop
- **Gesture:** release `↓` while loaded. Releasing `D` doesn't matter.
- **Condition:** the board must be on its wheels.
- **Physics:**
  - Target height `h = lerp(popMinHeightM, popMaxHeightM, loadFraction)`. Start
    around 0.18 → 0.40 m.
  - Apply a vertical impulse `m·√(2gh)` through the centre of mass.
  - Apply a nose-up pitch impulse that gives `popPitchRateRadps`, like the tail
    snapping.
  - Emit `BoardPopped`.
- **Windows:** the pop opens a *level window* (`levelWindowS` ≈ 0.35 s), a
  *flick window* (`flickWindowS` ≈ 0.35 s) and a *shove window*
  (`shoveWindowS` ≈ 0.20 s).
- **Without `W`:** the pitch keeps rising and the board lands tail-first or
  nose-high. That's a sloppy ollie. It may bail if the pitch exceeds the
  landing tolerance.

### Level (ollie)
- **Gesture:** press `W` inside the level window.
- **Physics:**
  - A PD controller drives the pitch to 0, with gain `levelAssist`.
  - It adds a small height bonus scaled by timing: the earlier inside the
    window, the bigger the bonus (`levelHeightBonus` ≈ +25%).
- Pressing `W` late levels the board less and gives no bonus.

### Kickflip
- **Gesture:** press `A` or `W`+`A` inside the flick window. `W`+`A` also
  levels.
- **Physics:**
  - Predict the remaining airtime `T` from the vertical velocity and height
    (ballistic).
  - Set the roll rate to reach one full turn in `T·flipCompleteFraction`
    (≈ 0.85, so the flip finishes before landing).
  - Cap it at `maxFlipRateRadps`.
  - Direction: flicking toward the heel edge = kickflip.
- **Timing:** a late flick either makes the cap bind (under-rotation) or lands
  mid-flip, and that's a bail.
- **Later:** heelflip, `W`+`D` after a pop, is reserved for M2 and uses the
  same code with the opposite direction.

### Shove-it
- **Gesture:** press `←` or `→` inside the shove window. The back foot sweeps
  after releasing `↓`.
- **Physics:**
  - Set the yaw rate to reach 180° in `T·shoveCompleteFraction`.
  - `←` (heel side) = backside, `→` (toe side) = frontside.
  - Yaw only, with no sideways push.
- **Combos:** a shove plus a kickflip in the same air is a varial kickflip,
  with no extra code.

### Catch
- **Gesture:** press `Space` in the air. This means "both feet down". On the
  ground, `Space` is still push.
- **Condition:** the board must be roughly pointing up, within the catch cone:
  roll within ±`catchRollRad` of upright, and yaw within ±`catchYawRad` of 0°
  or 180°.
- **Physics:**
  - Both feet attach (they snap onto the deck).
  - A PD controller kills the spin and drives the board toward level, with
    gain `catchAssist`.
  - It also snaps the yaw to the nearest 0°/180°.
- **Outside the cone:** nothing is caught and the feet stay off. The next
  catch attempt is locked out for `catchRetryS` (≈ 0.15 s), so mashing
  `Space` doesn't work. You have to time it.
- **Letting go of the keys does not catch.** That way a flip can finish.
  `autoCatchOnRelease` (default `false`) turns release-to-catch back on as an
  easy mode.
- **No catch:** if the board lands uncaught, it bails unless it is roughly
  level and on its wheels.
- **HUD:** both pads flash when the catch works, and flash `warn` when it
  misses.

### Land
- **Clean:** four wheels down, tilt below `landTiltRad`, and caught. Emits
  `BoardLanded` and `TrickLanded`.
- **Otherwise:** the bail rules in REQUIREMENTS §1.3.
- **Landing assist:** it adds suspension damping and removes small bounce.

## Tunables (`rider.config.ts` → `tricks` block)

These are all first guesses. The dev tuning panel must expose them live.

| Key | Start value |
|---|---|
| `loadMinS` | 0.08 |
| `loadMaxS` | 0.35 |
| `popMinHeightM` / `popMaxHeightM` | 0.18 / 0.40 |
| `popPitchRateRadps` | 6 |
| `manualPitchRad` | 0.16 |
| `levelWindowS` / `flickWindowS` / `shoveWindowS` | 0.35 / 0.35 / 0.20 |
| `levelAssist` | 0.8 |
| `levelHeightBonus` | 0.25 |
| `flipCompleteFraction` | 0.85 |
| `shoveCompleteFraction` | 0.85 |
| `maxFlipRateRadps` | 30 |
| `catchRollRad` / `catchYawRad` | 0.7 / 0.6 |
| `catchAssist` | 0.8 |
| `catchRetryS` | 0.15 |
| `autoCatchOnRelease` | false |
| `landTiltRad` | 0.5 |

## Acceptance scenarios (headless, real Rapier)

1. **Ollie:** `↓`+`D` for 0.2 s, release `↓`, then `W` 0.05 s later, then
   release and press `Space` to catch. Clean landing, height ≥ 0.25 m, forward speed kept within
   10%. Works in both stances with the mirrored keys.
2. **Sloppy ollie:** the same without `W`. It lands nose-high or bails. There
   is no explosion and it never goes through the ground.
3. **Kickflip:** load, pop, `A` 0.05 s later, release, then `Space` once the roll is near 2π. Roll = 2π ± 0.3,
   clean landing.
4. **Late kickflip:** `A` at 0.3 s. It under-rotates or bails, but never
   crashes.
5. **Shove-it:** load, pop, `←` 0.05 s later, release, then `Space` near the end of the air. Yaw = π ± 0.3,
   clean landing. `→` spins the other way.
6. **Varial:** `A` and `←` together. Roll ≈ 2π and yaw ≈ π.
7. **Tail press:** hold `↓` alone for 3 s. Pitch ≈ `manualPitchRad`, the tail
   stays above −2 mm, and releasing does not pop.
8. **No thrust:** from rest and from 3 m/s, every single direction key and
   every pair of them, held for 5 s without `Space`. Horizontal speed never
   exceeds start + 0.3 m/s.
9. **Catch cone:** `Space` pressed mid-flip (board upside down) does not catch. Pressing it again after `catchRetryS` near upright does catch.
10. **Idle:** 10 s with no input. No drift and no bail.
