# ADR 0004 — Foot force model (gesture → force mapping)

- Status: superseded by [ADR 0005](0005-assisted-trick-controller.md) (assisted physics,
  MECHANICS.md). Kept for history; the gesture → force model below is no longer in the code.
- Date: 2026-09-26

## Context

REQUIREMENTS §1.2 lists the moves (pop, ollie, flip, shuvit, catch, carve, push) as
stick gestures that must turn into **forces and impulses on the deck** — never into
animations. The rider context owns this mapping (`FootForceModel`, loop step 2) and the
feet's attach/detach state (`Rider` aggregate, loop step 5). The board and tricks
contexts only see the resulting physics and the `BoardPopped` / `Foot*` / `RiderBailed`
events.

## Decision

### Split of responsibilities

- **input** smooths each key cluster with a spring-damper (`SpringVirtualStick`,
  ω = 28 rad/s toward a held key, 22 rad/s back to neutral, ζ = 0.9, rescaled deadzone
  0.05) and exposes the stick **velocity**. A keyboard press peaks at ≈ 10 /s, which is
  what flicks are measured against.
- **`Rider` aggregate** (domain) moves the feet, decides attach/detach and bails. Each
  foot has a *target* deck position `rest + stick × reach`
  (front rest +0.12 m, back −0.20 m, reach 0.18 m along / 0.12 m across). The across reach
  is a little more than half the deck width, so a full sideways stick reaches past the
  edge (|x| ≳ 0.875).
- **`GestureFootForceModel`** (domain service) turns controls + rider state + the previous
  snapshot into `FootForce`s. It keeps gesture memory (tail charge, time since pop,
  recent sideways stick speeds, feet that left the deck this air session, push cooldown).
- **`DefaultRiderSystem`** (application) applies them through `RigidBodyHandle` and
  publishes `BoardPopped` for every `pop` impulse.

Everything is expressed in the board frame (+X nose, +Y up, +Z toe edge in regular) and
converted to world at the grip-tape point from `deckTopPointLocal` (same formula as
`BoardSpec`, pinned by `deck-surface.contract.test.ts`). The mapping is **stance
independent**: stance only decides which key cluster is which foot. Toe vs heel is
`toeSideSign(stance)` (+1 regular, −1 goofy) and matters only for naming the trick.

### Gestures

| Move | Detection (thresholds in `rider.config.ts`) | Force (world, at a deck point) | Label |
|---|---|---|---|
| **Standing / press** | Board touching ground (wheels, tail or nose). Pressure = `standingPressure` (0.1) per foot; back foot over the tail (≤ 0.03 m from the tail kick) adds `−stick.y`; the front foot unweights by the same fraction. | `pressure × footPressN` (250 N) along −board Y at each attached foot. | `press` |
| **Carve** | Grounded, both feet attached, both stick x same sign, `min(|x|) ≥ carveMinStickX` (0.15). | Adds `carveLeanN × lean` (80 N) to each foot's press, at the foot's own sideways spot → roll toward that edge. The board's trucks turn +roll (load on the +Z wheels) toward +Z, so toe lean in regular is a frontside carve. | `press` |
| **Pop** | Charge: back foot attached **over the tail**, `stick.y ≤ −0.6`, held ≥ `popMinHoldS` (0.06 s). Release: `stick.y > −0.3` within `popReleaseWindowS` (0.15 s) of leaving the charge. Board touching ground. | Impulse `popImpulseNs × peakHold` (5 N·s) along −board Y at the **tail tip** (underside). Publishes `BoardPopped`. Airborne or slow release → charge dropped, nothing applied. | `pop` |
| **Sweep (shuvit)** | Within `sweepWindowS` (0.15 s) after a pop, back `|stick.x| ≥ 0.5`. Once per pop. | Impulse `sweepImpulseNs` (2 N·s; estimate: yaw inertia ≈ 0.11 kg·m², 180° in ~0.35 s) along ±board Z (sign of stick x) at the tail tip → yaw. | `sweep` |
| **Ollie friction** | Within `ollieWindowS` (0.5 s) after a pop, front foot attached, slide speed `stickVelocity.y × reachAlong ≥ 0.3 m/s`. | Force at the front foot: `μ·N` along +board X (μ = 1.1, N = 40 N) **plus** `N` along −board Y. The drag lifts the pitched-up board; the normal force pitches the nose down and levels it. | `friction` |
| **Flick** | Front foot attached; its target crosses a deck edge; board airborne or popped ≤ 0.5 s ago; the peak sideways stick speed **toward that edge** over the last `flickWindowS` (0.15 s) ≥ `flickMinStickSpeedPerS` (8 /s). One per crossing, re-armed when the target is back on the deck. | Impulse `flickImpulseNs` (1.3 N·s) at the crossed edge (along = foot, across = ±half width), pointing outward and 70° downward (roll lever ≈ 0.1 m → ≈ 0.13 N·m·s, one full flip). Pushing the +Z edge down gives +roll, −Z gives −roll. The foot then detaches (`leftDeck`). | `flick` |
| **Push** | `push` held, board on its wheels, both feet attached, both sticks within radius 0.3, forward speed < 6 m/s, cooldown 0.6 s elapsed. | Impulse `pushImpulseNs` (3 N·s) along the board's +X flattened onto the ground, through the front foot. | `push` |
| **Catch** | In the air, a foot that was off the deck during this air session is attached again with its stick within radius 0.35. | At both shoe edges (±0.045 m across the foot): `F = −catchDampingNsPerM · (ω × r)` (30 N per m/s) → damps roll, pitch and yaw. | `catch` |

Why the flick uses a **remembered peak**: the stick spring has its highest speed
~35 ms after the key press, but only crosses the edge ~130 ms later, when it is already
slowing down. The peak within the window is what distinguishes a flick from a slow
slide.

Why the ollie friction includes the **normal force**: a pure along-deck force at the
grip tape has almost no lever arm about the centre of mass (the grip is ~6 mm above the
origin), so it cannot level the board. Friction needs the foot to press, and that
press at the front foot is what levels the nose, as in a real ollie.

### Attach / detach (Rider)

- An attached foot slides toward `clamp(target)` at ≤ `maxSlideSpeedMps` (2.5 m/s).
- On the ground the foot is clamped at the edge (leaning does not step off). In the air
  it detaches when the target leaves the deck (`leftDeck`).
- `tooFast`: deck speed under the foot from board spin, `|ω × r|`, above 4 m/s.
- `separated` (air only): board tilt > 70°, or the deck spot > 0.35 m from where the
  rider's foot is.
- Airborne feet hover 3 cm above their target spot on an imaginary level deck under the
  torso (yaw = board heading). They reattach when detached ≥ 0.06 s, the target is on the
  deck, tilt ≤ 35°, the deck spot is within `catchRadiusM` (0.1 m) and spin speed there
  is below the detach speed.
- The torso is a spring-damper (ω = 8 rad/s, ζ = 1) toward "0.9 m above the board" with
  velocity feed-forward, so it does not lag a board rolling at constant speed; it lags
  only on accelerations (pop, landing).

### Bail (Rider)

- `BoardLanded.upDot < 0` → `upsideDown`; tilt > `maxLandingTiltRad` (0.9 rad) → `offAngle`.
- Both feet off while the board is on its wheels for > 0.35 s → `feetDetached`.
- Board touching the world upside down (no wheels) for > 0.25 s → `upsideDown` (covers a
  landing that never produced `BoardLanded` because no wheel touched).
- A bailed rider applies no force and does not attach/detach until `reset`.

## Consequences

- Every move is a force at a contact point; sloppy timing gives weak or no impulse
  (e.g. a slow release drops the pop, a slow slide past the edge just steps off).
- Keyboard flicks always have the same stick speed, so with the keyboard "flick" is in
  practice "moved fully past the edge in the air". Analog sticks (later) will make the
  speed threshold matter.
- The COM is approximated by the board origin for spin speeds and catch damping (the
  domain does not see the body's COM). The error is ~ω × 3 cm and only affects damping.
- `BoardKinematics.contacts` gained `deck` (board's `ContactState` already has it) for
  the upside-down rest bail.

## Tuning

Pop and flick defaults come from the board context's headless Rapier runs: 4 N·s
straight down at the tail tip of a resting board lifts the nose ~0.43 m and resettles,
~8 N·s gives ~0.2 s of air (default 5, tune in 4–6+); a full kickflip needs ~0.13 N·m·s of
roll impulse (roll inertia ≈ 0.0096 kg·m²), hence 1.3 N·s at 70° below the outward
horizontal. `sweepImpulseNs` (a paper estimate) and the ollie friction are still uncalibrated; the
scenarios "pop lifts the nose above 0.3 m" and "scripted kickflip → roll ≈ 2π" are the
regression net. The press force (250 N) against a 2.4 kg board may need to come down if the
suspension bottoms out. `catchDampingNsPerM` is limited by stability: `c · dt / m_eff`
must stay well below 1 (m_eff ≈ 2–6 kg at the feet).
