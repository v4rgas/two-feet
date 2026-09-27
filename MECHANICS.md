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
    (≈ 0.92, so the flip finishes before landing).
  - Cap it at `maxFlipRatePerTurnRadps` per turn (see *Swipe size*).
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
- **The catch is feet, not magic.** Feet have limited strength, so a catch
  can fix a *small* error and slow a *moderate* spin, but it can't save a
  board that's far off or spinning hard. You *can* catch and still bail.
- **Condition (the catch cone):**
  - roll within ±`catchRollRad` (≈ 0.5 rad) of upright
  - yaw within ±`catchYawRad` (≈ 0.45 rad) of the stance angle
  - pitch within ±`catchPitchRad` (≈ 0.6 rad)
  - |ω| below `catchMaxOmegaRadps` (≈ 14 rad/s). Feet can't grab a board
    that's still whipping round.

  Outside the cone the feet stay off (see the assists' catch buffer).
- **Physics, smooth and capped:**
  - The feet reach the deck (the existing ease), and only then apply torque.
  - The correction is a torque-limited PD toward level and the nearest
    stance yaw. Angular acceleration is capped at `catchMaxAlphaRadps2`
    (≈ 60 rad/s²), and the total correction per catch is capped at
    `catchMaxCorrectionRad` (≈ 0.35 rad) on each axis.
  - It settles over about `catchSettleS` (≈ 0.15–0.2 s), eased. It never
    snaps within a step or two, and the spin damps out rather than stopping
    dead.
  - The rest of the error stays: if the board was 0.4 rad off, it lands
    about 0.05+ rad off, and the landing rules decide.
- **Spin settle and ride-in (how a spinning trick gets caught, ADR 0011):**
  with rates of 9–32 rad/s and a 60 rad/s² catch, the feet alone could never
  stop a flip without overshooting it. So each flip / shove channel **eases
  its rate down** over its last part (about `spinSettleS` ≈ 0.12 s of
  deceleration) to `spinCoastRadps` (≈ 5 rad/s) at its target, and keeps
  coasting past it if not caught (the uncaught board keeps turning). Caught
  before its target (inside the cone), the channel **rides in** under the feet
  to the target, slowing to `catchRideInRadps` (≈ 3 rad/s); only then does the
  capped correction act. Pressing `Space` at the end of the rotation is the
  well-timed catch.
- **Landing still decides:** a caught board that touches down beyond the
  landing tolerance (tilt > `landTiltRad`, yaw off the travel) **bails**.
  Being caught never skips the landing check.
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

### Bail: the board goes ragdoll
The moment a bail is decided (whatever the reason: landing off-angle, upside
down, uncaught, lost balance, feet off), the rider **lets go completely**:
- **Every controller stops that same step and applies no force at all:**
  - the catch and the catch buffer
  - the spin settle and the flip/shove channels
  - the level, follow-body and landing assists
  - the lock-on and grind PDs, and the magnets
  - push, press and steer
- Any pending buffered input is dropped.
- The board is a free Rapier rigid body. It tumbles, bounces and slides,
  and interacts with the ground, stairs, rails and ramps until the reset.
- **All keys do nothing until the reset,** including `Space`. There is no
  push, no catch and no pop.
- The feet detach and fall away with the rider, drawn semi-transparent and
  easing down. They never pull or push the board.
- **Before a bail is decided,** an attempted catch outside the cone applies
  nothing. The feet stay off and nothing is "half-caught". Once a board is
  bound to bail (for example, it touches down outside tolerance), no
  controller may fight it.
- The reset happens after `bailResetS` (1.5 s), or when the board comes to
  rest, whichever is later, capped at 3 s.
- **Status:** implemented in [ADR 0013](docs/adr/0013-ragdoll-bail.md). A kick or the
  deck touching down outside tolerance stops every controller that step, and is the bail
  once it holds 0.05 s (a one-step graze mid-flip can still land).


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
- **Steering (on the ground, not loaded):** `Q` turns left and `E` turns
  right, as seen from the camera (the direction of travel turns
  counter-clockwise or clockwise from above), in both stances and riding
  fakie.
  - It works through the **same lean → truck steer path as carving**. It
    sets a lean target (`steerLeanFraction` ≈ 0.8 of max lean, eased in and
    out over `steerLeanResponseS` ≈ 0.12 s), so the deck leans visibly and
    the turn radius is the trucks' normal one. It never applies a yaw
    torque.
  - It adds to the foot-key carve lean, clamped to max lean. It doesn't
    apply while loaded (that's the wind-up) or in a manual.
  - It never adds speed (no thrust; grip scrub may slow you a little in
    tight turns, as in a carve).
- **Spin (in the air):**
  - Holding `Q`/`E` speeds the rider's heading up toward
    `±bodySpinRateRadps` (≈ 14 rad/s, a 360 in about 0.5 s with the wind-up),
    with ease-in and ease-out (`bodySpinAccelRadps2`).
  - Releasing the key eases the spin back to 0, so you can stop at any angle.
  - The rider heading is **no longer frozen in the air** while `Q`/`E` are
    held. It only changes by this body spin, never by board yaw.
- **The board follows the body through the feet:**
  - The wind-up's spin carries over to the board at the pop: board and body
    start spinning together.
  - The feet steer the board's yaw toward the rider heading (a yaw PD,
    toward the nearest 0°/180° of it) at all times, **except while a shove
    channel is running**. A flip is a roll, and it doesn't stop the board
    turning with the body, so a "180 Kickflip" or "FS 180 Heelflip" is a real
    180 of body and board together.
  - A shove turns the board relative to the body. That is exactly what the
    recognizer names as the shove: **board yaw minus body yaw**. So a body
    varial is a shove made while spinning.
  - The catch snaps the board's yaw to the nearest 0° or 180° of the **rider**
    heading, not of the old travel direction.
- **Landing:**
  - The direction of travel doesn't change. What matters is how the board
    lines up with it.
  - Board yaw within ±`landYawToleranceRad` (≈ 0.35 rad) of the direction of
    travel: rolls forward.
  - Within that tolerance of 180°: rolls **fakie** (backwards). The rider
    heading keeps the body angle it spun to, so after a 180 the rider now rides
    fakie: moving backwards, same stance. Switch, meaning the other stance
    moving forward, isn't reachable yet and is left for later (ground
    kickturns or reverts).
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
| **Flip** (guide foot, flick window) | a sideways **swipe** of the guide foot (see *Swipe size*) | none, kickflip, heelflip. Swipe from the middle = 1 turn. Swipe from the **opposite edge across the whole board** = double (2 turns). |
| **Shove** (pop foot, shove window) | a sideways **swipe** of the pop foot | none, 180 shove (swipe from the middle), **360 shove** (swipe from the opposite side across, e.g. `↓`+`→` → `↓`+`←`). |
| **Body** (`Q` / `E`) | spin left / right | none, or any angle (180, 360, …) |

Riding direction (forward / fakie) and stance (regular / switch) aren't
inputs. They are the **state at the pop**, and the recognizer uses them as
prefixes.

### Swipe size: how big the flick or scoop is (replaces holding a key)
The size of a trick comes from **how far the foot travels sideways**, not from
how long a key is held.
- **Measuring a swipe:** `x` is the foot's sideways stick value, from −1
  (heel edge) to +1 (toe edge). A swipe **starts** where the foot was, at the
  opposite extreme it reached in the last `swipeLookbackS` (≈ 0.3 s), which
  may be before the pop. It **ends** when `x` reaches the far side
  (|x| ≥ `swipeEndMin`, ≈ 0.6). Travel = |x_end − x_start|, anywhere from 0
  to 2.
- **One unit or two:**
  - Travel ≥ `swipeMinTravel` (≈ 0.55) triggers the trick: 1 turn (flip) or
    a half turn (shove).
  - Travel ≥ `swipeDoubleTravel` (≈ 1.45) doubles it: a double flip, or a 360
    shove.
- **Direction** is the direction of the swipe. For the guide foot, toward
  the heel edge is a kickflip and toward the toe edge is a heelflip. For the
  pop foot, BS or FS as before.
- **Letting go of a key is not a swipe.** Releasing `D` only drops `x` to 0,
  which doesn't reach the far side, so it never flips.
- **Pre-positioning:** a foot held toward an edge before the pop (for
  example `S` + `D` during the load) sets up a double. Holding it does
  nothing by itself: carving is off while loaded, and a held position isn't
  a swipe.
- **Timing on the smoothed stick:** a tap from the middle reaches the far side
  about 0.07 s after the key goes down, and a swipe from the opposite edge
  about 0.1 s after (so hold the second key that long). A swipe counts if it
  ends inside the flick / shove window after the pop. With the capped rates
  a double flip needs a full load (a half-load pop is about 6% short of air).
- **Regular-stance examples:**

  | Trick | Keys |
  |---|---|
  | Kickflip | pop, then tap `A` |
  | Double kickflip | load with `S`+`D` held, pop, then swipe to `A` (let go of `D`, press `A`) |
  | Heelflip | pop, then `D` |
  | Double heelflip | load with `S`+`A`, pop, then swipe to `D` |
  | BS shove-it | pop, then `←` |
  | 360 shove | load with `↓`+`→` (`S` held too), pop by releasing `↓` while holding `→`, then swipe to `←` |
  | FS 360 shove | load with `↓`+`←`, pop, swipe to `→` |

  Nollie mirrors these with the roles swapped.
- **Spin speed (slower, it was too fast):** the rate is set so the flip or
  shove takes most of the air, not a snap:
  - rate = turns · 2π / (T_remaining · `flipCompleteFraction`)
    (`flipCompleteFraction` ≈ 0.92)
  - capped at turns × `maxFlipRatePerTurnRadps` (≈ 16 rad/s per turn)
  - shoves are capped at halfTurns × `maxShoveRatePerHalfTurnRadps`
    (≈ 9 rad/s per half turn)
  - A single kickflip on a normal pop takes about 0.4 s, and you can see it
    turn. A late swipe under-rotates, as before.

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

## Grinds and slides (M4)

Same approach as the tricks: physics stays real, and a **lock-on** helps the
board sit on the edge. The same keys as on the ground pick what you do, so
there's nothing new to learn.

### Where
Any obstacle edge whose surface is `grindable` (coping, rails, the hubba's
steel edge) or `ledge` (ledge tops and edges). `SurfaceContactStarted`
already reports the part (`noseTruck`, `tailTruck`, `deck`, `nose`, `tail`)
and the surface. The world domain exposes each grindable edge as a line
segment (start, end, outward normal) for the lock-on.

### Lock-on
While the board is airborne (after a pop) or rolling off a lip, and a part
comes within `lockDistanceM` (≈ 6 cm) of an edge segment while moving
toward it:
- **Pick the stance on the edge** from the board's yaw relative to the edge
  direction (`φ`) and from the keys held at that moment:

  | Board vs edge | Nothing held | `↓` held (tail press) | `W` held (nose press) |
  |---|---|---|---|
  | parallel (φ within ±`parallelToleranceRad` ≈ 25°) | **50-50** (both trucks) | **5-0** (tail truck, nose up) | **Nosegrind** (nose truck, tail up) |
  | perpendicular (φ within ±`perpToleranceRad` ≈ 35° of 90°) | **Boardslide** (deck middle) | **Tailslide** (tail on the edge) | **Noseslide** (nose on the edge) |

  In nollie roles, `↓` and `W` swap with the pop foot as usual.
- **Frontside or backside** comes from which side of the rider the edge is
  on when locking in: toes toward the edge = frontside, heels toward the
  edge = backside. Lipslides and bluntslides are later.
- **Line up** with `Q`/`E` in the air (body spin): about 90° for slides, and
  0° for grinds.
- If no stance fits (φ between the bands, or no part near), there is no
  lock. Physics just happens: you hang up, bounce or bail.

### While locked
- **Constraint:** a PD spring holds the locked contact point on the edge
  line, along the edge's normal plane. It does not pull along the edge.
  Another PD holds the stance's pitch (5-0, nose and tail with the kick
  down) and yaw (parallel or 90°).
- **Speed:** friction along the edge, `grindFriction` (≈ 0.08 × g, metal)
  for grinds and `slideFriction` (≈ 0.2 × g, deck on concrete or steel) for
  slides. Gravity along a sloped edge (the hubba, the handrail) keeps you
  going. There is **no thrust**.
- **Balance:** a balance value in [-1, 1] drifts with a random walk plus
  the edge's slope and your speed, getting harder the longer you stay on.
  Hold both feet the **same way** (`A` + `←` / `D` + `→`, like carving)
  against it. The HUD shows a small balance bar. At |balance| > 1 you fall
  toward that side, the lock releases, and physics decides the rest,
  usually a bail.
- **Feet:** they stay attached. The pose follows the stance: the tail foot
  pressed for 5-0 and tailslide, for example.

### Exits
- **Pop out:** the same ollie gesture on the edge: load `↓`+`S`, release `↓`
  (or the nollie version). Flips and shoves work during a pop out exactly
  as from flat, so **"tailslide → hardflip out"** is load, release,
  `A` + `→`, `Space`. The pop impulse is along the edge's outward normal
  plus up, so you leave the obstacle.
- **Roll off the end:** reaching the segment's end releases the lock with
  the current velocity, then you land as normal. A slide needs rotating back
  with `Q`/`E` or a pop out to land lined up, otherwise it lands sideways
  and bails.
- **Fall off:** balance is lost, see above.

### Recognizer
- **Grind names** are emitted as `GrindStarted`/`GrindEnded` events and
  named "BS Tailslide", "FS 50-50", "Nosegrind" and so on, with the grind
  time.
- **A line** is the chain from a pop to the final clean landing, joined with
  "→": "Kickflip → BS Tailslide → Hardflip out". Tricks into a grind are
  named as usual. The pop out keeps its trick name with " out". The popup
  shows the whole line on landing. Scoring and combos are M5.

### Assists: human timing without changing the feel

The line (kickflip → tailslide → hardflip out) works for a script but not for
a human. Catch windows of ±0.03 s, a 10 cm approach tolerance and exact
lock-in timing are far tighter than human reactions (±60–100 ms). The assists
below widen **when** and **where** an input counts. They never change how the
board moves while you ride, so pop height, spin rates, speeds, friction and
the swipe sizes all stay the same.

**Guardrails:**
- Assists only act inside windows that already exist (catch, lock-on,
  pop-out, flick). They never act during plain riding, and never create
  thrust.
- **There is one mode.** The assists are always on, at the former `easy`
  values. There are no difficulty levels: no `assistLevel`, no F2, no HUD
  label, no stored setting. The values live in one `assist` config block,
  and the dev tuning panel can still edit them.
- The HUD never shows "assist happened". It should feel like you did it.

### 1. Input buffering (the biggest win)
- **Catch buffer:** a `Space` pressed up to `catchBufferS` (normal ≈ 0.15 s)
  *before* the board enters the catch cone is held and fires the moment it
  enters. It replaces the `catchRetryS` lockout: an early press no longer
  wastes the catch.
- **Late catch grace:** a `Space` pressed up to `catchLateS` (≈ 0.06 s) after
  touchdown still counts as caught, if the board is on its wheels and within
  tilt.
- **Stance-key grace:** the `↓`/`W` that picks 5-0 or tailslide versus
  nosegrind or noseslide counts if it's held at any time within
  `stanceKeyGraceS` (≈ 0.15 s) before or after the lock-in, not only at the
  lock instant.
- **Swipe grace:** a swipe that ends up to `swipeGraceS` (≈ 0.05 s) before the
  pop (a rushed finger) is still applied to that pop.

### 2. Lock-on magnetism
- **Reach:** while airborne after a pop, if a grind edge lies ahead on the
  predicted path within `magnetReachM` sideways (normal ≈ 0.25 m, easy ≈
  0.4 m), a gentle sideways velocity nudge of at most `magnetMaxMps`
  (≈ 0.35 m/s) steers the board's path onto the edge line. It only nudges
  sideways; the speed along the path stays the same.
- **Lip catch:** a board up to `lipCatchBelowM` (≈ 0.06 m) *below* the edge
  top that is still rising, or level with it, is lifted onto it instead of
  clipping the side. This covers pops that are a hair short, like our 0.45 m
  pop against the 0.35 m hubba.
- **Angle bands:** perpendicular `perpToleranceRad` widens from 0.61 to about
  0.8 at normal, and parallel from 0.44 to about 0.55. The lock then snaps
  the yaw to the stance, as it already does.
- **Quarter-turn helper:** during `Q`/`E` in the air with a grind edge ahead,
  the body spin eases to a stop at the nearest stance angle (0° or 90°
  relative to the edge) when you release within ±`spinSnapRad` (≈ 0.35) of
  it.

### 3. Pop-out generosity
- **Airtime floor:** a pop-out that starts a flip or shove gets just enough
  extra vertical impulse so the predicted airtime is at least
  `popOutMinAirS` (≈ turns × 0.36 s). The hardflip out then finishes from
  anywhere on the hubba, not only halfway down. Plain pop-outs are
  unchanged.
- **Early exit window:** a pop-out load started up to `popOutBufferS`
  (≈ 0.12 s) before the lock-in is kept, so you can be "already loading" as
  you land in the slide.

### 4. Balance
- At normal, `balanceDriftPerS` is scaled by `balanceEase` (≈ 0.6) during the
  first 1.0 s of a grind. That's enough to stay on a hubba-length slide with
  no balance input. It never lasts longer than 1.0 s.

### Acceptance
- **Human-jitter test for the line (G4H):** run the G4 line 50 times with a
  fixed seed per run, each run randomly perturbed:
  - every key time ± 70 ms (uniform)
  - every hold duration ± 40 ms
  - spawn lateral offset ± 0.2 m
  - spawn speed ± 0.3 m/s

  Results needed: the rates are measured and kept as regression floors
  (see ADR 0012 for the history).
- **Same test for the tricks alone** (kickflip down the stairs, ollie to
  50-50 on the rail, 360 flip off the kicker): measured floors, as above.
- **No feel change:** every existing scenario (matrix, park, grinds,
  names) passes in the one mode, and `montage:verify` passes.
- **No thrust:** no assist raises horizontal speed except the pop-out's
  vertical impulse and the nudge's sideways component, which is at most
  0.35 m/s.
- **Status:** implemented in [ADR 0012](docs/adr/0012-assists.md), which has the
  tunables per level and the measured rates (`pnpm test:human`). G4H, the rail
  and the kicker are below these targets. The limit is the along-path pop-time
  window, which the assists (sideways and in time only) cannot widen. The hubba's
  flat top now reaches 0.9 m back onto the platform.

## Tunables (`rider.config.ts` → `grind` block)
| Key | Start value |
|---|---|
| `lockDistanceM` | 0.06 |
| `parallelToleranceRad` / `perpToleranceRad` | 0.44 / 0.61 |
| `grindFrictionG` / `slideFrictionG` | 0.08 / 0.2 |
| `balanceDriftPerS` / `balanceAssist` | 0.6 / 1.0 |
| `lockSpring` / `lockDamping` | tune |

### Acceptance scenarios (park, headless)
- **G1:** ollie onto the flat rail parallel, nothing held. It's a 50-50 for
  at least 0.5 s, rolls off the end, lands clean and is named "FS/BS 50-50".
- **G2:** the same with `↓` held: "5-0".
- **G3:** `Q`/`E` about 90° in the air onto the ledge: "Boardslide". With
  `↓`: "Tailslide". With `W`: "Noseslide".
- **G4:** the stairs line. Push, kickflip onto the hubba with `↓` held at
  lock (Tailslide), then near the bottom load/release + `A` + `→`
  (hardflip) + `Space`. It lands clean, named
  "Kickflip → BS/FS Tailslide → Hardflip out". This is the montage clip.
- **G5:** no input on a long rail. Balance is eventually lost and the board
  falls off: a bail, no explosion.
- **G6:** no thrust. Speed along the edge never rises except from the
  slope's gravity.
- **G7:** stays on the quarter-pipe coping in a 50-50 stall, and pops out
  back into the transition.

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
| `flipCompleteFraction` | 0.92 |
| `shoveCompleteFraction` | 0.85 |
| `maxFlipRatePerTurnRadps` / `maxShoveRatePerHalfTurnRadps` | 16 / 9 |
| `catchRollRad` / `catchYawRad` / `catchPitchRad` | 0.5 / 0.45 / 0.6 |
| `catchMaxOmegaRadps` / `catchMaxAlphaRadps2` / `catchMaxCorrectionRad` / `catchSettleS` | 14 / 60 / 0.35 / 0.18 |
| `catchAssist` | 0.8 |
| `spinSettleS` / `spinCoastRadps` / `catchRideInRadps` | 0.12 / 5 / 3 (ADR 0011) |
| `catchRetryS` | 0.15 |
| `swipeLookbackS` / `swipeEndMin` / `swipeMinTravel` / `swipeDoubleTravel` | 0.3 / 0.6 / 0.55 / 1.45 (tuned from 0.8 / 0.7 / 1.6: see ADR 0010) |
| `bodySpinRateRadps` / `bodySpinAccelRadps2` | 14 / 90 (a 360 in about 0.5 s with a full wind-up) |
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
9a. **Catch can bail:** `Space` pressed at a roll error of about 0.45 rad (inside the cone but beyond the correction cap), landing soon after, must BAIL (`offAngle`). `Space` while |ω| > `catchMaxOmegaRadps` doesn't catch. A caught board's angular acceleration never exceeds `catchMaxAlphaRadps2` (no flick).
9. **Catch cone:** `Space` pressed mid-flip (board upside down) does not catch. Pressing it again after `catchRetryS` near upright does catch.
9b. **No pop from the manual:** hold `↓` alone for 1 s and release. There is no pop.
10. **Nollie:** scenarios 1, 3 and 5 mirrored from the nose (`W`+`↑`, release `W`, `↓` / `←` / `A`, `Space`) give the same results, with pitch mirrored.
11. **Nose press:** hold `W` alone for 3 s. Pitch ≈ −`manualPitchRad`, the nose stays above −2 mm, and releasing does not pop.
12a. **Body 180:** load while holding `E`, pop, `W`, keep holding `E` until the rider has turned about π, `Space`. It lands rolling fakie on 4 wheels, rider heading Δ ≈ π, with no speed gained.
12b. **Body 360:** the same with `Q` held until about 2π. It lands rolling forward.
12c. **Line-up:** in the air, `E` held briefly to about 90°, no catch, landing on flat ground. That's a bail (sideways), with no explosion.
12d. **180 flip:** wind up with `E`, pop, kickflip `A`, keep `E` held, then `Space`. The board and the body both turn about π (the board's yaw relative to the body is about 0) and it's named "BS 180 Kickflip" in regular. With a shove added, the board's yaw relative to the body is about ±π.
12h. **Ragdoll bail:** force a bail (an uncaught upside-down landing), then hammer `Space`, `A`, `↓` and `Q`/`E` during the bail. The rider applies zero force and zero impulse on every step until the reset (checked through the recorded forces). The board's motion matches a run with no input, bit for bit. The same holds for a grind fall-off bail.
12g. **Q/E steer:** rolling at 3 m/s, holding `Q` for 1 s turns the travel direction left (CCW from above) by at least 30°. `E` turns it right, the same in goofy and fakie. Speed never rises, and the deck leans.
12e. **Heelflip:** load, pop, `D` 0.05 s later, release, then `Space` near 2π. Roll = 2π ± 0.3 in the opposite direction to the kickflip, with a clean landing. Also `W`+`D`.
12f. **Nollie heelflip:** hold `W` + `↑`, release `W`, `→` 0.05 s later, `Space`. Roll = 2π, heelflip direction, clean landing. Also nollie kickflip with `←`. Both stances.
13. **Idle:** 10 s with no input. No drift and no bail.
