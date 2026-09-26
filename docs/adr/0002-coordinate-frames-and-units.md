# ADR 0002 — Coordinate frames and units

- Status: accepted
- Date: 2026-09-26

## Decision

### Units

SI everywhere: m, kg, s, rad, N, N·s, N·m. When a name could be ambiguous, it carries
the unit: `positionM`, `linearVelocityMps`, `angularVelocityRadps`, `forceN`,
`impulseNs`, `torqueNm`, `kickAngleRad`, `airtimeS`, `massKg`. Degrees appear only in
config literals, through `degToRad(…)`.

### World frame

Right-handed, **Y-up** (same as Three.js and Rapier). Gravity is -Y. The flat ground's
top face is the plane y = 0. Heading 0 means the board's nose points toward world +X.

### Board frame

Origin at the centre of the deck's flat section, at mid-thickness.

- **+X** toward the nose.
- **+Y** up, out of the grip tape.
- **+Z** toward the heel edge in regular stance (REQUIREMENTS §2.5) — i.e. the board's
  "right" side when looking from the tail to the nose. Wheel names use this: `…LeftWheel`
  is on -Z, `…RightWheel` on +Z.

Rotations around the board axes: **roll** = local X (flips), **yaw** = local Y (shuvits),
**pitch** = local Z (nose up/down). Positive = counter-clockwise looking down the
positive axis (right-hand rule).

`Transform.rotation` maps board-local vectors to world. `Quat.multiply(a, b)` applies
`b` first.

### Stick axes

Stick values are in board axes, not screen axes: `y` +1 toward the nose, `x` +1 toward
+Z. With the follow camera behind the board, +Z is screen right, so "right key = +Z" in
both stances. Which edge that is (toe or heel) depends on stance and is resolved by
`rider`/`tricks`.

### Stance-normalised rotations

Trick definitions use rider-relative signs (positive roll = kickflip direction,
positive yaw = backside shuvit). The recognizer maps board-frame totals using the
stance; the sign is calibrated by a headless physics scenario.

## Open point

With +X = nose and Y-up, a rider facing +Z has their **left** side toward the nose,
which is the natural "regular" body orientation — so the toe edge would be +Z. The
spec says +Z is the heel edge in regular. We follow the spec literally (only feet are
rendered, so the body's facing is not visible). If a visible body is added, revisit
this and the toe/heel mapping in `rider` together.
