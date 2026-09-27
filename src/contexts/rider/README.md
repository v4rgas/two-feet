# rider

Owns the feet: attached/detached state, deck position, pressure. Turns intents into
forces on the board. Detects bails. The gesture → force mapping is described in
[ADR 0004](../../../docs/adr/0004-foot-force-model.md).

## Ubiquitous language

- **Rider** (aggregate) — two feet + a kinematic torso + bail state. Read model: `RiderState`.
- **Foot** (entity, id = `FootId`) — `attached` (on the deck, applies forces) or `airborne` (follows the torso, applies nothing). Read model: `FootState`.
- **Deck position** (VO) — where a foot stands, board frame: `alongM` (+X nose), `acrossM` (+Z).
- **Target** — where the stick wants the foot: `rest + stick × reach`. May be past the edge.
- **Pressure** — normalised downward push of an attached foot, `[0, 1]`: standing weight + tail hold.
- **Over the tail** — back foot at (or within `tailZoneMarginM` of) the tail kick.
- **Foot force** (VO) — a force (N) or impulse (N·s) at a world point, labelled `press | friction | pop | flick | sweep | push | catch` (carve lean is part of `press`).
- **Pop** — back foot held down over the tail, then released quickly → tail-tip impulse. **Sweep** — back foot sideways during the pop → tangential tail impulse (shuvit). **Ollie friction** — front foot sliding to the nose after a pop drags the grip. **Flick** — fast sideways stick past the edge in the air → edge impulse. **Catch** — foot back on the deck in the air with a neutral stick → spin damping.
- **Toe side** — board +Z in regular, −Z in goofy (`toeSideSign`). Forces do not depend on stance; only trick naming does.
- **Detach** — `leftDeck` (target off the deck, in the air), `tooFast` (deck spin under the foot), `separated` (board tilted / flew away). **Reattach** — target on the deck, board upright, within the catch radius.
- **Bail** — both feet off while on the wheels too long, an upside-down / off-angle landing, or the board resting upside down.

## Structural ports

The rider domain cannot import other contexts, so `foot-force-model.ts` declares the
minimal shapes it consumes: `RiderControls` (satisfied by input's `IntentFrame`),
`BoardKinematics` (by board's `BoardSnapshot`), `DeckGeometry` (by board's `BoardSpec`).
`src/game/contract-checks.ts` makes tsc fail if they drift. `deck-surface.ts` recomputes
the grip-tape geometry from `DeckGeometry`; `application/deck-surface.contract.test.ts`
pins it to `BoardSpec.deckTopPointLocal` / `tailTipLocal`.

## Public API (`index.ts`)

- Types: `RiderState`, `FootState`, `FootContact`, `DeckPosition` (VO), `FootForce`, `FootForceLabel`, `RiderControls`, `FootControl`, `BoardKinematics`, `DeckGeometry`, `FootForceInput`, `FeetPressure`, `RiderChange`, `DefaultRiderSystemDeps`.
- Aggregate: `Rider` (`update(controls, board, dtS)`, `land(upDot)`, `reset(board)`, `state`); `NEUTRAL_CONTROLS`.
- Domain service: `FootForceModel` (interface) and `GestureFootForceModel(deck, config)`.
- Helpers: `targetDeckPosition`, `feetPressure`, `toeSideSign`, `deckTopPointLocal`, `tailTipLocal`, `flatHalfLengthM`, `isOverTail`.
- Application: `RiderSystem` (interface) and `DefaultRiderSystem({ body, bus, deck, config, board, model? })`.
- Config: `RIDER_CONFIG` (all thresholds and magnitudes; see ADR 0004).

## Events

- Emits: `BoardPopped` (when a `pop` impulse is applied; `tick` = the step it acts in), `FootAttached`, `FootDetached`, `RiderBailed`.
- Consumes: `BoardLanded` (upside-down / off-angle bail).
