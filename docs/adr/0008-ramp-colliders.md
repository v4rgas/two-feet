# ADR 0008: Ramp colliders are convex pieces with buried seams

- Status: accepted
- Date: 2026-09-26

## Context

M3 adds curved and angled obstacles: quarter pipes, banks, kickers, ledges, rails and a
stair set with a hubba and a handrail (REQUIREMENTS §1.8). The board rolls on four
**ball wheels** with zero solver friction (ADR 0003). A tyre model supplies grip and
rolling resistance, and it uses each contact's normal. So a ramp collider must give:

1. a smooth ride at 3–8 m/s (27 mm wheels, 1/120 s step, so 2.5–7 cm per step), with no
   bounce at the toe of a ramp, at the seams of a curved transition, or at the lip;
2. contact normals that follow the curve, so grip and rolling act along the slope;
3. a surface type per part: the coping of a quarter pipe must report `grindable` while
   its transition reports `ramp` (the M4 hook);
4. the same geometry for physics and rendering (STYLE.md: the player reads the physics
   from the visuals).

Rapier offers two ways to build a curved surface: a **triangle mesh** (optionally with
`FIX_INTERNAL_EDGES`), or a **compound of convex hulls**.

## What the headless scenarios showed

The first build used one convex piece per transition segment: the region under each
chord, down to the ground, with pieces meeting exactly at the seams. A board rolling at
4 m/s into the quarter pipe **jumped at the toe**. The nose wheels got a contact normal
tilted 21–40° backward, and the board flew into the transition and bounced back.

The cause is Rapier's **speculative contacts**. The narrow phase makes a contact for any
pair closer than the prediction distance (`normalizedPredictionDistance` 0.02 ×
`lengthUnit` 1 = **2 cm** by default). The solver then limits the approach speed along
that contact's normal to gap/dt. A ball rolling toward an **exposed edge** has the edge
as its closest feature while it is still a few centimetres away. The normal points from
the edge to the ball centre, tilted by up to 40°, and the gap is only millimetres. The
ball's approach speed along that normal (v·sin 40°) is far above gap/dt, so the solver
applies a large impulse. This is a "ghost collision". It happens at every seam where a
piece's end edge lies on the riding surface: the toe (ramp against ground), each
transition seam in both directions, and a convex lip where the next piece has a vertical
face.

The same thing happened at the coping. A pipe that bulges p past the wall crosses the
wall at a concave kink of acos(1 − p/r). That is 26° for 3 mm on a 3 cm pipe, and 48° for
a coping centred on the lip, and it knocked the board back at 7 m/s.

## Decision

**Obstacles are data. The world domain turns them into convex pieces, and physics and
rendering both use those pieces.**

- `world/domain/obstacle-geometry.ts` holds the pure functions. `obstacleGeometry(obstacle)`
  returns a list of `ConvexPiece`s: vertices, and outward-wound faces with a render tone
  (`body`, `edge` or `metal`). Each piece has its own `SurfaceType`.
- `obstacleCollider(obstacle)` is structurally a board `StaticColliderDesc` with a new
  `compound` shape: one convex-hull part per piece, each with its own surface. A plain
  `box` (the ground) stays a Rapier cuboid. `RapierPhysicsWorld` creates one collider per
  part and records each part's surface, so `BoardContact.surface` and
  `SurfaceContactStarted.surface` come out per part. A truck on the coping reports
  `grindable`, and on the transition it reports `ramp`.
- `level-mesh.ts` triangulates the same faces (fans, non-indexed, so the normals are
  flat), with one mesh per obstacle and tone.

**Convex pieces, not a triangle mesh**, because:

- Every piece is a closed, solid volume. A fast or landing board can't tunnel into the
  back of a thin shell, and there are no one-sided or back-face contacts to handle.
- Internal-edge fixing would only help inside one mesh. The worst ghost edges are
  *between* colliders (ramp toe against the ground box, deck against coping). Those need
  the geometric fix below anyway, and once that fix is in, it also covers the internal
  seams.
- Each piece is a few vertices. The narrow phase handles ball against polyhedron cheaply
  and exactly, and the tests can check the pieces directly (outward faces, convexity,
  closed surface).

**Seams are buried below the contact prediction distance.** Three rules in the
generator remove every exposed edge on a riding surface:

1. **Chord overlap.** Each transition segment's chord runs on past both of its seams,
   along its own line, far enough that its end edge is `seamBuryM` (2.5 cm, more than the
   2 cm prediction distance) under the neighbouring segment's surface:
   e = seamBuryM / sin(kink). On a concave curve, a chord extended outside its segment
   always stays under the arc, so the overlap is invisible. At the toe, the first chord
   runs on under the ground. The same rule buries a bank's toe. Forward extensions stop
   at the lip, because past it they would poke above the deck. The seams just below the
   lip are therefore buried less deeply (≈ 1 cm), which is acceptable because boards
   there are slow or airborne.
2. **Faces that continue the surface at a convex lip.** The quarter pipe deck's front
   face runs down the wall's tangent at the lip, not straight down, so a wheel leaving
   the wall never sees a vertical face's edge. The stairs platform has no separate
   run-up bank. When a slope leads onto it, the slope is part of the same convex piece.
3. **Flush coping.** The coping polygon is turned so one facet lies along the wall, 1 mm
   behind it (`copingInsetM`), and its top stands `copingRevealM` (4 mm) proud of the
   deck. That reveal is what trucks will lock onto in M4. Wheels roll up the wall and off
   the lip without hitting a bump.

**Tessellation:** at most 4° per transition segment (`maxSegmentAngleRad`). Each real
seam still turns the wheel's velocity by up to 4°. A plastic contact costs about
sin²(4°) ≈ 0.5% of the energy per seam, so a full climb and return at 4 m/s comes back
at 3.5 m/s. Finer segments cost less energy but need longer overlaps, because
e ∝ 1/sin(kink).

**Tyre model on slopes:** no change was needed. `tyreForces` already builds the rolling
direction by projecting the wheel's heading onto the **contact plane** and takes the
lateral direction as normal × rolling. Wheel loads come from the contacts' normal
impulses. Grip, rolling resistance, lean and steer therefore all follow the ramp
surface. `board.config.ts` is unchanged.

## Consequences

- The headless scenarios in `src/game/scenarios/ramps.scenario.test.ts` pin the
  behaviour: a quarter pipe at 4 m/s (climbs, stalls at ≈ 1.2 s below the lip, returns
  fakie at ≈ 3.5 m/s, four wheels down every step), the same quarter pipe at 7 m/s (four
  wheels on the wall to the lip, then airborne well above the coping), a 20° bank
  (creep ≤ 6 cm/s, carving uphill with a lean), a kicker launch, a 5-stair at 4.5 m/s,
  and grindable or ledge contacts on a rail, a handrail and a hubba.
- `seamBuryM` is tied to the engine's prediction distance. If
  `integrationParameters.normalizedPredictionDistance` or `lengthUnit` ever changes,
  `seamBuryM` must stay above it, or the ghost bounces come back.
- The overlapping pieces share coplanar side caps (z = ±width/2). They have the same
  tone and the same normal, so the renderer shows no z-fighting.
- The grip damper cannot hold a board still across a slope: it creeps at
  F_gravity / (4 · c) ≈ 4 cm/s on a 20° bank. That reads as a slight slip, not a slide.
  A static grip term could remove the creep later if it turns out to matter.
- `BoardLanded` gains an optional `surfaceUpDot`: the board's up vector dotted with the
  mean normal of the wheel contacts. On a ramp, that is what "landed level" means. The
  rider still uses `upDot` for now (see the M3 hand-off).
