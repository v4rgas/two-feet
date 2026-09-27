# ADR 0003 — Wheel model: real wheel colliders + a tyre model

- Status: accepted
- Date: 2026-09-26

## Context

REQUIREMENTS §1.4 lets us model the wheels either as raycast suspension or as real
colliders, and asks us to pick the more stable option at the fixed 1/120 s step. The
model must give:

- low rolling friction along the board's X axis and strong sideways grip,
- trucks that steer in proportion to deck lean (carving),
- a clean pop: the tail strikes the ground while the board pivots on the rear axle,
- landings that neither bounce nor explode.

The board weighs about 2.2 kg. The rider is not a rigid body: they act on the board only
through foot forces, including a standing press of several hundred newtons.

### Why not raycast suspension

A spring that holds up a 2.2 kg board plus a ~500 N rider press over a few millimetres of
travel needs k ≈ 50–100 kN/m. Per wheel (≈ 0.55 kg), that gives ω = √(k/m) ≈ 300–430
rad/s, so ω·dt ≈ 2.5–3.6 at 1/120 s. That is past the stability limit of the explicit,
semi-implicit Euler integration that user forces get (about ω·dt < 2). A spring soft enough
to be stable sags by centimetres under the rider and bottoms out. The pop also depends on
an impulsive reaction at the rear axle: the tail goes down while the rear wheels push up
within the same step. A spring cannot produce that reaction in one step, so the rear of
the board sinks before it pivots.

## Decision

**Wheels are real colliders.** The board is one dynamic Rapier body in the board frame
that carries compound colliders:

| Part | Collider |
|---|---|
| `deck` | round cuboid over the flat section |
| `nose`, `tail` | round cuboids tilted up by `kickAngleRad`, so the tail and nose can strike |
| `noseTruck`, `tailTruck` | baseplate block plus hanger block, both above the wheel bottoms |
| 4 wheels | balls at `BoardSpec.wheelCenterLocal`, with radius `wheels.radiusM` |

Each collider has the mass of its part, so Rapier computes a realistic centre of mass
(below the deck) and a realistic inertia. The roll inertia is I_xx ≈ 0.0096 kg·m². CCD is
on, and the body never sleeps.

**The solver only supports the board.** Wheel colliders have friction 0 and restitution
0. The static colliders use the `Multiply` combine rule, which wins over the board's
rules, so the wheels stay frictionless on every surface. The deck, tail and trucks get
`deckFrictionCoeff × surfaceFriction[surface]`. Rigid contacts make resting stable
(settles at `restHeightM` within 0.1 mm, with no drift) and make the pop pivot crisp.
Zero wheel restitution makes a landing plastic: a drop from 0.5 m settles in one step
with no bounce.

**A tyre model supplies everything that happens along the ground.** It lives in
`board/domain/tyre-model.ts` as pure functions. `PhysicsBoardSystem.prePhysics` applies
its output through the port (`applyForceAtPoint` at each wheel contact) before every
step. Its inputs are the wheel contacts of the previous step. Each contact carries its
normal impulse, and N = impulse / dt:

- **Sideways grip.** A velocity damper along the wheel's axle direction,
  F = −c·v_lat, capped at `lateralGripCoeff · μ_surface · N`. A damper is
  unconditionally stable while c·dt / m_eff < 1. With c = 40 N·s/m per wheel and the
  2.2 kg board, the stability limit is about 60. Sideways slip then decays with
  τ ≈ 15 ms. We use a damper and not a velocity-kill impulse because the damper does not
  need the body's effective mass, which the port does not expose.
- **Rolling resistance.** F = Crr · N along the rolling direction, faded linearly below
  `rollingResistanceFadeSpeedMps` so that a board at rest gets no force that jitters
  around zero. Only the rider's press force is simulated, not their mass, so N is
  scaled down to the board's own weight (`rollingLoadScale`). The deceleration then
  stays Crr·g ≈ 0.15 m/s² however hard the rider stands. Without this, a 500 N press
  would stop a 2.2 kg board in about a second.
- **Trucks and lean.** The wheels are rigid, so the deck does not physically roll on
  bushings. Lean is what the bushings would feel: the roll moment of the wheel loads
  about the board's long axis, M = Σ N_i · z_i. So `leanRad = clamp(M / bushingStiffnessNmPerRad, ±maxLeanRad)`,
  followed with a first-order lag (`leanResponseTimeS`). A rider standing off-centre, or
  any torque about board X, loads one side and so leans the board. Steer is
  `clamp(steerPerLean · lean, ±maxSteerRad)`. The nose axle's rolling direction turns
  by −steer about board +Y and the tail axle's by +steer. The grip damper then bends the
  path. At full lean the turn radius is ≈ 1.3–1.5 m at 3 m/s.
- **Landing compression.** A rigid, zero-restitution wheel contact absorbs the landing
  in one step, and the solver's contact softness (Rapier's default contact natural
  frequency) spreads it a little. The few millimetres that real urethane and bushings
  compress are below what the camera shows. If they are wanted for visual feedback, the
  presentation can derive them from `BoardContact.normalImpulseNs` without touching the
  physics.

### Sign convention (carving)

Positive lean means the +Z (right) wheels carry more load, which a torque about board +X
produces. It steers toward +Z. Rolling nose-first, the heading then turns **clockwise
seen from above** (yaw rate about world +Y is negative). In regular stance +Z is the toe
edge, so leaning on the toes carves frontside. The headless scenario "carves toward the
loaded side" pins this sign.

### Why the forces are in application, not infrastructure

The tyre model is game logic, not an engine feature: it decides what "grip", "steer" and
"lean" mean. It needs only the port (contacts with impulses, velocity at a point, apply
force at a point), so it stays pure, is unit-tested with a fake `BoardBody`, and would
survive a physics engine swap. Two things are Rapier-specific and live in
`RapierPhysicsWorld`: the frictionless wheel colliders with their combine rules, and the
reset of accumulated forces after every step.

### Hard landings: the landing settle

A zero-restitution rigid landing is plastic only when the solver serves all the wheel
contacts together. At 5–9 m/s (El Toro's 3.3 m drop lands at ≈ 8.6 m/s) the board moves
7 cm a step, so the wheels arrive a few millimetres deep (CCD) with no contact from the
step before, and the solver meets four fresh contacts with no warm start. Rapier's
TGS-soft solver works through them in the order of the world's contact pairs and
integrates positions between its substeps. The contact it serves first takes most of the
impulse and kicks the other axle up: a ≈ 5 cm nose skip at ≈ 3.4 rad/s that lasts
≈ 0.3 s. That order follows the number of static colliders, so adding one unrelated
collider 700 m away flipped a clean landing into a skip (and back). A pitched landing
(±0.1 rad) skipped every time: a rigid rod that slaps its second axle down rebounds the
first one (the ideal rigid answer, about half the slap's spin).

What we tried in the solver, on the flat with 0/1/2/3/5/20 extra colliders, 5–9 m/s,
level and ±0.1 rad:

| Knob | Result |
|---|---|
| `numInternalPgsIterations` 2 or 4 | fixes El Toro's order dependence, not the 9 m/s level case or any pitched case |
| `numSolverIterations` 16 | no better |
| prediction distance 8 cm, or soft CCD 0.1 m (no penetration any more) | skips move around, some become a real bounce |
| `maxCcdSubsteps` 4 | fewer skips, still order-dependent |
| wheel friction/restitution combine rules | already `Multiply` × 0 = 0: not the cause |

None made the outcome independent of the order, and the pitched rebound is what a rigid
solver should do. A real board does not do it: the urethane and the bushings soak up
the rebound. So the board models that, not the solver.

**Decision.** A touchdown that hits the surface at ≥ `landing.minImpactMps` (1.5 m/s,
the velocity before the step along the wheel-contact normal) opens a settle window of
`landing.settleWindowS` (0.12 s). In it, before each step, `PhysicsBoardSystem` asks
`landingSettleImpulse` (`board/domain/landing-settle.ts`, pure) for one impulse. It looks
at the wheels that are not down but hang within `landing.gapM` (3 cm) of the contact
plane (through the down wheels' mean contact point, along their mean normal). If their
mean bottom point moves away from the plane, the impulse along −n at that point turns
the separation into a small closing speed (half the gap per step, at most
`maxCloseMps`), with the body's effective mass there (`1/m + (r×n)·I⁻¹(r×n)`). It never
acts along the ground (no thrust), never on wheels moving toward the plane (a tail-first
landing still rotates down onto its nose freely), and never on a separation faster than
`maxReboundMps` (2.5 m/s: a pop or a manual, not a rebound).

**Result** (`infrastructure/hard-landing.test.ts`): 5, 7 and 9 m/s, level and ±0.1 rad,
two drop heights, with 0, 1, 5 and 20 far colliders. Four wheels are down within 3 steps
every time, they stay down, the board never rises 2 mm above rest height, and it rolls
to the same spot (±1 cm) whatever the collider count. El Toro's board-only drop is back
to the strict "four wheels within 3 steps" with 0, 1 and 20 extra colliders. The rider's
landing assist (`tricks.landAssist`, MECHANICS "Land") still damps bounce and rocking on
top of this; the settle is what makes the board alone deterministic.

### Contacts

`contacts()` walks the narrow phase for every board collider against the static
colliders. It reports each manifold point within `wheelContactToleranceM`, with the part,
the surface, the obstacle id, the world point, a normal pointing from the surface toward
the board, and the normal impulse. Rapier keeps a manifold across small motions without
refreshing `contactDist`, so the gap is measured from the collider-local contact points
at their current poses.

## Consequences

- Tuning numbers that the headless scenarios pin (`infrastructure/rapier-physics-world.test.ts`):
  - **Pop:** 4 N·s straight down on the tail tip of a board at rest. The tail strikes
    and the nose rises to ≈ 0.43 m. 5 N·s gives a short hop and 8 N·s about 0.2 s of
    air. The board alone has no rider mass, so the rider's pop impulse should start
    around 4–6 N·s.
  - **Flip:** 0.13 N·m·s about board X during an ollie with 2.5 m/s take-off turns
    ≈ 2π (0.99 turns) and lands on four wheels. As an edge flick at |z| ≈ 0.105 m, that
    is ≈ 1.2–1.3 N·s of vertical impulse. The `rider` default of 0.5 N·s gives only
    about half a flip.
- The deck never visibly leans on its trucks. Lean is a load-based state
  (`PhysicsBoardSystem.leanRad`). The renderer may tilt the deck mesh by it, as a pure
  visual effect.
- The grip damper allows a small slip angle in hard carves (understeer). This is
  acceptable and tunable through `lateralGripDampingNsPerM`, up to the stability limit.
- The hard-landing settle is a board rule, not a rider assist: it runs with or without
  a rider, and also on a bailed (ragdoll, ADR 0013) board. There it only removes an
  axle's rebound after a hard wheel touchdown, as the urethane would.
- `BoardSystem.lastForces` exposes the tyre forces (`grip`, `rolling`) to the debug
  overlay. `GameLoop` adds them as `DebugVector`s with `foot: null`.
