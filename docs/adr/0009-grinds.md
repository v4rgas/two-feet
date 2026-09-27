# ADR 0009: Grinds and slides — edge segments, an assisted lock, balance and lines

- Status: accepted
- Date: 2026-09-27
- Spec: [MECHANICS.md "Grinds and slides (M4)"](../../MECHANICS.md)

## Context

M4 adds grinds and slides on the park's edges (rails, coping, the hubba, ledges, the
handrail). The rules of ADR 0005 still hold: the board stays a real Rapier body, the feet
never add horizontal thrust, and every assist goes through the physics port. The same keys
as on the ground pick what you do. The recognizer names the whole line, for example
"Kickflip → FS Tailslide → Hardflip out".

## Decision

### Edges are world geometry (`world/domain/grind-edges.ts`)

- `obstacleGrindEdges(obstacle)` turns obstacle parameters into straight **segments on
  top of the edge's profile**, from the same numbers as `obstacleGeometry`, so a segment
  lies on the collider:
  - the rail bar and the handrail are two-sided;
  - the quarter pipe's coping, the hubba's steel edge (a flat segment on the platform
    plus a sloped one down the stairs) and the ledge's two top edges are one-sided: the
    top face is on the −`outwardNormal` side.
- Each segment carries `outwardNormal` (horizontal, away from the obstacle: where a pop
  out goes), `surface`, `obstacleId`, `twoSided` and `halfWidthM`.
- Queries: `grindEdgesNear` and `nearestGrindEdge`.
- The rider reaches them through a structural port. `DefaultRiderSystemDeps.grindEdgesNear`
  is wired in `compose.ts` over `levelGrindEdges(level.obstacles)`, like `probeGroundY`.
  The trick model sees the edges near the board as `FootForceInput.edgesNear`
  (`GrindEdgeView`), and `contract-checks.ts` pins `GrindEdge ⊇ GrindEdgeView`.

### The lock is an assist, not an animation (`rider/domain/grind-controller.ts`)

The trick controller runs `GrindController` in the air, **before** the trick channels.
While locked, it suspends the channels, the body follow and the landing logic.

- **Lock-on.** A part within `lockDistanceM` of an edge, moving toward it, with the board
  upright (`lockMaxTiltRad`) and its yaw along the edge (`parallelToleranceRad`) or across
  it (`perpToleranceRad`), locks. The parts are:
  - both trucks' hangers (50-50), the tail truck (5-0) or the nose truck (nosegrind), for a grind;
  - where the edge crosses under the deck, within the deck middle (boardslide), the tail
    (tailslide) or the nose (noseslide), for a slide.

  The keys held pick the part, as in the MECHANICS table: nothing, ↓ (the back foot on
  the tail) or W (the front foot on the nose). A boardslide on a top surface may lock a
  little higher, because there the inner truck's wheels reach the top first.
- **Frontside / backside**: the side the edge was on relative to the rider's toes, from
  where and how the air began (the takeoff point and heading). If that is ambiguous, the
  sideways velocity decides.
- **The lock PD** acts on the velocity of the locked point, **square to the edge only**
  (`lockOmegaPerS`, `lockGain`, capped at `lockMaxSpeedMps`). It is applied as an impulse
  through the centre of mass and also carries gravity's component square to the edge.
  Gravity along the edge is untouched, so the hubba and the handrail keep you going. The
  point floats `hoverM` (4 mm) above the edge, so the collider carries no load: the
  friction along the edge is exactly ours (`grindFrictionG` / `slideFrictionG` × g, faded
  out near a standstill so a stall holds). It is never a push, so there is **no thrust**.
- **One-sided edges** (ledge, hubba, coping): a grind rides the inner wheels on the top,
  set in from the edge, with the hangers over it. A real 50-50 on a ledge rests on the
  corner with the board tilted. Holding the hanger on the corner would put the inner
  wheels 17 mm inside the top, and the lock PD and the collider would fight. A boardslide
  on a top surface tilts the end over the top up until its wheels clear it.
- **The stance PD** (`stanceOmegaRadps`) holds the attitude: along or across the edge
  (either way round), the edge's up, the stance pitch (`grindPitchRad` for a 5-0 or a
  nosegrind, `slidePitchRad` for a tail- or noseslide, the kick down), and a visual roll
  toward the side the balance tips to.
- **Entry over an edge's start** (one-sided edges, grinds). A grind coming in over the
  start of a ledge (or over its end, going the other way) locks before its locked point is
  over the edge: from when the leading truck's wheel is within its radius plus
  `entryLeadS` (0.03 s) of travel of the end face. Until the locked point is over the
  edge, the lock holds the edge line extended back. While the trailing truck's inner wheel
  has not passed the end face, the lock also holds the board higher by that wheel's drop
  below the locked point (a board still pitched nose-up from the ollie carries its tail
  wheel lower). Before, the lock waited for the board's middle to be over the edge, so a
  pop that topped out a few centimetres under the top put a truck's wheels into the end
  face first and the board stopped dead (El Toro's planter wall had to come down from
  0.42 m to 0.38 m). Now the lip catch lifts it onto the top first, with no thrust (the
  lock PD acts square to the edge only). Scenario: El Toro, "ledge starts" (a 0.42 m
  planter wall, a pop ≈ 3 cm low). A pop that tops out low *and early* (already falling
  at the start) is still not caught: the lip catch needs a board that is rising or level.
- **Continuation.** Past the end of a segment, the lock moves on to the next segment of the
  same obstacle that runs the same way (the hubba's flat top into its slope). It bridges
  gaps of up to `continueGapM`.
- **Joints of a bar (2026-09-27).** A rigid board cannot follow its midpoint around the
  kinks of a kinked rail or a down rail. Over a convex kink the tail truck dragged on the
  upper run and the board lost about a third of its speed. Into a concave kink the front
  truck landed on the next run while the lock still held the old slope, so the board
  wedged, stopped and fell off. Now, on a two-sided bar, while the board's two contacts
  along it (a grind's trucks, a slide's deck edges) project onto two joined runs, the lock
  holds the chord between those projections instead:
  - the chord is taken from points `jointLeadS` of travel beyond the contacts, so the
    velocity turns onto the next run before a truck gets there;
  - square to it, the locked point goes where the board as it is now (its attitude lags
    the chord) clears the path: each contact and, over a convex kink, the line between
    them (it pivots on the kink) stay `hoverM` + `jointClearM` (2 cm) above it;
  - the stance PD holds the chord's attitude, so the pitch (or a slide's roll) eases from
    one run's slope to the next;
  - along the chord only gravity and friction act, as on any edge.
  The board's collisions with the rail are untouched (no filtering). The extra 2 cm is
  what keeps the lagging trucks off the kink. The street scenarios check that across each
  kink the speed stays ≥ 90 % of what gravity and friction leave (a 50-50 and a boardslide
  along the whole kinked rail, a 50-50 over the funbox's down rail). One-sided edges (the
  hubba's flat top into its slope) keep the plain continuation.
- The rider's heading lines up with the board while locked, and the feet stay attached
  (a lock-on catches the board).

### Balance

Each lock gets a seeded random walk of the drift rate. It is deterministic: the seed is
`balanceSeed` mixed with the lock count. The walk is scaled by:
- the edge's slope (`balanceSlopeFactor`);
- the speed (`balanceSpeedFactor`);
- the time on the edge (doubling every `balanceHardenS`).

It also runs away with the balance itself (`balanceInstabilityPerS`). Both feet leaning
the same way, as in carving, push it back (`balanceAssist` × `balanceLeanRatePerS`).
Past |1| the lock lets go, the board is pushed toward that side, and the rider bails
with the new `BailReason` "lostBalance".

The spec says "physics decides the rest, usually a bail". We made the bail certain so
that G5 and the HUD are predictable.

### Exits

- **Pop out**: the same load and release as on the ground (the same code path,
  `loadAndPop`). Off an edge the pop's vertical speed is set relative to the board's
  motion: sliding down a hubba does not eat the pop. The pop also adds
  `popOutSpeedMps` along the edge's outward normal. For a two-sided bar that is the side
  the board is on, or the side it came from. That impulse is square to the edge, so it
  is not thrust along it.

  Flips and shoves then work as from flat. The **body turns on its own to line up with
  the travel** (`Rider.liftFeet(realignRad)`, eased like `Q`/`E`): a quarter turn out of a
  slide, or a turn back into the transition from a coping stall. The board follows the
  body, so a hardflip out of a tailslide lands lined up. `RiderState.popOutTurnRad`
  reports the turn, so the recognizer does not count it as a spin.
- **Roll off** the end: the lock lets go with the current velocity. The feet stay on
  (the board counts as caught), and the normal landing rules apply. A slide that rolls
  off lands sideways unless `Q`/`E` turns it back.

  On a one-sided edge a grind rides its inner wheels on the top. The lock used to let go
  as soon as the locked point (the board's middle, or the truck for a 5-0) passed the
  end. With a 50-50, the trailing truck's inner wheel was then still on the top: the
  board rested on that one wheel with its outer side over nothing, rolled off it
  (≈ 3.3 rad/s) and landed on its side, a bail every time. So on a one-sided edge the lock
  holds on past the end (the edge line extended, the stance PD still levelling it) until
  that trailing inner wheel has cleared the end by its radius. It then lets go level and
  lands on four wheels. That is about 0.05 s at 4 m/s, and it adds no thrust.
  Scenarios: a 50-50 and a 5-0 off the end of the Street Course's long ledge, of the 7-stair
  hubba and of El Toro's planter ledge.
- **Fall off**: see Balance.
- The trick controller skips the edge it just left in the airtime prediction. In the air,
  that prediction also looks for edges along the board's path (within
  `airtimeEdgeRadiusM`, and below the apex), so a flip onto a rail or the hubba finishes
  before the lock.

### Recognizer: grind events and lines (`tricks`)

- The recognizer reads `RiderPose.grind`, `lastGrindExit` and `popOutTurnRad` (structural
  port) and emits the new shared events `GrindStarted { grind, side, name, obstacleId,
  surface }` and `GrindEnded { …, durationS, exit }`.
- Names are data (`GRIND_NAMES`): stance words, side words ("FS" / "BS"), the line joiner
  " → ", the " out" suffix, and the tricks left out of lines (a plain "Ollie").
- **A line** starts at the first grind and runs to the final clean landing:
  - the air into a grind is named once the lock has settled (`grind.entrySettleS`: the
    stance assist finishes the last bit of the flip). A slide's quarter turn is taken
    off the body spin;
  - the air out of a grind is named with " out", with the body's own turn out taken off;
  - wheel touches and takeoffs while locked are not landings or airs;
  - an air that began at the lock's release starts right away, because on a rail there is
    no `BoardLeftGround`, and a pop out attaches its `BoardPopped` to it;
  - the landing publishes `TrickLanded` with the whole line as its name, so the popup
    shows it. A `RiderBailed` in a line publishes `TrickBailed` named with the line so far.
- The landing tilt is now judged against the landing surface (`surfaceUpDot`), so a pop
  out back into a transition can land clean.

## Consequences

- The scenarios G1–G7 in `src/game/scenarios/grinds.scenario.test.ts` run headless on the
  park. G4, the stairs line, is written out as a key timeline and is the montage clip
  `stairs-tailslide-hardflip`. The test asserts they are identical, and a ±0.03 s shift
  of the last catch still lands.
- G4 is tight in the current park, because the pop is at most 0.45 m and the hubba stands
  0.35 m above the nosings:
  - it needs W with the kickflip (the level's height bonus);
  - the quarter turn has to come late (the tail must not swing into the hubba's side
    before the board is above it);
  - the pop out is halfway down the slope (lower down, the air is too short for a hardflip).
- The assists (lock, stance, gravity carry) hold the board without collider contact. A
  lock can therefore not be knocked off by the edge's own geometry, only by the balance or
  the end. Other obstacles still collide normally.
- The locked point hovers 4 mm above the edge, which you cannot see. `SurfaceContactStarted`
  is therefore not emitted for the locked part.
