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
| Front foot → back toward the tail ("set") | `S` | `↓` |
| Front foot → heel edge (kickflip) | `A` | `→` |
| Front foot → toe edge (heelflip) | `D` | `←` |
| Back foot → heel side (backside shove) | `←` | `D` |
| Back foot → toe side (frontside shove) | `→` | `A` |
| Push (ground) / catch (air) | `Space` | `Space` |
| Body spin left / right (wind-up on the ground, spin in the air) | `Q` / `E` | `Q` / `E` |

The rest of this document uses regular-stance keys.

## States and gestures

```
ROLLING ──(↓ held, no set)──────────▶ TAIL PRESS (manual)  ──release──▶ ROLLING (no pop)
   │
   └──(↓ + S held ≥ loadMinS)──▶ LOADED ──release ↓──▶ POP ──▶ AIR ──land──▶ ROLLING / BAIL
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
- **Gesture:** hold `↓` with **no WASD key pressed**.
- **Physics:** a PD controller holds the board at `manualPitchRad`, about 8–10°
  nose up. The tail may touch the ground but never goes into it. The torque is
  capped. There is no pop on release.
- This is also the base for manuals later.

### Load
- **Gesture:** hold `↓` and `S` together (both feet toward the tail, like
  crouching for the pop) for at least `loadMinS` (≈ 0.08 s). In goofy it is `S`
  + `↓`.
- **Physics:** the board stays on four wheels (no tail press). Carving is off
  while loaded.
- **HUD:** the back pad shows a filled ring and the front pad shows "set".
- Longer loading gives a higher pop, up to `loadMaxS` (≈ 0.35 s). Beyond that,
  holding longer adds nothing.

### Pop
- **Gesture:** release `↓` while loaded, with `S` still held. Releasing both at
  the same time also pops. Releasing `S` first must **not** be required.
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
- **Heelflip:** the same code with the opposite direction. Press `D` or `W`+`D`
  inside the flick window, flicking toward the toe edge. The roll direction is
  the opposite of a kickflip.

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

## Body spin (`Q` / `E`): 180s, 360s, lining up

`Q` turns the rider's body to the left (counter-clockwise seen from above) and `E`
turns it to the right. This is for body varials (180, 360) and for turning the
board to line up with a rail or ledge, which grinds (M4) will use. The keys
are the same in both stances. Frontside or backside is only a naming question
for the recognizer, based on stance.

- **Wind-up (on the ground):**
  - Holding `Q`/`E` while loaded winds up the shoulders. This is visual:
    the torso turns up to `windUpMaxRad` (≈ 0.6 rad).
  - At the pop, the stored wind-up becomes an initial spin rate,
    `windUpSpinRadps × windUpFraction`.
  - Otherwise `Q`/`E` do nothing on the ground. Carving stays on the foot keys.
- **Spin (in the air):**
  - Holding `Q`/`E` speeds the rider's heading up toward
    `±bodySpinRateRadps` (≈ 9 rad/s, a 360 in about 0.7 s with the wind-up),
    with ease-in and ease-out (`bodySpinAccelRadps2`).
  - Releasing the key eases the spin back to 0, so you can stop at any angle.
  - The rider heading is **no longer frozen in the air** while `Q`/`E` are
    held. It only changes by this body spin, never by board yaw.
- **The board follows the body only through the feet:**
  - While at least one foot is attached, a yaw PD pulls the board's yaw toward
    the rider heading (plus any shove offset). The whole setup turns together.
  - With both feet off, for example during a flip, the board keeps its own yaw
    and the body spins alone. That is how a body varial can end with the board
    not lined up.
  - The catch snaps the board's yaw to the nearest 0° or 180° of the **rider**
    heading, not of the old travel direction.
- **Landing:**
  - The direction of travel doesn't change. What matters is how the board
    lines up with it.
  - Board yaw within ±`landYawToleranceRad` (≈ 0.35 rad) of the direction of
    travel: rolls forward.
  - Within that tolerance of 180°: rolls **fakie** (backwards). The rider
    heading keeps the body angle it spun to, so after a 180 the rider now rides
    fakie or switch.
  - Otherwise the board is too sideways to roll: that's a bail. It becomes a
    powerslide later.
  - While a grindable obstacle is under the board, this check is skipped. That
    is the M4 hook for a boardslide: line up about 90° with `Q`/`E`, land on
    the rail.
- **No thrust:** the body spin only changes yaw. It never adds horizontal
  momentum.

## Nollie: the same mechanic, mirrored

Everything above also works from the nose, with the two feet swapping jobs.
The mechanic is written in terms of two roles:

- **Pop foot:** the foot on the kick that pops. It loads, pops, and does the
  shove-it.
- **Guide foot:** the other foot. It sets (slides toward the popping kick),
  levels (slides toward the other end), and flicks.

| | Ollie (from the tail) | Nollie (from the nose) |
|---|---|---|
| Pop foot | back foot on the tail | front foot on the nose |
| Guide foot | front foot | back foot |
| Load | `↓` + `S` | `W` + `↑` (back foot set toward the nose) |
| Pop | release `↓` | release `W` |
| Level | `W` (guide foot → nose) | `↓` (guide foot → tail) |
| Kickflip | `A` / `W`+`A` | `←` / `↓`+`←` (guide foot → heel edge) |
| Heelflip | `D` / `W`+`D` | `→` / `↓`+`→` (guide foot → toe edge) |
| Shove-it (BS / FS) | `←` / `→` | `D` / `A` (pop foot sweeps; BS/FS always named by where the **tail** goes, so the heel-side sweep from the nose is FS) |
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

## Trick matrix: every combination works from both kicks

Every trick is a combination of four independent inputs from one pop. **Nothing
is special-cased.** The trick controller treats them as separate channels on
the same board, and the recognizer (tricks context) names the result.

| Channel | Input (regular, tail pop; nose pop uses the mirrored roles) | Options |
|---|---|---|
| **Kick** | which end popped | tail (ollie family), nose (nollie family) |
| **Flip** (guide foot, flick window) | heel-edge flick / toe-edge flick | none, kickflip, heelflip. **Double**: the flick key held ≥ `doubleFlickHoldS` (≈ 0.12 s) targets 2 turns (4π) instead of 1. |
| **Shove** (pop foot, shove window) | BS / FS sweep | none, 180 shove. **360 shove**: the sweep key held ≥ `shove360HoldS` (≈ 0.12 s) targets 2π instead of π. |
| **Body** (`Q` / `E`) | spin left / right | none, or any angle (180, 360, …) |

Riding direction (forward / fakie) and stance (regular / switch) aren't
inputs. They are the **state at the pop**, and the recognizer uses them as
prefixes.

### Nollie keys (regular)
The nose-pop version of every row, with pop foot = front and guide foot =
back:
- load `W` + `↑`, pop by releasing `W`
- kickflip `←` or `↓`+`←`
- heelflip `→` or `↓`+`→`
- shove BS / FS: `D` / `A`, swept by the front foot. It is named by the tail's direction:
  a heel-side sweep of the nose sends the tail frontside.
- `Q`/`E` body spin

### Names the recognizer must produce (M2, and for testing now)
- **Flip × shove:**

  | | no shove | BS shove | FS shove | BS 360 | FS 360 |
  |---|---|---|---|---|---|
  | no flip | Ollie | BS Pop Shove-it | FS Pop Shove-it | 360 Shove-it | FS 360 Shove-it |
  | kickflip | Kickflip | Varial Kickflip | Hardflip | 360 Flip (Tre Flip) | — |
  | heelflip | Heelflip | Inward Heelflip | Varial Heelflip | — | Laser Flip |
  | double kick / heel | Double Kickflip / Double Heelflip | — | — | — | — |

  A cell marked "—" gets a generic name (`<flip> + <shove>`), which is fine.
- **Prefixes:**
  - "Nollie" for nose pops.
  - "Fakie" when rolling backwards in the same stance, "Switch" when riding in
    the other stance.
  - "BS 180" / "FS 180" / "360" for body spins, from the body yaw and the
    stance (BS = the back faces forward first).
  - Example: "Nollie FS 180 Heelflip".
- **Shove direction naming:** BS / FS follow the tail's direction relative to
  the rider, and they mirror correctly for nollie and for goofy.

### Acceptance (the "matrix" scenario family)
- One parametrised headless scenario runs **every row × column of the table**,
  in **both kicks** (tail and nose) and **both stances**.
- Each case: pop, the inputs 0.05 s after the pop, then `Space` near the end.
- Each case asserts:
  - roll ≈ target (0, 2π, 4π, signed)
  - yaw ≈ target (0, ±π, ±2π)
  - a clean landing
  - no thrust (speed ≤ start + 0.3 m/s)
- The expected recognizer name is asserted too, once the recognizer exists.

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
| `doubleFlickHoldS` / `shove360HoldS` | 0.12 / 0.12 |
| `bodySpinRateRadps` / `bodySpinAccelRadps2` | 9 / 40 |
| `windUpMaxRad` / `windUpSpinRadps` | 0.6 / 4 |
| `landYawToleranceRad` | 0.35 |
| `shoveScoopPitchRad` / `shoveScoopRollRad` | 0.3 / 0.12 |
| `autoCatchOnRelease` | false |
| `landTiltRad` | 0.5 |

## Acceptance scenarios (headless, real Rapier)

1. **Ollie:** `↓` down, `S` down 0.02 s later, hold 0.2 s, release `↓` (`S` still held), then `W` 0.05 s later, then
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
9b. **No pop from the manual:** hold `↓` alone for 1 s and release. There is no pop.
10. **Nollie:** scenarios 1, 3 and 5 mirrored from the nose (`W`+`↑`, release `W`, `↓` / `←` / `A`, `Space`) give the same results, with pitch mirrored.
11. **Nose press:** hold `W` alone for 3 s. Pitch ≈ −`manualPitchRad`, the nose stays above −2 mm, and releasing does not pop.
12a. **Body 180:** load while holding `E`, pop, `W`, keep holding `E` until the rider has turned about π, `Space`. It lands rolling fakie on 4 wheels, rider heading Δ ≈ π, with no speed gained.
12b. **Body 360:** the same with `Q` held until about 2π. It lands rolling forward.
12c. **Line-up:** in the air, `E` held briefly to about 90°, no catch, landing on flat ground. That's a bail (sideways), with no explosion.
12d. **Flip + body spin:** a kickflip with `Q` held, where the board keeps its own yaw while both feet are off. A catch near the end re-aligns it.
12e. **Heelflip:** load, pop, `D` 0.05 s later, release, then `Space` near 2π. Roll = 2π ± 0.3 in the opposite direction to the kickflip, with a clean landing. Also `W`+`D`.
12f. **Nollie heelflip:** hold `W` + `↑`, release `W`, `→` 0.05 s later, `Space`. Roll = 2π, heelflip direction, clean landing. Also nollie kickflip with `←`. Both stances.
13. **Idle:** 10 s with no input. No drift and no bail.
