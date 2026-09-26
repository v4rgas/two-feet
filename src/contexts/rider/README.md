# rider

Owns the feet: attached/detached state, deck position, pressure. Turns intents into
forces on the board. Detects bails.

## Ubiquitous language

- **Rider** (aggregate) — two feet + a kinematic torso + bail state. Read model: `RiderState`.
- **Foot** (entity, id = `FootId`) — `attached` (on the deck, applies forces) or `airborne` (follows the torso, applies nothing). Read model: `FootState`.
- **Deck position** (VO) — where a foot stands, board frame: `alongM` (+X nose), `acrossM` (+Z).
- **Pressure** — normalised downward push of an attached foot, `[0, 1]`.
- **Foot force** (VO) — a force (N) or impulse (N·s) at a world point, labelled `press | friction | pop | flick | sweep | push | catch`.
- **Pop** — back foot held down then released quickly → tail impulse. **Flick** — fast sideways stick past the edge → edge impulse. **Catch** — stick back to neutral near the deck → reattach + spin damping.
- **Detach** — foot leaves the deck area or moves too fast relative to it. **Reattach** — back within the catch radius.
- **Bail** — both feet detached too long after landing, or an upside-down / off-angle landing.

## Structural ports

The rider domain cannot import other contexts, so `foot-force-model.ts` declares the
minimal shapes it consumes: `RiderControls` (satisfied by input's `IntentFrame`),
`BoardKinematics` (by board's `BoardSnapshot`), `DeckGeometry` (by board's `BoardSpec`).
`src/game/contract-checks.ts` makes tsc fail if they drift. Use board's
`BoardSpec.deckTopPointLocal` (via the board index, in application code/tests) as the
reference for where the grip tape is.

## Public API (`index.ts`)

- Types: `RiderState`, `FootState`, `FootContact`, `DeckPosition` (VO), `FootForce`, `FootForceLabel`, `RiderControls`, `FootControl`, `BoardKinematics`, `DeckGeometry`, `FootForceInput`.
- Domain service: `FootForceModel` (`computeForces(input): readonly FootForce[]`, `reset()`).
- Application: `RiderSystem` (`applyIntents`, `postPhysics`, `state`, `lastForces`, `reset`).
- Config: `RIDER_CONFIG`.

## Events

- Emits: `BoardPopped` (when a `pop` impulse is applied), `FootAttached`, `FootDetached`, `RiderBailed`.
- Consumes: `BoardLanded` (bail timer), optionally `BoardLeftGround`.
