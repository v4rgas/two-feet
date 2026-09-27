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
- **Clean landing**: popped, complete, upright (tilt ≤ `landing.maxTiltRad`), both feet attached within `landing.catchWindowS`, and `landing.minWheels` wheels down within `landing.settleWindowS`. Otherwise it is **bailed**.

## Public API (`index.ts`)

- Application: `TricksSystem` (interface: `update(snapshot)`, `air`, `reset`) and `DefaultTricksSystem({ bus, config, rider, stance, table?, recognizer? })`. It subscribes to the bus and publishes the outcomes.
- Domain service: `TrickRecognizer` (interface: `observe(sample, riderPose)`, `onEvent(event)`, `setStance`, `air`, `reset`; both calls return `TrickOutcome[]`) and `DefaultTrickRecognizer(config, table, stance)`.
- Pure functions: `classifyTrick(input, table, tolerances)`, `normaliseRotation(raw, stance)`, `toeSign`.
- `LocalRotationAccumulator` (implements `RotationAccumulator`).
- Types: `MotionSample` and `RiderPose` (structural ports), `AirSession`, `RotationTotals`, `TrickTable`, `TrickDefinition`, `RotationStep`, `TrickPrefix`, `TrickInput`, `TrickClassification`, `ChannelMatch`, `ChannelTolerances`, `TrickOutcome`.
- Config: `TRICKS_CONFIG` (tunables) and `TRICK_TABLE` (names).

## Structural ports

The tricks domain cannot import other contexts. It declares what it reads, and
`src/game/contract-checks.ts` makes tsc fail if the producers drift:

- `MotionSample`: satisfied by board's `BoardSnapshot` (tick, time, rotation, linear velocity, wheels down, grounded).
- `RiderPose`: satisfied by rider's `RiderState` (`headingRad`; optional `switchStance`, which the rider does not report yet).
- `DefaultTricksSystemDeps.rider` / `.stance`: satisfied by `RiderSystem` (`state`) and `InputSystem` (`stance`).

## Events

- Emits: `TrickLanded { trickId, name, stance, rotation, airtimeS }` and `TrickBailed { trickId, name, reason, rotation, airtimeS }`. `name` on a bail is the closest trick. The reason is `underRotated` (a channel off its step), `upsideDown`, `offAngle` (tilted, or never on four wheels), `feetDetached` (not caught), or the rider's `RiderBailed` reason. `rotation` is rider-normalised (roll = flip, yaw = shove, pitch = local pitch).
- Consumes: `BoardPopped` (kick), `BoardLeftGround`, `BoardLanded`, `FootAttached`, `FootDetached`, `RiderBailed`.
