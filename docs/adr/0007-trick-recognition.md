# ADR 0007: Trick recognition

- Status: accepted
- Date: 2026-09-26

## Context

REQUIREMENTS §1.5 asks for a recognizer that labels an air after the fact, from the
board's rotation, with tricks defined as data. MECHANICS.md "Trick matrix" defines every
trick as independent channels from one pop (kick, flip, shove, body spin). "Names the
recognizer must produce" lists the names, including prefixes (Nollie, Fakie, Switch,
BS/FS 180, 360) that must mirror correctly for goofy and for nollie.

The earlier contract integrated the board's rotation about its local axes only. That
works for the flip, but not for the shove. During a flip the board's local Y points down
half the time, so a 360 flip's vertical spin integrates to about zero about local Y.

## Decision

### Three channels, measured from the rider heading at takeoff

| Channel | Measured as | Why |
|---|---|---|
| flip | roll about the board's **own** long axis: local X of `q_prev⁻¹·q_curr`, summed | A flip is about the board's axis, whatever it does in yaw. It stays the same while the board also shoves. |
| shove | heading change of the board's long axis (unwrapped; skipped while the axis is near vertical) | This is correct when the board is upside down. It is also what the catch, the landing and the direction of travel care about. |
| body | heading change of the rider (`RiderState.headingRad`) | The rider context changes the heading in the air only through the `Q` / `E` spin. |

The shove is the board's own heading change. It is **not** relative to the body. In the
air both feet are off, so a body 180 leaves the board unrotated and the catch keeps it
lined up (the board is symmetric and the kicks are rider-relative). Subtracting the body
would name a plain BS 180 "BS 180 FS Shove-it".

### Sign conventions

The world is Y-up and right-handed. Angles about +Y are counter-clockwise seen from
above. The rider frame is forward f = heading and side s = the frame's +Z. The rider faces
the **toe edge**: toe = +1 in regular (+s), −1 in goofy (−s) (ADR 0002, `toeSideSign`).

| Channel | Physical definition | Source | Sign produced |
|---|---|---|---|
| kickflip | the guide foot flicks off the heel edge | trick controller `flip`: roll rate about board +X = −toe × facing × rate | local roll × facing = −toe × rate |
| backside shove | the rider's **tail end** swings to the heel side, behind the rider, whichever kick popped (MECHANICS "Shove direction naming") | trick controller `shove` (tail pop, heel-side sweep) | board yaw = −toe × rate |
| backside body spin | the rider's back turns toward the front first (MECHANICS "Prefixes") | geometry of the rider frame | rider yaw = −toe × rate |

One rule therefore normalises all three channels (`normaliseRotation`):

```
flip  = −toe × facing × localRoll      (+ = kickflip,  − = heelflip)
shove = −toe × boardYaw                 (+ = backside,  − = frontside)
body  = −toe × riderYaw                 (+ = backside,  − = frontside)
```

`facing` is +1 when the board's nose points toward the rider's front at takeoff, and −1
otherwise. Nose and tail are rider-relative, as in the trick controller. The stance is the
one ridden at the pop: the input stance, or its opposite when the rider reports switch.

Consequences:

- Regular: a kickflip rolls the board about −X (nose axis). A BS shove-it and a BS 180
  both turn clockwise seen from above (`E` for the body). Goofy mirrors all three.
- Nollie: the flip does not depend on the kick. For the shove, the pop foot sweeping the
  **nose to the toe side** swings the tail to the heel side, which is **backside**. The
  MECHANICS nollie key table labels the heel-side sweep (`A` in regular) "BS". By the
  tail rule, and with the current controller, that sweep spins frontside. The end-to-end
  test `names.scenario.test.ts` pins the rule. If the key table is meant literally, swap
  the controller's nollie sweep, not the recognizer.
- Fakie does not change any sign: every channel is read against the rider heading, not
  the direction of travel.

### Classification is data

`TRICK_TABLE` lists the steps of each channel as signed units. Flip units are full turns
(Kickflip +1, Heelflip −1, Double ±2). Shove and body units are half turns (BS +1, FS −1,
360 ±2). The table also lists the named flip × shove cells and the prefix words.
`classifyTrick`:

1. Takes the nearest step on each channel. The air is **complete** when each channel is
   within `tolerances.*Rad` (0.6 rad) of its step.
2. Looks up the cell. A missing cell ("—" in MECHANICS) becomes `<flip> + <shove>`.
3. Prefixes `Switch`, `Fakie`, `Nollie` and the body step, in that order. A cell can list
   `omitWith` ("Ollie" after "Nollie" or a body spin gives "Nollie", "BS 180").

Adding a trick or renaming one means editing the table. The classifier has no per-trick
code.

### Outcomes

- Only popped airs of at least `session.minAirtimeS` are named. Rolling off an edge
  gives no outcome.
- At `BoardLanded` the recognizer bails right away when the board is upside down, a
  channel is incomplete (`underRotated`, with the closest name), or the touchdown tilt
  exceeds `landing.maxTiltRad` (`offAngle`).
- Otherwise it waits in `observe`, which runs one step after touchdown at the earliest,
  so a `RiderBailed` from the same flush wins. It needs both feet attached
  (`FootAttached`) within `catchWindowS` and `minWheels` wheels within `settleWindowS`.
  Then it emits `TrickLanded`. If not, it emits `TrickBailed` (`feetDetached` or
  `offAngle`).
- A `RiderBailed` in the air or while waiting emits `TrickBailed` with the rider's
  reason and the closest name.
- The shared kernel gains `TrickBailed.name` and `BailReason` `"underRotated"`. The HUD
  shows "<name> · bail".

## Consequences

- The recognizer reads `RiderState.headingRad` through the structural port `RiderPose`.
  `RiderPose.switchStance` is optional and nothing reports it yet, so "Switch" is never
  produced in game until the rider context tracks the riding stance.
- Body-spin names depend on the rider heading changing in the air (MECHANICS "Body
  spin"). Until the rider implements `Q` / `E`, the body channel reads 0.
- The accumulator needs per-step rotations below π, which is 377 rad/s at 120 Hz.
