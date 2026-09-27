# world

Levels, obstacles, surface types.

## Ubiquitous language

- **Level** (aggregate): a list of obstacles plus a spawn. It guards unique obstacle ids and valid shape parameters.
- **Obstacle** (entity): id, name, main surface type, transform, and a **shape**. The shape is only parameters, never vertices.
- **Obstacle shapes** (VOs, built with the validating `ObstacleShape.*` factories). Ramp-like shapes rise toward local +X from their toe at x = 0, and their width runs along Z.
  - `box`: half extents. Used for the ground.
  - `quarterPipe`: radius, height (at most the radius), width, deck depth, coping radius. It has a circular transition, a flat deck, and a `grindable` coping flush with the wall.
  - `bank`: angle, slope length, width. A wedge.
  - `kicker`: length, height, width. A circular arc tangent to the ground, ending at the lip.
  - `ledge`: length (along X), depth, height, edge chamfer. Its chamfered top edges are drawn darker. The whole ledge is `ledge`.
  - `rail`: length (along X), top height, `round` or `square` profile, bar radius. The bar is `grindable` and stands on two posts.
  - `stairs`: step count, rise, run, width, top platform depth, an optional roll-up back slope (`roundedBackSlope`: its toe and crest rounded like a funbox bank's), and an optional hubba (+Z side, or both sides with `bothSides`: a `ledge` with a `grindable` steel edge; its flat top reaches `flatTopM` back onto the platform, default one tread, 0.9 m on the Street Course so a board coming down a little early lands on it, not its end face: ADR 0012) and handrail (−Z side, or down the middle with `centered`; `grindable`; `heightM` square to the line of nosings; its bar runs `topOverhangM` back over the landing past the top nosing and `bottomOverhangM` on past the foot, twice `railPostInsetM` = 0.7 m each by default: 0 / 0 for the Street Course's low centre rail so it never stands taller over the landing nor sinks toward the ground; a short bottom overhang ends El Toro's rail in the air; `handrailSpanXM` gives the span, null without a handrail). The steps go down toward +X from the top nosing at x = 0. A one-step `stairs` is a raised platform (the Street Course's euro gap).
  - `funbox`: a flat top (`topLengthM` × `topWidthM`, `heightM` up, centred on the origin); each side is a `bank` (at `bankAngleRad`), a `wall` or a `ledge` (a wall with a chamfered, grindable top edge). Two banks meeting at a corner make a hip. The top, banks, rounded crests and rounded hip ridges are ONE convex piece (the intersection of their half-spaces: no seam on the top or at the crests); each bank's concave toe is a rounded fillet of convex pieces with buried seams (ADR 0008). Optional `topRail` (a flat bar across the top along X) and `bankRail` (a down rail: flat on the top, then down a ±X bank).
  - `kinkedRail`: a round bar along X, flat → down → flat (`flatTopM`, `downRunM`, `dropM`, `flatBottomM`, `heightM` of the bottom flat), on posts. One convex piece per run: at the convex kink the upper run reaches over it (clipped to the next run's top) and the lower run starts `seamBuryM` below, at the concave kink both runs overlap under each other, so no seam edge sits on the bar's top.
  - `bankLedge`: a bank (rounded toe) rising toward +X to `bankHeightM`, into a chamfered concrete ledge block standing `ledgeHeightM` above the bank's top edge.
- **Obstacle geometry** (`obstacle-geometry.ts`, pure). Besides extrusions, a piece can be built as the intersection of half-spaces (`halfSpacePiece`: vertices where three planes meet, faces sorted around each plane), which is how the funbox, the kinked rail's runs and the rounded toes are made: `obstacleGeometry(obstacle)` returns **convex pieces**. Each piece has vertices, outward-wound faces with a render tone (`body`, `edge` or `metal`), and its own surface type. Physics and rendering both use these same pieces (ADR 0008). The tessellation settings are in `WORLD_CONFIG.geometry`.
- **Obstacle collider** (`obstacleCollider(obstacle)`): structurally a board `StaticColliderDesc`. It is a box for `box` shapes, and a `compound` of convex hulls (one per piece, each with its surface) for everything else.
- **Grind edge** (VO, `grind-edges.ts`, pure, M4): `obstacleGrindEdges(obstacle)` gives every edge a board can grind or slide on as a straight segment on top of the edge's profile, in the world frame: `startM`, `endM`, `outwardNormal` (horizontal, away from the obstacle), `surface`, `obstacleId`, `twoSided` (a bar: rail, handrail) and `halfWidthM`. Rail bar, coping (out over the transition), hubba steel edge (a flat segment on the platform and a sloped one), ledge top edges (where the top face meets the chamfers) and handrail. Queries: `grindEdgesNear(edges, point, radius)` (nearest first), `nearestGrindEdge`, `closestOnEdge`. See [ADR 0009](../../../docs/adr/0009-grinds.md).
- **Surface type** (VO): `ground | ramp | grindable | ledge`. Contacts and `SurfaceContact*` events carry it per piece, for example `grindable` for a truck on the coping or a rail.
- **Spawn** (VO): a ground point plus a heading. The board adds its own rest height.

## Levels and maps

The world context owns the obstacle **kinds** and their geometry, and the `Level`
aggregate. It holds no playable layout: every map is data in its own folder,
`src/maps/<id>/` (GAME.md "Maps", [ADR 0014](../../../docs/adr/0014-maps-and-game-shell.md)),
built from these kinds.

- **Ground slab** (`groundObstacle({ halfSizeM, thicknessM })`): one `ground` box, id
  `ground`, whose top face is at y = 0. Every map stands on one.
- **MapDefinition** (`map-definition.ts`): the shape of a map folder's `map.ts` export:
  `id`, `name`, one-line `description`, `spawn`, `createLevel(): Level`, optional
  `tutorial`. `isMapDefinition(value)` recognises one (the game's registry uses it). It is
  here, not in `src/game`, so a map folder depends only on this context's public API.
- The shipped maps: `src/maps/street/` (the Street Course, the default: a contest plaza
  with a 7-stair and hubbas, rails, ledges, a funbox, banks and quarter pipes; its layout
  and parameters in `street.config.ts`, described in `street-course.ts`) and
  `src/maps/flat/` (flat ground, where the tutorial runs).

## Public API (`index.ts`)

- Types: `Level` (+ `Level.create`), `Obstacle`, `ObstacleShape` (+ factories), the shape interfaces, `Spawn`, `SurfaceType`, `ObstacleId`, `ConvexPiece`, `GeometryFace`, `FaceTone`, `ObstacleGeometry`, `ObstacleColliderDesc`.
- Grind edges: `GrindEdge`, `GrindEdgeHit`, `obstacleGrindEdges`, `levelGrindEdges`, `grindEdgesNear`, `nearestGrindEdge`, `closestOnEdge`.
- Maps: `MapDefinition`, `isMapDefinition`, `groundObstacle`, `GroundParams`.
- Functions: `obstacleGeometry`, `shapeGeometry`, `obstacleCollider`, and shape helpers (`quarterPipeLipXM`, `quarterPipeLipAngleRad`, `quarterPipeCopingProfile`, `kickerRadiusM`, `kickerLipAngleRad`, `stairsHeightM`, `stairsSlopeRad`, `stairsFootXM`, `handrailZM`, `handrailSpanXM`, `funboxBankRunM`, `kinkedRailTopLine`, `bankLedgeRunM`).

## Known rider limitation (hand-off)

A 50-50 on the kinked rail carries across the convex kink onto the run down (`continueGapM` / `continueOnto` works: one lock, scenario in `street.scenario.test.ts`), but the lock holds the board's MIDPOINT on the current run: at the convex kink the tail truck then rests on the upper run while the board pivots (it loses ≈ 1/3 of its speed), and at the concave kink (onto the bottom flat) the rigid board wedges between the two runs and stalls. The lock should target the chord between the two trucks' points on the polyline while it straddles a kink.
- Config: `WORLD_CONFIG` (only `geometry`: how the kinds are tessellated).

## Events

Emits none and consumes none.
