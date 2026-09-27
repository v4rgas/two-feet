# rider

Owns the rider: the rider frame (torso and heading), both feet, and the bail state.
Reads the intents as tricks and turns them into targeted impulses and assist torques on
the board (MECHANICS.md, assisted physics). The design is in
[ADR 0005](../../../docs/adr/0005-assisted-trick-controller.md); trick size from the swipe
travel and the spin rates are in [ADR 0010](../../../docs/adr/0010-swipe-size.md).

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
- **Swipe** (VO `Swipe`, service `SwipeTracker`): a foot's sideways stick move that ends
  when it reaches the far side (|x| ≥ `swipeEndMin`); it starts at the opposite extreme
  within `swipeLookbackS`, which may be before the pop. Its **travel** sets the size: from
  the middle = one unit, edge to edge (pre-positioned, e.g. S + D during the load, then
  A) = two. Letting go of a key or a held position is never a swipe.
- **Trick channels**: the **flip** (guide foot swipes to the heel edge for a kickflip or
  the toe edge for a heelflip; two units → double) and the **shove** (pop foot swipes;
  two units → 360). Each holds a rate until the catch (capped per turn / half turn), and
  both aim at the air's shared end time.
- **Body follow**: in the air the feet keep the board's yaw under the body, unless a
  shove runs.
- **Wind-up**: Q / E while loaded. At the pop it becomes the body's and the board's spin.
- **Steer**: Q / E on the ground, not loaded and not in a manual: a lean (`steerLeanFraction`
  of a full lean, eased over `steerLeanResponseS`) added to the carve lean, so the trucks
  turn the travel left (Q) or right (E), forward or fakie, in both stances. No yaw torque.
- **Catch** ([ADR 0011](../../../docs/adr/0011-catch-feet-not-magic.md)): Space in the air,
  inside the cone (roll, pitch, yaw near 0/180 of the heading, and |ω| < 14 rad/s). Feet,
  not magic: a torque-limited correction (≤ 60 rad/s², ≤ 0.35 rad per axis), eased in
  while the feet reach the deck; a caught board can still bail on landing.
- **Spin settle / ride-in**: a flip or shove eases its rate down to a coast at its target
  (and coasts on if uncaught); caught before the target, it rides in under the feet.
- **Support normal**: the mean normal of the wheel contacts. The press, the level
  assist and the landing tilt use it, so banks and transitions count as level.
- **Toe side**: board +Z in regular, −Z in goofy (`toeSideSign`).
- **Grind edge** (`GrindEdgeView`, from world): a segment on top of a rail, coping, the
  hubba's steel edge or a ledge edge, with its outward normal; two-sided (a bar) or one-sided.
- **Lock / grind / slide** (M4, [ADR 0009](../../../docs/adr/0009-grinds.md)): in the air, a
  board part near an edge locks on. Along the edge it is a grind (50-50, 5-0, Nosegrind);
  across it, a slide (Boardslide, Tailslide, Noseslide). ↓ / W held pick the tail or the
  nose; FS / BS come from where the edge was at takeoff (toes = FS). While locked, the
  **lock PD** holds the locked point on the edge line (square to it only), the **stance
  PD** holds the attitude, friction brakes along the edge, and gravity along a sloped edge
  is left alone (no thrust).
- **Balance**: in [−1, 1], + toward the toe side. A seeded random walk scaled by the slope,
  the speed and the time on the edge; both feet leaning the same way counter it; past |1|
  the rider falls off (bail `lostBalance`: the lock lets go, nothing is applied).
- **Exits**: pop out (the ground's load and release; the pop also goes out along the edge's
  normal; the body turns on its own to the travel: `popOutTurnRad`), roll off the end
  (the feet stay on), fall off.
- **Assist level** (`AssistLevel`: `pro` | `normal` | `easy`, [ADR 0012](../../../docs/adr/0012-assists.md)):
  how much the assists widen when and where an input counts, never how the board moves while
  riding. Runtime state (`RiderSystem.assistLevel`, saved like the stance, F2 cycles it);
  each level's tunables are in `RIDER_CONFIG.assist` (`pro` = all zero). The assists:
  **catch buffer** (a held Space fires in the cone at the end of the rotation), **late
  catch**, **stance-key grace** (↓ / W before or after the lock-in), **swipe grace** (a swipe
  just before the pop), **magnetism** (a sideways nudge ≤ 0.35 m/s onto an edge on the final
  approach), **lip catch**, wider **angle bands**, **flip-in catch** (a board finishing its
  flip locks, and the stance is finished with the catch's capped correction), the
  **quarter-turn helper** (a released body spin stops on the stance angle to an edge ahead),
  the **pop-out airtime floor** (vertical only), the **pop-out buffer** (a load held as the
  board lands in the slide), and the **balance ease** (≤ 1 s).
- **Bail**: a landing not lined up with the travel (forward or fakie), a landing tilted
  against the surface, upside down, a deck / tail / nose touching down outside the landing
  tolerance for `bail.touchdownHoldS`, both feet off on the wheels, or resting upside down.
- **Ragdoll** ([ADR 0013](../../../docs/adr/0013-ragdoll-bail.md)): from the step the bail
  is decided until the reset the rider applies nothing (the trick controller returns no
  forces and drops every buffered input, and `DefaultRiderSystem` applies nothing while
  `bailed`), ignores every key (Space too), and the feet detach (`FootDetached`, reason
  `bailed`) and fall with the torso. A touch outside the tolerance stops every controller
  the step it happens. A grind fall-off lets go without a push. After the reset, a key still
  held does nothing until released.

## Structural ports

The rider domain cannot import other contexts, so `foot-force-model.ts` declares the
minimal shapes it consumes: `RiderControls` (satisfied by input's `IntentFrame`),
`BoardKinematics` (by board's `BoardSnapshot`, including the wheel contact normals) and
`DeckGeometry` (by board's `BoardSpec`). `src/game/contract-checks.ts` makes tsc fail if
they drift. `FootForceInput.assistLevel` carries the assist level, and
`FootForceOutput.spinSnapHeadingRad` asks the `Rider` to stop a released body spin there. The ground below the board comes in as `FootForceInput.groundBelowYM`, which
the application gets from the `probeGroundY` dependency (a physics raycast wired in
`compose.ts`). The grind edges near the board come in as `FootForceInput.edgesNear`,
from the `grindEdgesNear` dependency (world's `grindEdgesNear` over the level's edges,
wired in `compose.ts`); world's `GrindEdge` satisfies `GrindEdgeView`.

## Public API (`index.ts`)

- Types: `RiderState`, `FootState`, `FootContact`, `DeckPosition` (VO), `FootForce`,
  `FootForceLabel`, `RiderControls`, `FootControl`, `BoardKinematics`,
  `BoardMassProperties`, `DeckGeometry`, `FootForceInput`, `FootForceOutput`,
  `FeetPressure`, `RiderChange`, `DefaultRiderSystemDeps`.
- Aggregate: `Rider` (`update(controls, board, dtS, loading)`, `liftFeet`,
  `catchFeet`, `land(upDot, board)`, `reset(board)`, `state`); `NEUTRAL_CONTROLS`.
- Domain service: `FootForceModel` (interface) and `TrickController(deck, config)`, which
  runs `GrindController(deck, config)` (lock-on `tryLock`, locked step `hold`, `report`)
  and one `SwipeTracker` per foot (internal to the domain).
- Read model: `RiderState` also carries `grind` (`RiderGrind`: kind, side, obstacle,
  surface, balance, or null), `lastGrindExit` and `popOutTurnRad`.
- Helpers: `targetDeckPosition`, `feetPressure`, `toeSideSign`, `deckTopPointLocal`,
  `tailTipLocal`, `flatHalfLengthM`, `isOverTail`.
- Application: `RiderSystem` (interface, with the read/write `assistLevel`) and
  `DefaultRiderSystem({ body, bus, deck, config, board, model?, probeGroundY?,
  grindEdgesNear?, assistLevel? })` (default level `pro`).
- Assists: `AssistLevel`, `AssistTuning`, `ASSIST_LEVELS`, `nextAssistLevel`,
  `isAssistLevel`. Infrastructure: `LocalStorageAssistLevelRepository` (the saved level).
- Config: `RIDER_CONFIG` (every tunable; the `tricks` block is MECHANICS.md's table, the
  `grind` block the M4 one).

## Events

- Emits: `BoardPopped` (with `foot` and `kick`), `FootAttached`, `FootDetached`,
  `RiderBailed` (reason `lostBalance` when falling off a grind). The grind itself is read
  from `RiderState.grind`; the tricks context names it and emits `GrindStarted/Ended`.
- Consumes: `BoardLanded` (the landing checks use `surfaceUpDot` when present; ignored
  while locked on an edge).
