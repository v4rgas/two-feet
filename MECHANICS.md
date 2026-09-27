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
   └──(↓ + D, release D)──▶ ARMED ──release ↓──▶ POP ──▶ AIR ──land──▶ ROLLING / BAIL
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
- **Gesture:** hold `↓` with **no WASD key pressed**, and not armed (see
  below).
- **Physics:** a PD controller holds the board at `manualPitchRad`, about 8–10°
  nose up. The tail may touch the ground but never goes into it. The torque is
  capped. There is no pop on release.
- This is also the base for manuals later.

### Load and arm (the ollie set-up)
- **Gesture, in order:**
  1. hold `↓`
  2. press `D`
  3. release `D`
  4. release `↓`

  Step 4 is the pop.
- **Loading:** while `↓` + `D` are held together, the board stays on four
  wheels (no tail press) and carving is off. The pop height grows with how
  long they were held together: `loadFraction` goes from 0 at `loadMinS`
  (≈ 0.05 s) to 1 at `loadMaxS` (≈ 0.30 s).
- **Arming:** releasing `D` while still holding `↓` **arms** the pop.
  - The arm lasts `armWindowS` (≈ 0.40 s).
  - While armed, the board stays on its wheels even though only `↓` is held.
    It is *not* a manual.
  - If `↓` is still held when the arm expires, the board turns into a normal
    tail press and no pop happens.
- **Forgiving order:** releasing `↓` while `D` is still held also pops. That
  way slightly wrong finger order never feels broken.
- **HUD:** the back pad shows a filled ring while loaded or armed. The front
  pad shows "set".

### Pop
- **Gesture:** release `↓` while armed (or while loaded).
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
  - **Scoop:** the pop foot scoops the kick down and around, so the board spins
    tilted, not flat. The kick being scooped (the tail on an ollie) dips below
    the spin plane, the other end rises, and the board leans slightly toward
    the scoop side.
    - Apply this as extra pitch and roll impulses at shove time, in the
      board's frame.
    - It should peak at about `shoveScoopPitchRad` (≈ 0.3 rad) and
      `shoveScoopRollRad` (≈ 0.12 rad) mid-spin.
    - The level assist (and later the catch) brings the board back flat, so it
      is level again by the time it can be caught.
  - There is no sideways push: the impulses are angular only.
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

## Nollie: the same mechanic, mirrored

Everything above also works from the nose, with the two feet swapping jobs.
The mechanic is written in terms of two roles:

- **Pop foot:** the foot on the kick that pops. It loads, pops, and does the
  shove-it.
- **Guide foot:** the other foot. It sets, levels, and flicks.

| | Ollie (from the tail) | Nollie (from the nose) |
|---|---|---|
| Pop foot | back foot on the tail | front foot on the nose |
| Guide foot | front foot | back foot |
| Set-up | hold `↓`, tap `D` | hold `W`, tap `→` (back foot set toward the toe edge) |
| Pop | release `↓` | release `W` |
| Level | `W` (guide foot → nose) | `↓` (guide foot → tail) |
| Kickflip | `A` / `W`+`A` | `←` / `↓`+`←` (guide foot → heel edge) |
| Shove-it (BS / FS) | `←` / `→` | `A` / `D` (pop foot sweeps) |
| Press (manual) | hold `↓` alone, no WASD: tail press | hold `W` alone, no arrows: nose press |

(Regular-stance keys; goofy mirrors them the same way as in the key table.)

**Physics:** identical, with nose and tail swapped. The pitch impulse is
nose-down (the tail rises), levelling drives the pitch to 0 from the other
side, and the manual controller holds `−manualPitchRad`. The flip direction is
defined by the edge the guide foot flicks off. The trick is recognised as
"nollie kickflip" and similar (the M2 recognizer reads which kick popped from
`BoardPopped`, which carries the `foot` and a new `kick: "tail" | "nose"`).

**Conflicts:** only one foot can be the pop foot at a time. If both kicks are
loaded, the one loaded first wins. The other foot's input is then read as the
guide foot.

## Tunables (`rider.config.ts` → `tricks` block)

These are all first guesses. The dev tuning panel must expose them live.

| Key | Start value |
|---|---|
| `loadMinS` | 0.05 |
| `armWindowS` | 0.40 |
| `loadMaxS` | 0.30 |
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
| `shoveScoopPitchRad` / `shoveScoopRollRad` | 0.3 / 0.12 |
| `autoCatchOnRelease` | false |
| `landTiltRad` | 0.5 |

## Acceptance scenarios (headless, real Rapier)

1. **Ollie:** hold `↓`, press `D`, 0.15 s later release `D`, 0.05 s later release `↓`, then `W` 0.05 s later, then
   release and press `Space` to catch. Clean landing, height ≥ 0.25 m, forward speed kept within
   10%. Works in both stances with the mirrored keys.
2. **Sloppy ollie:** the same without `W`. It lands nose-high or bails. There
   is no explosion and it never goes through the ground.
3. **Kickflip:** load, pop, `A` 0.05 s later, release, then `Space` once the roll is near 2π. Roll = 2π ± 0.3,
   clean landing.
4. **Late kickflip:** `A` at 0.3 s. It under-rotates or bails, but never
   crashes.
5. **Shove-it scoop:** mid-spin |pitch| ≥ 0.2 rad, with the scooped kick lower; it's back within ±0.1 rad of level before the catch.
5b. **Shove-it:** load, pop, `←` 0.05 s later, release, then `Space` near the end of the air. Yaw = π ± 0.3,
   clean landing. `→` spins the other way.
6. **Varial:** `A` and `←` together. Roll ≈ 2π and yaw ≈ π.
7. **Tail press:** hold `↓` alone for 3 s. Pitch ≈ `manualPitchRad`, the tail
   stays above −2 mm, and releasing does not pop.
8. **No thrust:** from rest and from 3 m/s, every single direction key and
   every pair of them, held for 5 s without `Space`. Horizontal speed never
   exceeds start + 0.3 m/s.
9. **Catch cone:** `Space` pressed mid-flip (board upside down) does not catch. Pressing it again after `catchRetryS` near upright does catch.
10. **Nollie:** scenarios 1, 3 and 5 mirrored from the nose (`W`+`→`, release `W`, `↓` / `←` / `A`, `Space`) give the same results, with pitch mirrored.
11. **Nose press:** hold `W` alone for 3 s. Pitch ≈ −`manualPitchRad`, the nose stays above −2 mm, and releasing does not pop.
12. **Idle:** 10 s with no input. No drift and no bail.
