# ADR 0013: Bail = ragdoll (the rider lets go completely until the reset)

- Status: accepted (refines REQUIREMENTS §1.3's bail, ADR 0011 and ADR 0012)
- Date: 2026-09-27

## Context

Player report: "still some issues with the board going crazy on pressing Space on a
bail. On a bail the board should just go ragdoll so it interacts with the environment."
[MECHANICS.md](../../MECHANICS.md) "Bail: the board goes ragdoll" is the spec. Probing
the old code found every path that could still push the board around a bail:

| Path | When | What it did |
| --- | --- | --- |
| Body follow (yaw PD), level PD, scoop PD, magnet | a kick or the deck on the ground at 70–90° of tilt, wheels not down (no `BoardLanded`) | kept "flying" the board for 0.2–0.3 s while it dragged its tail |
| Catch / catch buffer, catch rise impulse, catch correction | same, while Space was mashed | the tumbling board swept through the cone, the feet "caught" it (an upward impulse and up to 60 rad/s² of correction), then it bailed anyway |
| Grind fall-off | the step `|balance| > 1` | a sideways 0.8 m/s impulse plus that step's lock and stance PDs |
| Reset step | the first step after the reset saw the spawn snapshot (not grounded) | a held Space was an air catch: body PD and a catch rise impulse at the spawn |
| Feet | whole bail | stayed attached to the deck; Q / E still spun the rider heading |

The flip and shove channels (`holdChannels` sets ω) already ended on any deck / kick
contact, and `computeForces` already returned nothing once `rider.bailed` — but the bail
was only decided at the wheel touchdown or after 0.25 s resting upside down.

## Decision

- **A hard gate, twice.** `TrickController.computeForces` returns no forces while
  `rider.bailed`, before it reads a single key, and drops everything buffered (`letGo`:
  the load, the channels, the catch buffer and late catch, the lock, the magnet, the
  pop-out floor, the steer lean, the swipes). `DefaultRiderSystem.applyIntents` applies
  nothing (no force, impulse, pop or catch) while the rider is bailed, including the step
  the bail is decided in (the grind fall-off is decided inside the rider step).
- **Bound to bail = hands off.** In the air (≥ `bail.touchdownMinAirS`, 0.1 s), a deck /
  tail / nose touching the ground or a ramp (not a grind edge or ledge) with the board's
  up more than `landTiltRad` from the contact normal (`offAngleTouchUpDot`): the trick
  controller applies nothing that step and ends the channels and any buffered catch. Held
  `bail.touchdownHoldS` (0.05 s) it is the bail (`upsideDown` if the grip faces the
  contact, else `offAngle`). The hold exists because a kickflip's tail may graze the
  ground for one step mid-flip and still land clean (the tricks suite does exactly that);
  the controllers are off during the graze either way. A catch attempt outside the cone
  still applies nothing (the cone check is pure).
- **Grind fall-off**: the lock lets go and applies nothing — no fall impulse
  (`grind.fallOffSpeedMps` is removed). The board falls off the edge by itself.
- **Feet and body (presentation only)**: on the bail both feet detach (`FootDetached`,
  reason `bailed`), the torso eases down to `bail.fallenTorsoHeightM` above the board,
  the heading freezes and every key is ignored (`Rider.update` reads neutral controls).
  The feet are kinematic points; they never touch the board.
- **Reset** (`GameLoop`): `bailResetDelayS` (1.5 s) after the bail, or when the board is
  at rest (|v| < `bailRestSpeedMps`, |ω| < `bailRestSpinRadps`), whichever is later,
  capped at `bailResetMaxS` (3 s). A board still rolling on its wheels resets at the cap.
- **After the reset**: the first step applies nothing (it sees the spawn pose, not a
  physics read), and a Space (or key) still held through the reset does nothing until
  released.

## Consequences

- Scenario 12h (`ragdoll.scenario.test.ts`, at pro and normal, then in the one mode once
  the levels were removed): an uncaught upside-down
  landing, an off-angle caught landing (the late shove of 9a) and the G5 grind fall-off,
  each with every key mashed during the bail. Zero rider forces on every step from the
  bail to the reset, the feet off, the reset between 1.5 s and 3 s, and the board's
  position, rotation and velocities equal bit for bit to the same run with no input.
- Every existing scenario and the montage are unchanged.
- A board dragging a kick at > `landTiltRad` for 0.05 s now bails even if physics might
  have righted it; that is the spec's "no controller may fight a board bound to bail".
