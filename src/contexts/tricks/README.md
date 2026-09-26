# tricks

Watches board motion and recognizes tricks. Pure logic — it never moves the board.

## Ubiquitous language

- **Air session** — from `BoardLeftGround` to `BoardLanded`: start time, airtime, whether it was popped, rotation totals, detached feet.
- **Rotation accumulator** — integrates the per-step LOCAL rotation of the board: **roll** (local X, flips), **yaw** (local Y, shuvits), **pitch** (local Z). Multi-turn rotations accumulate, they are not wrapped.
- **Stance-normalised rotation** — definitions are written for the rider: positive roll = kickflip direction, positive yaw = backside shuvit direction. The recognizer converts board-frame totals using the stance. The physical sign must be calibrated with the headless physics scenario "scripted kickflip → roll ≈ 2π".
- **Trick definition** (VO, data) — id, name, roll/yaw/(pitch) `AngleRange`s, `requiresPop`, `minAirtimeS`, `priority`. The table lives in `tricks.config.ts`.
- **Clean landing** — upright within `landing.maxTiltRad`, feet caught within `landing.catchWindowS`. Otherwise **bailed**.

## Public API (`index.ts`)

- Domain service: `TrickRecognizer` (`observe(sample)`, `onEvent(event): readonly TrickOutcome[]`, `setStance`, `air`, `reset`).
- Types: `MotionSample` (structural; `BoardSnapshot` satisfies it), `AirSession`, `RotationAccumulator`, `RotationTotals`, `TrickDefinition`, `AngleRange`, `TrickOutcome`.
- Application: `TricksSystem` (`update(snapshot)`, `air`, `reset`).
- Config: `TRICKS_CONFIG`.

## Events

- Emits: `TrickLanded`, `TrickBailed`.
- Consumes: `BoardLeftGround`, `BoardLanded`, `BoardPopped`, `FootDetached`, `FootAttached`, `RiderBailed`.
