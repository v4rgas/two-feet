# ADR 0012: Assists (human timing without changing the feel)

- Status: accepted (implements MECHANICS.md "Assists: human timing without changing the feel").
  Amended 2026-09-27: the levels were removed (see "Update: one mode").
- Date: 2026-09-27

## Context

The G4 line and the park tricks worked for a script but not for a person: catch windows of
±0.03 s, about 10 cm of lateral accuracy on the ledges, and exact lock-in timing. The spec
asks for assists that widen **when** and **where** an input counts, and never change how the
board moves while riding.

## Decision

### One config block, a runtime level (superseded: see "Update: one mode")

`RIDER_CONFIG.assist` holds each level's tunables (`pro`, `normal`, `easy`) plus shared
constants. `pro` is all zero: the game without assists. The **active level** is runtime state,
not config:
- `RiderSystem.assistLevel` is read every step, and it reaches the trick controller as
  `FootForceInput.assistLevel`;
- the game starts at the saved level (`LocalStorageAssistLevelRepository`, key
  `skate.assistLevel`) or `assist.defaultLevel` (`normal`);
- F2 cycles pro → normal → easy, and the dev tuning panel has an "assists → level" dropdown;
- the HUD shows it discreetly in the stance label ("regular · normal · ollie …"). Nothing
  ever announces that an assist fired;
- `composeSimulation`, the scenario harness and montage clips default to `pro`. A clip can set
  `assistLevel`. The harness follows `SKATE_ASSIST`.

| Tunable | pro | normal | easy |
|---|---|---|---|
| `catchBufferS` | 0 | 0.15 | 0.25 |
| `catchLateS` | 0 | 0.06 | 0.1 |
| `stanceKeyGraceS` | 0 | 0.15 | 0.25 |
| `swipeGraceS` | 0 | 0.05 | 0.08 |
| `magnetReachM` / `magnetMaxMps` | 0 / 0 | 0.25 / 0.35 | 0.4 / 0.35 |
| `lipCatchBelowM` | 0 | 0.06 | 0.1 |
| `parallelWidenRad` / `perpWidenRad` | 0 / 0 | 0.11 / 0.19 | 0.2 / 0.3 |
| `lockTiltWidenRad` (flip-in catch) | 0 | 0.7 | 1.0 |
| `spinSnapRad` | 0 | 0.35 | 0.5 |
| `popOutMinAirPerTurnS` | 0 | 0.36 | 0.42 |
| `popOutBufferS` | 0 | 0.12 | 0.2 |
| `balanceDriftCut` / `balanceEaseS` | 0 / 0 | 0.4 / 1 | 0.6 / 1 |

Shared constants: `catchFireFlipLeftRad` 0.15, `catchFireShoveLeftRad` 0.4,
`catchFireAirLeftS` 0.1, `magnetAccelMps2` 8, `magnetLeadS` 0.3, `magnetGrindBandM` 0.03,
`magnetSlideMarginM` 0.03, `stanceKeyMinHoldS` 0.25, `stanceKeyAfterPopS` 0.05,
`spinSnapReleasedStick` 0.3, `spinSnapAccelScale` 2, `graceLetGoStick` / `graceLetGoS`
0.25 / 0.03, `lipCatchLevelMps` 0.3, `flipInDoneRad` 0.1, `balanceEaseMaxS` 1, and the
approach search (`approachHorizonS` 1, `approachStepS` 0.01, `approachCentreAboveM` 0.06,
`approachMaxOffsetM` 0.8).

### The assists (rider domain)

- **Catch buffer (smart firing).** At normal and easy, a Space in the air arms a request
  instead of trying once and locking out (`catchRetryS` stays for pro). The request lives for
  `catchBufferS` until the board enters the cone (`catchConeMiss`). Once it is in the cone it
  waits there for the best moment: every running flip within 0.15 rad of its target and every
  shove within 0.4 rad (the scripted "well-timed" catch), or touchdown within 0.1 s. If the
  board leaves the cone first, the request is spent. A well-timed press fires on the same step
  as at pro. An early press no longer grabs a combo at |ω| just under 14, which the old
  warning said a naive buffer would do.
- **Late catch.** A Space within `catchLateS` after touchdown is the catch, not a push. If a
  foot is off and the board is within the landing tilt, the feet go on.
- **Stance-key grace.** ↓ / W count when held within `stanceKeyGraceS` before the lock-in, but
  only if held at least `stanceKeyMinHoldS`: otherwise the level tap (W) turned 50-50s into
  nosegrinds. The pop foot's own kick pressed again after the pop (↓ for the tailslide) counts
  from `pop + 0.05` s up to the lock, with no minimum hold. After the lock-in,
  `GrindController.press` turns a 50-50 into a 5-0 / nosegrind and a boardslide into a
  tail / noseslide.
- **Swipe grace.** A swipe that ended up to `swipeGraceS` before the pop counts once the foot
  is back near the middle for 0.03 s. A key still held on that edge is a pre-position (the
  360's → during the load), not a rushed finger.
- **Lock-on magnetism.** The trick controller finds the edges the board comes down onto
  (`approaches`: sampling the ballistic path, the moment it descends to edge height over the
  segment). It works out where the board centre must come down for the stance it is in:
  trucks on the line for a grind, the deck middle or the tail / nose part for a slide. It then
  nudges the velocity **square to the travel** (the speed along the path is unchanged, net
  |nudge| ≤ 0.35 m/s, changing ≤ 8 m/s²). It acts only on the final approach (≤ 0.3 s), and
  only once no flip, shove or body spin is running. Earlier it guessed the wrong stance
  mid-flip and pulled G4 boards into the hubba.
- **Lip catch.** A lock part up to `lockBelowM + lipCatchBelowM` below the edge top, rising or
  roughly level, and within reach square to the edge, locks (the lock PD lifts it).
- **Angle bands.** The parallel and perpendicular tolerances widen (0.55 / 0.80 rad at normal).
- **Flip-in catch.** A board up to `lockTiltWidenRad` further from upright than
  `lockMaxTiltRad`, turning slower than `catchMaxOmegaRadps`, still locks. The stance PD then
  finishes the roll capped like the catch (≤ 60 rad/s², eased over `catchReachS`).
- **Quarter-turn helper.** When Q / E is released in the air with an edge ahead, and the body
  would stop within `spinSnapRad` of a stance angle to that edge (a multiple of 90°), the
  `Rider` eases it to a stop exactly there (`FootForceOutput.spinSnapHeadingRad`).
- **Pop-out airtime floor.** The first flip / shove of an air that started with a pop out gets
  just enough extra **vertical** impulse for turns × `popOutMinAirPerTurnS` of predicted air.
  Turns = flip units, or shove half-turns / 2. The trick's rate uses the boosted airtime.
- **Pop-out buffer.** A load (↓ + S) held in the air before the lock-in is kept, up to
  `popOutBufferS` of it.
- **Balance ease.** The drift is scaled by 1 − `balanceDriftCut` for the first
  `balanceEaseS` (never more than 1 s) of a grind.

No assist creates thrust. The only speed changes are the pop-out floor (vertical) and the
magnet (square to the travel, ≤ 0.35 m/s).

### Level design (world)

The G4 entry failed on geometry, not timing. The hubba's flat top was one tread (0.32 m), so a
board that came down a hair early, or was still finishing its flip, hit the hubba's **end
face**. Its lock window was about 0.06 s of pop time at pro. `HubbaParams.flatTopM` (park:
0.9 m) extends the flat top back onto the platform, with the same generator for colliders and
edges. The window is now about 0.24 s (pops at 0.68–0.92 s). I also tried a 1.5 m flat top:
the flipping board then clipped the top earlier, with no gain. A kinked-down rail lead-in
made boards lock on it and stall at the kink, so it is not used.

### Human lines and the jitter test

The scripted lines sat at the edge of their windows, so they were re-centred the way a person
would play them: full loads (≥ 0.36 s), 0.12 s taps, each catch and pop in the middle of its
window. G4 is now: pop 0.8 s, ↓ again and Q at 1.05, Space 1.3, S 1.25, release ↓ at 1.5,
hardflip at 1.54, Space 2.09 (pro window 2.06–2.12). Kickflip-stairs: pop 2.62 s, Space 3.14.
Rail: pop 0.96 s. 360 flip: pop 1.76 s, Space 2.26. The montage clips and the G4 scenario
share these timelines.

`human-jitter.ts` perturbs a clip with a seeded RNG: key times ± 70 ms, holds ± 40 ms, spawn
± 0.2 m sideways, ± 0.3 m/s. Presses of the same key keep their order at least 30 ms apart. It
plays each run through the scenario harness. The rail run balances like a person watching the
bar (A + ← / D + → past |0.25|, 0.15 s late). `human.scenario.test.ts` runs 50 seeds per
line and level (`pnpm test:human`, ≈ 70 s), with floors just under the measured rates. The
last rates measured per level, before the levels were removed:

| Line | spec (normal) | pro | normal | easy |
|---|---|---|---|---|
| G4H kickflip → FS tailslide → hardflip out | ≥ 80 % | 4 % | 14 % | 20 % |
| kickflip down the 5-stair | ≥ 90 % | 44 % | 96 % | 100 % |
| ollie to 50-50 on the rail | ≥ 90 % | 24 % | 52 % | 52 % |
| 360 flip off the kicker | ≥ 90 % | 46 % | 58 % | 62 % |

## Consequences

- **G4H, the rail and the kicker miss the spec's targets.** What limits them (measured):
  - **G4:** the first air. The capped kickflip plus its settle (≈ 0.45 s) must finish within
    ≈ 0.5 s above a 0.35 m hubba on a 0.45 m pop. Jittering one key at a time on the
    re-centred line: Q 100 %, A 100 %, S 100 %, Space 100 %, W 86 % (the level's height
    bonus), ↓ 74 % (the pop time). Jittering one component at a time: speed alone 84 %,
    lateral alone 70 %, all key timing 26 %. Only about 30 % of fully jittered runs lock the
    tailslide at all. The rest are boards still flipping or turning when they reach the
    hubba, or boards too low to clear it. The assists act sideways and in time, so they
    cannot move that along-path window. Doing that would need an along-path assist or a
    change to core feel: pop height, the flip cap, the obstacle's height.
  - **Rail:** the along-path pop window for an in-line approach is ≈ 0.26 s (pops at
    0.84–1.10 s), against ± 0.11 s of pop jitter plus ± 0.3 m/s over a 3.8 m run-up. Boards
    that lock in the first ~10 cm put the tail truck into the bar's end and stall.
  - **Kicker:** half of the misses read no flip and no shove. This was first put down to a
    diagonal stick (↓ + →) reading ↓ at only 0.71 and popping at once; measured, that is
    not so: the keyboard's virtual stick is per axis, so ↓ + → is (1, −1) and the pop comes
    at the ↓ key-up (checked headless and in the browser). The real cause: ↓ let go just
    before the lip pops ≈ 25 ms later (the stick's fall to `popReleaseStick`), by which time
    the wheels had left the kicker. The pop was then skipped, the load was kept, and it
    popped at the NEXT touchdown (a surprise pop, named "Ollie"). Fixed for every level
    (2026-09-27): a load carried off a lip still pops within `tricks.popLipGraceS`
    (0.04 s, the stick's release lag) and the recognizer takes a pop up to
    `session.popAfterTakeoffWindowS` (0.05 s) after takeoff as that air's; later the load
    is dropped and never pops at touchdown. Also, a READY load whose key is still held
    never pops, whatever its stick does (`FootIntent.held`), which covers an analog stick
    whose diagonal does read 0.71. The rates rose from 38 / 42 / 44 % to 44 / 54 / 58 %
    (46 / 58 / 62 % once the feet kept their deck spots on tilted boards, the feet-lag fix);
    the remaining misses release ↓ well after the lip, or time the flick and sweep out of
    their windows.
- (Until the levels were removed) every existing scenario passed at `pro` and at `normal`
  (`pnpm test` ran the scenario suites in both projects), and `montage:verify` was 9/9 at `pro`.
- Pro was unchanged: every assist is gated on its tunable being non-zero, apart from the
  scripted lines and the park geometry, which the pro tests also used.

## Update: one mode (the levels removed, user decision, 2026-09-27)

The player asked to "remove the difficulty stuff, leave only easy mode as the default".
MECHANICS.md "Assists" now says there is one mode.
- `AssistLevel`, `ASSIST_LEVELS`, `nextAssistLevel`, `isAssistLevel`, the per-level
  presets, `RiderSystem.assistLevel`, `FootForceInput.assistLevel`, the F2 key, the HUD
  "· normal" label, the tuning panel's level dropdown and `LocalStorageAssistLevelRepository`
  are gone. `RIDER_CONFIG.assist` holds the former `easy` values directly (still editable in
  the dev tuning panel). The boot removes the old `skate.assistLevel` key from localStorage
  (`game.obsoleteStorageKeys`, in a try/catch).
- Tests run once, in the one mode (`vitest.config.ts` has one project; `SKATE_ASSIST` and
  `assist-level.scenario.test.ts` are gone). The one test that pinned `pro` behaviour (the
  catch lockout outside the cone) now checks the catch buffer instead: a press outside the
  cone applies nothing, fires on entering the cone within `catchBufferS`, never later.
  The montage clips run in the one mode and `montage:verify` is 9/9 with no re-timing.
- `pnpm test:human` measures each line once (≈ 30 s). Measured: G4H 20 %, 5-stair
  kickflip 100 %, rail 50-50 52 %, kicker 360 flip 62 % (the old `easy` column). The
  floors sit just under: 0.18, 0.96, 0.48, 0.58.

