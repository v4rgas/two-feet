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
  - `stairs`: step count, rise, run, width, top platform depth, an optional roll-up back slope (`roundedBackSlope`: its toe and crest rounded like a funbox bank's), and an optional hubba (+Z side, or both sides with `bothSides`: a `ledge` with a `grindable` steel edge; its flat top reaches `flatTopM` back onto the platform, default one tread, 0.9 m on the Street Course so a board coming down a little early lands on it, not its end face: ADR 0012) and handrail (−Z side, on both sides with `bothSides` (El Toro), or down the middle with `centered`; `grindable`; `heightM` square to the line of nosings; its bar runs `topOverhangM` back over the landing past the top nosing and `bottomOverhangM` on past the foot, twice `railPostInsetM` = 0.7 m each by default: 0 / 0 for the Street Course's low centre rail so it never stands taller over the landing nor sinks toward the ground; a short bottom overhang ends El Toro's rail in the air; `handrailSpanXM` gives the span, null without a handrail). The steps go down toward +X from the top nosing at x = 0. A one-step `stairs` is a raised platform (the Street Course's euro gap).
  - `funbox`: a flat top (`topLengthM` × `topWidthM`, `heightM` up, centred on the origin); each side is a `bank` (at `bankAngleRad`), a `wall` or a `ledge` (a wall with a chamfered, grindable top edge). Two banks meeting at a corner make a hip. The top, banks, rounded crests and rounded hip ridges are ONE convex piece (the intersection of their half-spaces: no seam on the top or at the crests); each bank's concave toe is a rounded fillet of convex pieces with buried seams (ADR 0008). Optional `topRail` (a flat bar across the top along X) and `bankRail` (a down rail: flat on the top, then down a ±X bank).
  - `kinkedRail`: a round bar along X, flat → down → flat (`flatTopM`, `downRunM`, `dropM`, `flatBottomM`, `heightM` of the bottom flat), on posts. One convex piece per run: at the convex kink the upper run reaches over it (clipped to the next run's top) and the lower run starts `seamBuryM` below, at the concave kink both runs overlap under each other, so no seam edge sits on the bar's top.
  - `bankLedge`: a bank (rounded toe) rising toward +X to `bankHeightM`, into a chamfered concrete ledge block standing `ledgeHeightM` above the bank's top edge.
  - `barrier`: a perimeter barrier segment: a low chamfered concrete wall along X (`lengthM`, `heightM`, `thicknessM`, standing on y = 0), its local +Z face the FRONT. Optional `banner: { sponsorId, sides?: "front" | "both" }` adds a thin banner plate (12 mm proud of the face, inset from the ends, below the chamfer) whose outer face has the `banner` tone; the renderer maps that sponsor's artwork onto it. Solid and `ground` in every piece; it has **no grind edges** (never grindable). Sizes in `WORLD_CONFIG.geometry.barrier`.
- **Obstacle geometry** (`obstacle-geometry.ts`, pure). Besides extrusions, a piece can be built as the intersection of half-spaces (`halfSpacePiece`: vertices where three planes meet, faces sorted around each plane), which is how the funbox, the kinked rail's runs and the rounded toes are made: `obstacleGeometry(obstacle)` returns **convex pieces**. Each piece has vertices, outward-wound faces with a render tone (`body`, `edge` or `metal`), and its own surface type. Physics and rendering both use these same pieces (ADR 0008). The tessellation settings are in `WORLD_CONFIG.geometry`.
- **Obstacle collider** (`obstacleCollider(obstacle)`): structurally a board `StaticColliderDesc`. It is a box for `box` shapes, and a `compound` of convex hulls (one per piece, each with its surface) for everything else.
- **Grind edge** (VO, `grind-edges.ts`, pure, M4): `obstacleGrindEdges(obstacle)` gives every edge a board can grind or slide on as a straight segment on top of the edge's profile, in the world frame: `startM`, `endM`, `outwardNormal` (horizontal, away from the obstacle), `surface`, `obstacleId`, `twoSided` (a bar: rail, handrail) and `halfWidthM`. Rail bar, coping (out over the transition), hubba steel edge (a flat segment on the platform and a sloped one), ledge top edges (where the top face meets the chamfers) and handrail. Queries: `grindEdgesNear(edges, point, radius)` (nearest first), `nearestGrindEdge`, `closestOnEdge`. See [ADR 0009](../../../docs/adr/0009-grinds.md).
- **Surface type** (VO): `ground | ramp | grindable | ledge`. Contacts and `SurfaceContact*` events carry it per piece, for example `grindable` for a truck on the coping or a rail.
- **Spawn** (VO): a ground point plus a heading. The board adds its own rest height.
- **Graffiti placement** (VO, `graffiti.ts`, pure): `{ pieceId, positionM, normal, sizeM, rotationRad? }` in the world frame, listed in `Level.graffiti` (optional input, defaults to `[]`, validated by `Level.create`). Pure decoration: the renderer projects the piece along `−normal` onto whatever concrete is there (wall, ground, bank, curved transition) as a decal; it is never a collider and never touches physics.

## Barriers, sponsors and graffiti: how a map places them

Everything below is data in the map's `createLevel()`; the renderer does the rest.

```ts
import { graffitiOnFace, Level, perimeterBarriers } from "../../contexts/world";

const ring = perimeterBarriers(
  { minXM: -27, maxXM: 27, minZM: -15, maxZM: 15 }, // outer faces of the ring, world m
  {
    idPrefix: "barrier",                              // ids: barrier-<side>-<n>
    openings: [{ side: "west", centerM: 0, widthM: 4 }], // centre = world X (north/south) or Z (east/west)
    banners: ["bipbop", null, "v4rgas", null], // cycled along the ring; null = plain wall
    // heightM (0.9), thicknessM (0.3), segmentLengthM (4), bannerSides, sides: optional
  },
);
const graffiti = [
  graffitiOnFace(someLedge, { pieceId: "v4rgas-throwup", face: "-z", sizeM: 0.6, alongM: -1 }),
  graffitiOnFace(ring[3], { pieceId: "penguin-king", face: "+z", sizeM: 1 }), // a plain segment
  graffitiOnGround({ pieceId: "v4rgas-wildstyle", xM: 4, zM: -3, sizeM: 3 }), // on the floor
  graffitiOnObstacleSurface(someQuarterPipe, {                                 // on the transition
    pieceId: "sticker-bomb", sizeM: 1.2, xM: 1.1, zM: -2,                     // obstacle-local X/Z
  }),
];
return Level.create({ id, name, obstacles: [...ground, ...course, ...ring], spawn, graffiti });
```

- `perimeterBarriers(bounds, options)` rings the rectangle just inside `bounds` (north = +Z,
  south = −Z, east = +X, west = −X; north/south run the full width, east/west fit between
  them), splits each straight run evenly near `segmentLengthM`, leaves the `openings`,
  drops slivers shorter than `perimeterMinSegmentM`, and turns every segment's front
  (banner side) inward. Banners go out in ring order: south (west → east), east, north
  (east → west), west.
- A single barrier: `{ id, name, surface: "ground", transform, shape: ObstacleShape.barrier({ lengthM, heightM, thicknessM, banner: { sponsorId: "bipbop" } }) }`; its +Z face is the front.
- **Sponsor ids** live in `src/presentation/sponsors/sponsor-registry.ts`: `bipbop` (BipBop
  Labs, bipbop.cl) and `v4rgas` (v4rgas.com), the only banners. An unknown id renders as
  a plain barrier. Never invent a real brand.
- **Graffiti pieces** live in `src/presentation/graffiti/graffiti-registry.ts`:
  `v4rgas-throwup`, `pixel-penguin`, `penguin-king`, `v4rgas-wildstyle`, `penguin-stencil`,
  `tag-scribbles`, `sticker-bomb`, `landing-target`, `flow-arrow`.
  `graffitiOnFace(obstacle, { pieceId, face: "+x" | "-x" | "+z" | "-z", sizeM, alongM?, heightM?, rotationRad? })`
  puts one on the outermost face looking that way (a ledge side, a funbox wall, a stair
  set's side wall, a quarter pipe's back, a plain barrier); `createGraffiti` takes a raw
  world position + normal. If `alongM` moves the piece past a step in the side, it lands
  on the face actually under it.
  `graffitiOnGround({ pieceId, xM, zM, sizeM, rotationRad?, yM? })` lays one flat on the
  ground (at rotation 0 its up is world −Z).
  `graffitiOnObstacleSurface(obstacle, { pieceId, sizeM, xM, zM, frame?: "local" | "world", rotationRad? })`
  drops a ray at X/Z onto the obstacle's highest upward-facing face (a deck, a funbox
  bank, a quarter pipe's transition, a platform top) and uses that face's normal; the art's
  up points up the slope. The renderer projects every piece, so it follows slopes and
  curves. STYLE.md: a healthy amount per map, never over a grind edge or coping, calm
  landing zones. On a bannered barrier the `+z` face is the banner plate: paint the back
  or a plain segment.
- Dev demo of all of it: `?level=barrier-demo` (`src/game/dev/barrier-demo.ts`).

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
  with a 7-stair and hubbas, rails, ledges, a funbox, banks and an east quarter pipe; its layout
  and parameters in `street.config.ts`, described in `street-course.ts`) and
  `src/maps/flat/` (flat ground, where the tutorial runs).

## Public API (`index.ts`)

- Types: `Level` (+ `Level.create`), `Obstacle`, `ObstacleShape` (+ factories), the shape interfaces (incl. `BarrierShape`, `BarrierBanner`), `Spawn`, `SurfaceType`, `ObstacleId`, `ConvexPiece`, `GeometryFace`, `FaceTone` (`body | edge | metal | banner`), `ObstacleGeometry`, `ObstacleColliderDesc`, `GraffitiPlacement`, `PerimeterBounds`, `PerimeterOpening`, `PerimeterOptions`.
- Perimeter and decoration: `perimeterBarriers`, `graffitiOnFace`, `graffitiOnGround`, `graffitiOnObstacleSurface`, `createGraffiti` (types `GraffitiOnFaceOptions`, `GraffitiOnGroundOptions`, `GraffitiOnSurfaceOptions`).
- Grind edges: `GrindEdge`, `GrindEdgeHit`, `obstacleGrindEdges`, `levelGrindEdges`, `grindEdgesNear`, `nearestGrindEdge`, `closestOnEdge`.
- Maps: `MapDefinition`, `isMapDefinition`, `groundObstacle`, `GroundParams`.
- Functions: `obstacleGeometry`, `shapeGeometry`, `obstacleCollider`, and shape helpers (`quarterPipeLipXM`, `quarterPipeLipAngleRad`, `quarterPipeCopingProfile`, `kickerRadiusM`, `kickerLipAngleRad`, `stairsHeightM`, `stairsSlopeRad`, `stairsFootXM`, `handrailZM`, `handrailSpanXM`, `funboxBankRunM`, `kinkedRailTopLine`, `bankLedgeRunM`).

## Known rider limitation (hand-off)

A 50-50 on the kinked rail carries across the convex kink onto the run down (`continueGapM` / `continueOnto` works: one lock, scenario in `street.scenario.test.ts`), but the lock holds the board's MIDPOINT on the current run: at the convex kink the tail truck then rests on the upper run while the board pivots (it loses ≈ 1/3 of its speed), and at the concave kink (onto the bottom flat) the rigid board wedges between the two runs and stalls. The lock should target the chord between the two trucks' points on the polyline while it straddles a kink.
- Config: `WORLD_CONFIG` (only `geometry`: how the kinds are tessellated).

## Events

Emits none and consumes none.
