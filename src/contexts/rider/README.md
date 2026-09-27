# rider

Owns the rider: the rider frame (torso and heading), both feet, and the bail state.
Reads the intents as tricks and turns them into targeted impulses and assist torques on
the board (MECHANICS.md, assisted physics). The design is in
[ADR 0005](../../../docs/adr/0005-assisted-trick-controller.md).

## Ubiquitous language

- **Rider** (aggregate): the rider frame, two feet and the bail state. Read model: `RiderState`.
- **Rider frame**: the torso position plus a yaw-only **heading**, always upright. On
  the ground the heading follows the smoothed travel, either way round. In the air it
  changes only through the **body spin** (Q / E). It never snaps to the board's yaw.
- **Foot** (entity, id = `FootId`): `attached` (on the grip) or `airborne` (held by the
  rider). It is a kinematic point in the rider frame, and its drawn position
  (`positionRiderM` / `positionWorldM`) moves with limited speed and acceleration, so it
  never teleports. Read model: `FootState`.
- **Deck position** (VO): where a foot stands in the board frame, `alongM` (+X nose) and
  `acrossM` (+Z). After a 180 shove, `alongM` is reversed.
- **Pop foot / guide foot**: the foot on the kick that pops (the back foot for an ollie,
  the front for a nollie) and the other foot, which sets, levels and flicks.
- **Load / pop**: the pop foot on its kick plus the guide foot set toward it (↓ + S),
  then release the pop foot. **Press (manual)**: the pop foot alone, which never pops.
- **Trick channels**: the **flip** (guide foot flicks to the heel edge for a kickflip or
  the toe edge for a heelflip; held → double) and the **shove** (pop foot sweeps; held →
  360). Each holds a rate until the catch, and both aim at the air's shared end time.
- **Body follow**: in the air the feet keep the board's yaw under the body, unless a
  shove runs.
- **Wind-up**: Q / E while loaded. At the pop it becomes the body's and the board's spin.
- **Catch**: Space in the air, inside the cone (tilt and yaw near 0/180 of the heading).
- **Support normal**: the mean normal of the wheel contacts. The press, the level
  assist and the landing tilt use it, so banks and transitions count as level.
- **Toe side**: board +Z in regular, −Z in goofy (`toeSideSign`).
- **Bail**: a landing not lined up with the travel (forward or fakie), a landing tilted
  against the surface, upside down, both feet off on the wheels, or resting upside down.

## Structural ports

The rider domain cannot import other contexts, so `foot-force-model.ts` declares the
minimal shapes it consumes: `RiderControls` (satisfied by input's `IntentFrame`),
`BoardKinematics` (by board's `BoardSnapshot`, including the wheel contact normals) and
`DeckGeometry` (by board's `BoardSpec`). `src/game/contract-checks.ts` makes tsc fail if
they drift. The ground below the board comes in as `FootForceInput.groundBelowYM`, which
the application gets from the `probeGroundY` dependency (a physics raycast wired in
`compose.ts`).

## Public API (`index.ts`)

- Types: `RiderState`, `FootState`, `FootContact`, `DeckPosition` (VO), `FootForce`,
  `FootForceLabel`, `RiderControls`, `FootControl`, `BoardKinematics`,
  `BoardMassProperties`, `DeckGeometry`, `FootForceInput`, `FootForceOutput`,
  `FeetPressure`, `RiderChange`, `DefaultRiderSystemDeps`.
- Aggregate: `Rider` (`update(controls, board, dtS, loading)`, `liftFeet`,
  `catchFeet`, `land(upDot, board)`, `reset(board)`, `state`); `NEUTRAL_CONTROLS`.
- Domain service: `FootForceModel` (interface) and `TrickController(deck, config)`.
- Helpers: `targetDeckPosition`, `feetPressure`, `toeSideSign`, `deckTopPointLocal`,
  `tailTipLocal`, `flatHalfLengthM`, `isOverTail`.
- Application: `RiderSystem` (interface) and `DefaultRiderSystem({ body, bus, deck,
  config, board, model?, probeGroundY? })`.
- Config: `RIDER_CONFIG` (every tunable; the `tricks` block is MECHANICS.md's table).

## Events

- Emits: `BoardPopped` (with `foot` and `kick`), `FootAttached`, `FootDetached`,
  `RiderBailed`.
- Consumes: `BoardLanded` (the landing checks use `surfaceUpDot` when present).
