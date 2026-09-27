# tricks

Watches board motion and names what the board did. Pure logic: it never moves the board.
Decisions and sign conventions: [ADR 0007](../../../docs/adr/0007-trick-recognition.md).

## Ubiquitous language

- **Air session**: from `BoardLeftGround` to `BoardLanded`. It holds the start time, the airtime, the pop (if any), the rotation totals and the detached feet.
- **Pop state**: what the recognizer captures at `BoardPopped`: the **kick** (`tail` = ollie family, `nose` = nollie family), **fakie** (rolling backwards relative to the rider heading) and **switch** (the rider reports the other stance). A pop counts if takeoff follows within `session.popToTakeoffWindowS`.
- **Channels**: the three rotations of one air, all measured in the frame of the **rider heading at takeoff**:
  - **flip**: the board's roll about its own long axis (local X, integrated per step, never wrapped);
  - **shove**: the heading change of the board's long axis;
  - **body**: the rider's heading change (the `Q` / `E` body spin).
- **Rider-normalised**: every channel multiplied by −toe (toe = +1 regular, −1 goofy; the flip also by the board's facing at takeoff). After that, + = kickflip / backside shove / backside body spin in both stances and from both kicks.
- **Step**: a whole number of units on a channel. Flip units are full turns (2π), shove and body units half turns (π). **Complete** = every channel within its tolerance of a step (`tolerances.*Rad`, 0.6 rad).
- **Trick table** (`TRICK_TABLE`, data): the flip steps, the shove steps, the body steps, the named flip × shove cells, and the prefix words. A missing cell gets the generic `<flip> + <shove>`.
- **Name**: `[Switch] [Fakie] [Nollie] [body spin] <cell>`, for example "Nollie FS 180 Heelflip". The cell "Ollie" is dropped after "Nollie" or a body spin.
- **Grind** (M4, [ADR 0009](../../../docs/adr/0009-grinds.md)): read from the rider's `RiderPose.grind`. Named from `GRIND_NAMES` (data) as "<side> <stance>", e.g. "BS Tailslide", "FS 50-50". While locked, touchdowns and takeoffs are not landings or airs.
- **Line**: from the first grind to the final clean landing, joined with " → ": "Kickflip → FS Tailslide → Hardflip out". The air into a grind is named when the lock has settled (`grind.entrySettleS`), without the quarter turn a slide implies; a plain "Ollie" in or out is left out; the air out keeps its name with " out", without the body's own turn to the travel (`RiderPose.popOutTurnRad`). The landing's `TrickLanded.name` is the whole line; a bail in a line names the line so far.
- **Clean landing**: popped, complete, upright against the landing surface (tilt from `surfaceUpDot` ≤ `landing.maxTiltRad`), both feet attached within `landing.catchWindowS`, and `landing.minWheels` wheels down within `landing.settleWindowS`. Otherwise it is **bailed**.

## Public API (`index.ts`)

- Application: `TricksSystem` (interface: `update(snapshot)`, `air`, `reset`) and `DefaultTricksSystem({ bus, config, rider, stance, table?, recognizer? })`. It subscribes to the bus and publishes the outcomes.
- Domain service: `TrickRecognizer` (interface: `observe(sample, riderPose)`, `onEvent(event)`, `setStance`, `air`, `reset`; both calls return `TrickOutcome[]`) and `DefaultTrickRecognizer(config, table, stance)`.
- Pure functions: `classifyTrick(input, table, tolerances)`, `normaliseRotation(raw, stance)`, `toeSign`.
- `LocalRotationAccumulator` (implements `RotationAccumulator`).
- Types: `MotionSample` and `RiderPose` (structural ports), `AirSession`, `RotationTotals`, `TrickTable`, `TrickDefinition`, `RotationStep`, `TrickPrefix`, `TrickInput`, `TrickClassification`, `ChannelMatch`, `ChannelTolerances`, `TrickOutcome`.
- Config: `TRICKS_CONFIG` (tunables) and `TRICK_TABLE` (names), `GRIND_NAMES` (grind words and line format, type `GrindNames`).

## Structural ports

The tricks domain cannot import other contexts. It declares what it reads, and
`src/game/contract-checks.ts` makes tsc fail if the producers drift:

- `MotionSample`: satisfied by board's `BoardSnapshot` (tick, time, rotation, linear velocity, wheels down, grounded).
- `RiderPose`: satisfied by rider's `RiderState` (`headingRad`; optional `switchStance`, which the rider does not report yet; `grind`, `lastGrindExit`, `popOutTurnRad` for M4).
- `DefaultTricksSystemDeps.rider` / `.stance`: satisfied by `RiderSystem` (`state`) and `InputSystem` (`stance`).

## Events

- Emits: `TrickLanded { trickId, name, stance, rotation, airtimeS }` and `TrickBailed { trickId, name, reason, rotation, airtimeS }`. `name` on a bail is the closest trick. The reason is `underRotated` (a channel off its step), `upsideDown`, `offAngle` (tilted, or never on four wheels), `feetDetached` (not caught), or the rider's `RiderBailed` reason. `rotation` is rider-normalised (roll = flip, yaw = shove, pitch = local pitch).
- Emits (M4): `GrindStarted { grind, side, name, obstacleId, surface }` and `GrindEnded { grind, side, name, obstacleId, durationS, exit }` (`popOut` / `rollOff` / `fellOff`).
- Consumes: `BoardPopped` (kick), `BoardLeftGround`, `BoardLanded`, `FootAttached`, `FootDetached`, `RiderBailed`.
