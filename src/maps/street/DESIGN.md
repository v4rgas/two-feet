# Street Course: design note

The Street Course (`?map=street`) is a compact contest plaza. It replaces the first
layout, which was 53 × 29 m with features 8–10 m apart. The new one is about
**37 × 22 m** (features x ∈ [−17.7, 19.0], z ∈ [−11.5, 10.5]). Every feature is a push or
two from the next, and the course is built around four lines you can link together.

## What real courses do (references)

- **Contest street courses** (SLS, X Games, Olympics, Tampa Pro) are built as a set of
  sections. There is a **centre stair set** with a round rail and **hubbas**, a
  **funbox / pyramid hub** in the middle, **banks or quarter pipes at the ends** for
  turning around, **ledges and flat bars along the sides**, and **manual pads** close to
  the stairs.
  X Games lists "straight, out, banked, hubba and down ledges; flat, down and round
  rails; four stair sets; banks, gaps, hips", plus "tech ledge and manual pad
  combinations" and "gaps to hubbas".
  [X Games 17 street course (California Skateparks)](https://www.caskateparks.com/portfolio/x-games-17-street-course),
  [X Games course design 2017](https://www.carampworks.com/single-post/2017/09/01/X-Games-Course-Design-2017),
  [Street League Skateboarding](https://en.wikipedia.org/wiki/Street_League_Skateboarding).
- **Paris 2024** had 18 features on a course about a third larger than a typical arena
  course. Its centrepiece was a 10-stair with hubbas ("Bercy hubbas") and round rails
  down the middle. The designer, Joe Ciaglia, aimed for "something for everyone": a hard
  line and an easier line on every section.
  [NBC Olympics: Paris course designs](https://www.nbcolympics.com/news/paris-olympics-skateboard-street-park-course-designs-something-everyone),
  [World Skate: New Forms](https://www.worldskate.org/news/44-discipline/skateboarding/3632-new-forms-how-the-paris-2024-olympic-skateboard-street-and-park-designs-were-created.html),
  [World Skate: Tokyo 2020 designs](https://www.worldskate.org/skateboarding/news-skateboarding/3343-tokyo-2020-course-designs.html).
- **Tampa Pro** runs in a warehouse of about 18,000 ft² (about 1,700 m², for example
  30 × 55 m). The course is rebuilt every year from stairs, ledges, rails, a pyramid and
  transitions.
  [Skatepark of Tampa](https://en.wikipedia.org/wiki/Skatepark_of_Tampa),
  [Red Bull: Tampa Pro guide](https://www.redbull.com/us-en/tampa-pro-guide),
  [SPoT course construction](https://skateparkoftampa.com/blogs/course-construction).
- **Plazas** such as MACBA in Barcelona have long ledges, a big 3-block set and flat
  ground to push on. Ledges people love are about **34–36 cm** (13½–14¼ in) tall, at
  least 50 cm deep, with a long clear run-up and 3 m of space beside them.
  [David Caddo: Dimensions](https://davidcaddo.substack.com/p/dimensions),
  [MACBA](https://staygenerator.com/parallel/barcelona/sports/macba-is-the-place-to-skate).
- **Park design guides** say the same thing: flow matters more than feature count.
  Leave open space around each feature so it can be used fully. Packing too much in
  kills lines and makes crowds.
  [Public Skatepark Guide: factors of design](https://publicskateparkguide.org/design-and-construction/factors-of-skatepark-design/),
  [Dallas skatepark design guidelines](https://www.dallasparks.org/DocumentCenter/View/19604/Skate-Park-Design-Guidelines-2025).

**What we take from this.** A game plaza can't use contest run-ups of 18–23 m. The
course would be empty and slow to cross. So the course is about half of Tampa's
area, with a **4–8 m flat run between features** (one or two pushes at 3.5–4.5 m/s).
It keeps a **clear roll-out of at least 4 m** after every feature, and **at least 6 m**
after the 7-stair and the euro gap. The heights stay inside the ≈ 0.45 m pop:
ledges 0.4 m, bars 0.3 m, hubbas 0.28 m, and the handrail 0.38 m square to the
nosings. Every lane runs along world X, so a line is "push, feature, roll, feature".
The ends are for turning around: the quarter pipe and two corner banks in the east,
and the platforms' roll-up slopes in the west.

## Layout (world m, x = long axis, toward the quarter pipe)

```
 z
 11.5 ┌────────────────────────── barrier ───────────────────────────────────────┐
      │ [3-stair deck ====╗kinked rail]   [pad 15cm]   [pad 25cm]       [HIP]    │  north lane z=8.5
  4.5 │                        [== flat bar ==]                                  │  middle lane
    0 │ /slope [7-stair deck ](stairs)  → 6.3 m →  [/ FUNBOX \]   →  [QP east] │  centre lane
   -5 │                                             [== long ledge ==]       │QP│  south lane
   -9 │ /slope [euro gap]  → 7 m →  [up-ledge]  → → →        [bank→ledge]      │  south-outer
-12.5 └──────────────────────────────────────────────────────────────────────────┘
      x=−23                                0                                21.5
```

| Feature | Where (config) | Footprint above ground | Notes |
|---|---|---|---|
| 7-stair (hubbas both sides, centre handrail) | top nosing x = −6.5, z = 0 | x −17.4…−4.0, z ±2.45 | 7 × 0.15 m. 7 m deck, 14° roll-up from the west. The spawn is on the deck at (−13, 1) |
| Funbox (the hub) | centre (6.5, 0) | x 2.3…10.9, z −2.7…1.5 | 6 × 3 m top, 0.5 m. Banks on −X, +X and −Z, a ledge on +Z, a flat rail across the top, a down rail on the +X bank |
| Quarter pipe | toe x = 15.8 | x 16.3…19.0, z ±5 | 1.2 m on a 2.2 m radius, 10 m wide |
| Flat bar | (1, 4.5) | x −1.5…3.5 | 5 m long, 0.3 m, square. In the middle lane between the two stair sets |
| 3-stair + kinked rail | top nosing (−9, 8.5) | x −17.3…−8.3 (rail to −5.5), z 6.7…10.3 | 3 × 0.15 m. The rail runs flat, down, flat, 0.35 m above the nosings |
| Manual pads | (0.75, 8.5) and (7, 8.5) | x −1.25…2.75 and 5…9 | 15 cm then 25 cm, 2.25 m apart: a manual line |
| Hip | (15.75, 9.5) | x 13.2…16.8, z 6.9…10.5 | 0.7 m, 22° banks facing −X and −Z. Its walls face the fence |
| Long ledge | (7, −5) | x 4…10 | 6 m long, 0.4 m tall |
| Euro-gap platform | drop edge x = −8, z = −9 | x −15.1…−8, z −11…−7 | 0.6 m, with a 14° roll-up |
| Up-ledge | (0.5, −9) | x −1…2, z −10.5…−7.5 | A 3 × 3 m block, 0.3 m, 7 m past the gap |
| Bank to ledge | toe (13, −9) | x 13.1…14.9, z −11.5…−6.5 | A 25° bank 0.6 m high, then a 0.3 m ledge |

## Lines

1. **Main line (centre, from the spawn):** push on the deck, then the 7-stair (ollie,
   kickflip, the handrail, or a hubba: G4 "kickflip → FS tailslide → hardflip out"). Roll
   out 6.3 m, then onto the funbox (the flat rail across the top, the down rail off the
   +X bank, or the +Z ledge side). Then 5 m to the quarter pipe, and fakie back.
2. **North line (3-stair):** roll up the 3-stair's slope from the west end. Take the kinked
   rail (flat, down, flat), then roll 4 m to the 15 cm pad and manual it. Ollie up onto
   the 25 cm pad 2.25 m on, then take the hip in the corner and carve down toward the
   quarter pipe.
3. **Middle lane (return line):** after the quarter pipe, carve back west. Hit the flat
   bar (from either end), turn at the west end, and roll up either stair deck again.
4. **South line:** roll up the gap platform, euro gap (0.6 m), roll 7 m, then ollie or
   manual up the up-ledge. Roll on to the bank-to-ledge in the south-east corner. Or,
   in the inner south lane, slide the long ledge and roll into the quarter pipe.

## Barriers, banners and graffiti

Built in `street-dressing.ts` from `STREET_CONFIG.perimeter`, `deckFence` and `graffiti`
(tested in `street-course.test.ts`).

- **Perimeter:** a ring of 0.9 m `barrier` segments (≈ 4 m each; solid, never grindable)
  with its outer faces on x ∈ [−23, 21.5], z ∈ [−12.5, 11.5]. The first plan had
  x ∈ [−19, 20], but the stair decks' rounded roll-up slopes reach x ≈ −18 and the
  board-only roll-up scenarios start 7 m (7-stair) and 5 m (3-stair) before them, so
  the west run moved out to −23: a ≈ 4.7 m flat run-up west of both slopes, and room to
  carve round from the middle lane. The east run moved to 21.5 so the hip's back wall
  has ≈ 4.5 m of roll-out (its board-only scenario ends near x ≈ 19) and there is a
  2 m lane behind the quarter pipe.
- **Entry gaps** (3 m each): west at z ∈ [3, 6] (the middle lane, the turn-around
  between the two stair decks); north at x ∈ [−5, −2] (between the kinked rail's end
  and the first pad); south at x ∈ [2.5, 5.5] (between the up-ledge and the
  bank-to-ledge; it moved 1.5 m west of the first plan's x ∈ [3, 7] so the segment
  after it lines up with the long ledge). No east gap.
- **Sponsor banners** (on the inside faces, each with plain wall either side):
  - **BipBop Labs:** on the **deck fence** of the quarter pipe: a 0.9 m banner wall on the
    back 20 cm of its deck (x ≈ 18.8–19), 4 m wide and centred on z = 0, plain concrete
    either side across the rest of the deck. A barrier on the ground behind the quarter
    pipe would be hidden by its 1.2 m deck; on the deck it is the first thing you see
    from the spawn, looking down the main line, and it is in the 7-stair clips' shots.
  - **BipBop Labs** again on the south run right behind the long ledge (x 5.5–9.5).
  - **v4rgas:** on the north run behind the 25 cm manual pad (x 5.8–9.8), the backdrop
    of the funbox and flat-bar shots, and on the west run behind the 7-stair deck
    (z −0.8…3), seen when you carve back toward the spawn.
  - Every other segment is plain concrete (no house banners).
- **Graffiti** (two pieces, walls only, clear of riding surfaces and grind edges):
  - a `v4rgas-throwup` on the 7-stair deck's south side wall (under the hubba, x ≈ −9),
    seen from the south lane and the euro gap;
  - a `penguin-king` on the plain barrier in the south-west corner, behind the gap
    platform.
  The other planned spots (the up-ledge's front face, the hip's back walls, the quarter
  pipe's deck face) stay clean: STYLE.md asks for a couple of pieces per map, and the
  hip's walls and the deck face look at the fence, where hardly anyone would see them.
