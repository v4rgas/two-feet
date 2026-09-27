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
  - `stairs`: step count, rise, run, width, top platform depth, an optional roll-up back slope, and an optional hubba (+Z side: a `ledge` with a `grindable` steel edge) and handrail (−Z side, `grindable`). The steps go down toward +X from the top nosing at x = 0.
- **Obstacle geometry** (`obstacle-geometry.ts`, pure): `obstacleGeometry(obstacle)` returns **convex pieces**. Each piece has vertices, outward-wound faces with a render tone (`body`, `edge` or `metal`), and its own surface type. Physics and rendering both use these same pieces (ADR 0008). The tessellation settings are in `WORLD_CONFIG.geometry`.
- **Obstacle collider** (`obstacleCollider(obstacle)`): structurally a board `StaticColliderDesc`. It is a box for `box` shapes, and a `compound` of convex hulls (one per piece, each with its surface) for everything else.
- **Grind edge** (VO, `grind-edges.ts`, pure, M4): `obstacleGrindEdges(obstacle)` gives every edge a board can grind or slide on as a straight segment on top of the edge's profile, in the world frame: `startM`, `endM`, `outwardNormal` (horizontal, away from the obstacle), `surface`, `obstacleId`, `twoSided` (a bar: rail, handrail) and `halfWidthM`. Rail bar, coping (out over the transition), hubba steel edge (a flat segment on the platform and a sloped one), ledge top edges (where the top face meets the chamfers) and handrail. Queries: `grindEdgesNear(edges, point, radius)` (nearest first), `nearestGrindEdge`, `closestOnEdge`. See [ADR 0009](../../../docs/adr/0009-grinds.md).
- **Surface type** (VO): `ground | ramp | grindable | ledge`. Contacts and `SurfaceContact*` events carry it per piece, for example `grindable` for a truck on the coping or a rail.
- **Spawn** (VO): a ground point plus a heading. The board adds its own rest height.

## Levels

- `createFlatGroundLevel(WORLD_CONFIG.flatGround)`: one ground box whose top face is at y = 0. This is the default.
- `createSkateparkLevel()` (`?level=park`): a plaza laid out as one line along +X. You spawn on the platform of a 5-stair with 6.8 m of run-up. The stairs have a hubba on the right and a handrail on the left, and a 14° roll-up slope (part of the platform piece) leads up to the platform from behind. After the stairs there are 10 m of roll-away, then a kicker, then a ledge (right) and a flat rail (left), then a 20° bank. A mini halfpipe (two quarter pipes, 1.3 m high with a 2.2 m radius, facing each other across a 4 m flat bottom) sits off to the left (−Z). The layout is in `WORLD_CONFIG.park`.

## Public API (`index.ts`)

- Types: `Level` (+ `Level.create`), `Obstacle`, `ObstacleShape` (+ factories), the shape interfaces, `Spawn`, `SurfaceType`, `ObstacleId`, `ConvexPiece`, `GeometryFace`, `FaceTone`, `ObstacleGeometry`, `ObstacleColliderDesc`.
- Grind edges: `GrindEdge`, `GrindEdgeHit`, `obstacleGrindEdges`, `levelGrindEdges`, `grindEdgesNear`, `nearestGrindEdge`, `closestOnEdge`.
- Functions: `createFlatGroundLevel`, `createSkateparkLevel`, `obstacleGeometry`, `shapeGeometry`, `obstacleCollider`, and shape helpers (`quarterPipeLipXM`, `quarterPipeLipAngleRad`, `quarterPipeCopingProfile`, `kickerRadiusM`, `kickerLipAngleRad`, `stairsHeightM`, `stairsSlopeRad`, `stairsFootXM`).
- Config: `WORLD_CONFIG`.

## Events

Emits none and consumes none.
