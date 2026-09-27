# ADR 0005: Assisted-physics trick controller, rider frame and body spin

- Status: accepted (supersedes ADR 0004's gesture → force mapping; tunables are in
  `rider.config.ts`)
- Date: 2026-09-26

## Context

ADR 0004 turned stick gestures straight into free forces at the feet. It was hard to
play, the results were hard to predict, and it could push the board into the ground.
[MECHANICS.md](../../MECHANICS.md) replaces it with **assisted physics**, as in Session
and Skater XL. Keys are read as intents, intents become targeted impulses, and damped
spring controllers (PD) help with levelling, the catch and the landing. The board stays
a real Rapier body, and feet never add horizontal thrust.

This ADR records how that is built in the `rider` context (plus the `input` spin axis
and the recognizer's rotation channels) and why.

## Decision

### Rider frame, feet and heading (`Rider` aggregate)

- The **rider frame** is the torso position plus a yaw-only **heading**. It is always
  upright, and the feet are kinematic points in it. The torso spring-follows the board,
  with velocity feed-forward.
- **Heading.** On the ground it follows the smoothed direction of travel, either way
  round, so riding fakie does not turn the rider. It never snaps to the board's yaw. In
  the air it changes **only** through the body spin (Q / E). A shove-it spins the board
  under still feet, so after a 180 the feet's deck-along coordinates are reversed, and
  the camera follows the heading.
- **Drawn feet.** Each foot has a continuous position in the rider frame
  (`positionRiderM`) that follows its goal: on the grip when attached, hovering
  `airLiftM` above it when not. It moves with limited speed and acceleration
  (`maxFootSpeedMps` 1.7 m/s ≈ 1.4 cm per step, `maxFootAccelMps2`) and an ease-out over
  `catchReachS`. A catch or a lift therefore never teleports a foot. The renderer
  interpolates the feet, torso and heading between steps like the board, and the ankle
  tilt is presentation only.
- **Catch rise.** At the catch the board gets a vertical impulse that closes
  `catchRiseFraction` of the sole-to-grip gap over `catchReachS`. The board rises into
  the feet, like a real catch.

### Trick controller (`TrickController`, the `FootForceModel`)

The controller is written in **roles**, so the ollie and the nollie share one code path.
The pop foot stands on a kick and presses, loads, pops and shoves. The guide foot sets,
levels and flicks.

- **Load:** the pop foot on its kick plus the guide foot set toward the same kick
  (↓ + S in regular). **Pop:** release the pop foot. The pop is a vertical impulse
  through the centre of mass for the target height, plus the snap. The pop foot alone is
  a capped press (the manual) and never pops.
- **Flip and shove are independent channels.** Each **holds a rate** until the catch.
  The target angular velocity is ω = roll·f + yaw·Y + pitch·P, where f is the board's
  long axis, Y is world up and P is the pitch axis. We hold ω rather than apply one
  impulse because Rapier conserves angular momentum, not ω, and the deck's inertia is
  not round. With a single impulse, a rolling deck swings its pitch rate between about 1
  and 14 rad/s every half turn, and a varial turns about one fixed tilted axis.
- **Shared end time.** The first trick input of an air sets `trickEndS`, and every
  channel aims at it. Flip and spin then finish together, so a varial or tre flip can be
  caught.
- **Doubles by swipe size** (superseded the hold rule; see
  [ADR 0010](0010-swipe-size.md)). An edge-to-edge swipe of the flick foot targets 4π, and
  of the sweep foot 2π.
- **Body follow.** In the air, the feet keep the board's yaw under the body: a fixed 0/π
  offset per air, with the body's spin rate fed forward. They do this at all times
  **except while a shove runs**, so a 180 kickflip really turns the board with the body.
  A shove's rate is added on top of the body's spin.
- **Catch.** Space, inside the cone. (Superseded by [ADR 0011](0011-catch-feet-not-magic.md):
  the catch is now a torque-limited, capped correction; it no longer kills the spin or
  snaps the yaw.)
- **Channels end on contact.** Touching anything with the deck, tail or nose ends the
  channels; no spin is ever driven on the ground.
- **Push.** Space on the ground pushes along the travel, backwards when rolling fakie. A
  Space still held from an air catch does not push until it is released.

### Body spin (Q / E)

- The **input** context smooths Q / E into `IntentFrame.spin` (−1 left / +1 right), with
  the same spring as the sticks.
- **Wind-up:** Q / E while loaded turn the shoulders up to `windUpMaxRad`. At the pop,
  the wind-up becomes the body's initial spin rate and also the board's yaw rate.
- **Air spin:** the heading's rate eases toward ±`bodySpinRateRadps` (14) at
  `bodySpinAccelRadps2` (90), and back to 0 on release. At full speed that stops in about
  1.1 rad.
- A body 180 lands **fakie**. Switch is deferred (`RiderPose.switchStance` stays unset).

### Landing and bails

- **Tilt:** checked against the landing **surface** (`BoardLanded.surfaceUpDot`), not
  world up, so banks and transitions are level.
- **Sideways:** the board's axis is compared with its velocity in the plane of the
  landing surface. More than `landYawToleranceRad` off both forward and fakie means a
  bail, never a violent redirect by the wheel grip. The check is skipped over a grindable
  obstacle (the M4 boardslide hook).

### Ramps (M3)

- **Standing press** acts along −(mean wheel normal). That is straight down on the flat
  (so a manual adds no thrust) and into the slope on banks and walls. World-down weight
  on the light board braked it badly on slopes, because the rider's inertia is not
  simulated.
- The **level, catch and manual** assists measure pitch against the plane of the wheel
  contacts.
- The **airtime prediction** lands on the ground below the board. The composition root
  passes in `probeGroundY`, a physics raycast, so the domain stays free of physics.

### Recognizer (tricks context)

- Roll is the **flip coordinate** (∫ω·X minus heading turn × X.y), so a scooped 360 shove
  reads no roll.
- The shove is the board's yaw **relative to the body**, so a body 180 is "BS 180", not
  "BS 180 BS Pop Shove-it".

## Consequences

- Tricks are predictable and each has a scenario. The 100-case matrix covers flip ×
  shove × kick × stance and checks roll, yaw, a clean landing, no thrust and the name.
  12a–12d cover body spins, and the park scenarios cover banks, the quarter pipe, the
  kicker and the stairs.
- The controller holds angular rates directly. That is an assist, but it is still
  applied through the physics port as angular impulses, and collisions still win: the
  channels end on contact.
- The snapshot velocity is the board frame **origin's**, not the centre of mass's. While
  spinning they differ by ω × offset (about ±0.4 m/s at 25 rad/s), so no-thrust checks
  are made where |ω| is small.
- The rate caps were `maxFlipRateRadps` 60 and `maxShoveRateRadps` 30 (a snap). ADR 0010
  replaced them with per-turn caps (16 rad/s per flip turn, 9 per shove half turn), so a
  flip takes most of the air.

## Tuning

The tunables are in `rider.config.ts` (`tricks`, `feet`, `torso`, `stance`) and are
exposed live in the dev tuning panel. The MECHANICS.md table lists the start values.
