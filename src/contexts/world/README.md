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
  - `stairs`: step count, rise, run, width, top platform depth, an optional roll-up back slope (`roundedBackSlope`: its toe and crest rounded like a funbox bank's), and an optional hubba (+Z side, or both sides with `bothSides`: a `ledge` with a `grindable` steel edge; its flat top reaches `flatTopM` back onto the platform, default one tread, 0.9 m in the park so a board coming down a little early lands on it, not its end face: ADR 0012) and handrail (−Z side, or down the middle with `centered`; `grindable`; `heightM` square to the line of nosings; `overhangM` is how far the bar reaches back over the landing and on past the foot, default two post insets = 0.7 m, 0 for a low rail so it never stands taller over the landing nor sinks toward the ground). The steps go down toward +X from the top nosing at x = 0. A one-step `stairs` is a raised platform (the street course's euro gap).
  - `funbox`: a flat top (`topLengthM` × `topWidthM`, `heightM` up, centred on the origin); each side is a `bank` (at `bankAngleRad`), a `wall` or a `ledge` (a wall with a chamfered, grindable top edge). Two banks meeting at a corner make a hip. The top, banks, rounded crests and rounded hip ridges are ONE convex piece (the intersection of their half-spaces: no seam on the top or at the crests); each bank's concave toe is a rounded fillet of convex pieces with buried seams (ADR 0008). Optional `topRail` (a flat bar across the top along X) and `bankRail` (a down rail: flat on the top, then down a ±X bank).
  - `kinkedRail`: a round bar along X, flat → down → flat (`flatTopM`, `downRunM`, `dropM`, `flatBottomM`, `heightM` of the bottom flat), on posts. One convex piece per run: at the convex kink the upper run reaches over it (clipped to the next run's top) and the lower run starts `seamBuryM` below, at the concave kink both runs overlap under each other, so no seam edge sits on the bar's top.
  - `bankLedge`: a bank (rounded toe) rising toward +X to `bankHeightM`, into a chamfered concrete ledge block standing `ledgeHeightM` above the bank's top edge.
- **Obstacle geometry** (`obstacle-geometry.ts`, pure). Besides extrusions, a piece can be built as the intersection of half-spaces (`halfSpacePiece`: vertices where three planes meet, faces sorted around each plane), which is how the funbox, the kinked rail's runs and the rounded toes are made: `obstacleGeometry(obstacle)` returns **convex pieces**. Each piece has vertices, outward-wound faces with a render tone (`body`, `edge` or `metal`), and its own surface type. Physics and rendering both use these same pieces (ADR 0008). The tessellation settings are in `WORLD_CONFIG.geometry`.
- **Obstacle collider** (`obstacleCollider(obstacle)`): structurally a board `StaticColliderDesc`. It is a box for `box` shapes, and a `compound` of convex hulls (one per piece, each with its surface) for everything else.
- **Grind edge** (VO, `grind-edges.ts`, pure, M4): `obstacleGrindEdges(obstacle)` gives every edge a board can grind or slide on as a straight segment on top of the edge's profile, in the world frame: `startM`, `endM`, `outwardNormal` (horizontal, away from the obstacle), `surface`, `obstacleId`, `twoSided` (a bar: rail, handrail) and `halfWidthM`. Rail bar, coping (out over the transition), hubba steel edge (a flat segment on the platform and a sloped one), ledge top edges (where the top face meets the chamfers) and handrail. Queries: `grindEdgesNear(edges, point, radius)` (nearest first), `nearestGrindEdge`, `closestOnEdge`. See [ADR 0009](../../../docs/adr/0009-grinds.md).
- **Surface type** (VO): `ground | ramp | grindable | ledge`. Contacts and `SurfaceContact*` events carry it per piece, for example `grindable` for a truck on the coping or a rail.
- **Spawn** (VO): a ground point plus a heading. The board adds its own rest height.

## Levels

- `createFlatGroundLevel(WORLD_CONFIG.flatGround)`: one ground box whose top face is at y = 0. This is the default.
- `createStreetCourseLevel()` (`?level=street`): a contest-style street course, ≈ 53 × 29 m, laid out in `WORLD_CONFIG.street`. Quarter pipes (1.2 m, 20 m wide) at both short ends (toes at x = ±23.5). You spawn at (−14.5, 1.05, 1) on the landing of the centre 7-stair (nosing at x = −8; a 0.28 m hubba on each side, a 0.38 m handrail down the middle from over the top nosing to over the foot, its top end ≈ 0.35 m above the landing; 14° rounded roll-up behind), with 6.5 m of run-up. The funbox (top 6 × 3 m, 0.5 m, 20° banks on −X/+X/−Z, a ledge on +Z, a flat rail at z = −0.7 and a down rail on the +X bank at z = +0.6) is centred at (8, 0). North (z ≈ 9): a 3-stair (nosing x = −4) with a kinked rail down its middle, manual pads (0.15 m at x = 7, 0.25 m at x = 15), and a hip (two 22° banks, 0.7 m) in the corner at (21, 13). South: a 6 m, 0.4 m ledge (x = −2, z = −8.5), a 0.3 m flat bar (x = 8), a 25° bank-to-ledge (toe x = 15); a 0.6 m euro-gap platform (drop edge x = −12, z = −12.5) and a 0.3 m up-ledge (x = −3.5). Every drop has ≥ 4 m of clear roll-out (≥ 6 m after the stairs and the gap).
- `createSkateparkLevel()` (`?level=park`): a plaza laid out as one line along +X. You spawn on the platform of a 5-stair with 6.8 m of run-up. The stairs have a hubba on the right and a handrail on the left, and a 14° roll-up slope (part of the platform piece) leads up to the platform from behind. After the stairs there are 10 m of roll-away, then a kicker, then a ledge (right) and a flat rail (left), then a 20° bank. A mini halfpipe (two quarter pipes, 1.3 m high with a 2.2 m radius, facing each other across a 4 m flat bottom) sits off to the left (−Z). The layout is in `WORLD_CONFIG.park`.

## Public API (`index.ts`)

- Types: `Level` (+ `Level.create`), `Obstacle`, `ObstacleShape` (+ factories), the shape interfaces, `Spawn`, `SurfaceType`, `ObstacleId`, `ConvexPiece`, `GeometryFace`, `FaceTone`, `ObstacleGeometry`, `ObstacleColliderDesc`.
- Grind edges: `GrindEdge`, `GrindEdgeHit`, `obstacleGrindEdges`, `levelGrindEdges`, `grindEdgesNear`, `nearestGrindEdge`, `closestOnEdge`.
- Functions: `createFlatGroundLevel`, `createSkateparkLevel`, `createStreetCourseLevel`, `obstacleGeometry`, `shapeGeometry`, `obstacleCollider`, and shape helpers (`quarterPipeLipXM`, `quarterPipeLipAngleRad`, `quarterPipeCopingProfile`, `kickerRadiusM`, `kickerLipAngleRad`, `stairsHeightM`, `stairsSlopeRad`, `stairsFootXM`, `handrailZM`, `handrailSpanXM`, `funboxBankRunM`, `kinkedRailTopLine`, `bankLedgeRunM`).

## Known rider limitation (hand-off)

A 50-50 on the kinked rail carries across the convex kink onto the run down (`continueGapM` / `continueOnto` works: one lock, scenario in `street.scenario.test.ts`), but the lock holds the board's MIDPOINT on the current run: at the convex kink the tail truck then rests on the upper run while the board pivots (it loses ≈ 1/3 of its speed), and at the concave kink (onto the bottom flat) the rigid board wedges between the two runs and stalls. The lock should target the chord between the two trucks' points on the polyline while it straddles a kink.
- Config: `WORLD_CONFIG`.

## Events

Emits none and consumes none.
