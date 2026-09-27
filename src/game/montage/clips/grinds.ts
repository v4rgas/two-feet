import { WORLD_CONFIG } from "../../../contexts/world";
import type { MontageClip } from "../clip";
import { KeyTimeline } from "../timeline";

/* Park grind clips (M4): the flat rail and the ledge (see WORLD_CONFIG.park). */

const park = WORLD_CONFIG.park;

/**
 * 50-50 on the flat rail (scenario G1): rolling at 4 m/s from 7 m before its middle, 0.15 m
 * to its side and angled 0.03 rad onto it; full-load pop at 0.94 s, W; the lock-on
 * (nothing held: a 50-50, backside — the rail was on the heel side) is at ≈ 1.35 s, it
 * grinds to the end and rolls off (the feet stay on) at ≈ 2.53 s and lands ≈ 2.84 s.
 */
export const railFiftyFifty: MontageClip = {
  id: "rail-fifty-fifty",
  title: "BS 50-50 · flat rail",
  level: "park",
  stance: "regular",
  spawn: { xM: park.rail.xM - 7, yM: 0, zM: park.rail.zM + 0.15, headingRad: 0.03, speedMps: 4 },
  durationS: 3.6,
  keys: new KeyTimeline("regular").loadAndPop("tail", 0.62, 0.94).level("tail", 0.99).build(),
  shots: [
    { fromS: 0, shot: { kind: "lowSide", side: "left", distanceM: 2.4, leadM: 0.8 } },
    { fromS: 2.2, blendS: 0.5, shot: { kind: "follow" } },
  ],
  slowMotion: [{ fromS: 1.2, toS: 1.7, scale: 0.4 }],
  expect: { tricks: ["BS 50-50"] },
};

/**
 * Boardslide on the ledge (scenario G3): rolling at 4 m/s 0.35 m inside the ledge's near
 * edge; pop at 0.92 s, W, a Q quarter turn in the air, Space; the frontside boardslide
 * locks at ≈ 1.3 s; ↓ + S and release ↓ pops out at 1.90 s (the body turns back to the
 * travel on its own), W, Space (lands with Space in ≈ 2.13–2.37 s; the first Space in
 * ≈ 1.12–1.25 s, after the quarter turn eases out).
 */
export const ledgeBoardslide: MontageClip = {
  id: "ledge-boardslide",
  title: "FS Boardslide · ledge",
  level: "park",
  stance: "regular",
  spawn: { xM: park.ledge.xM - 7, yM: 0, zM: park.ledge.zM - 0.35, headingRad: 0, speedMps: 4 },
  durationS: 3.4,
  keys: new KeyTimeline("regular")
    .loadAndPop("tail", 0.6, 0.92)
    .level("tail", 0.97, 0.12)
    .spin("left", 0.94, 0.14)
    .catch(1.18)
    .loadAndPop("tail", 1.7, 1.9)
    .level("tail", 1.95, 0.1)
    .catch(2.25)
    .build(),
  shots: [
    { fromS: 0, shot: { kind: "fisheyeFollow" } },
    { fromS: 1.0, blendS: 0.4, shot: { kind: "lowSide", side: "right", distanceM: 2.6 } },
  ],
  slowMotion: [{ fromS: 1.1, toS: 1.5, scale: 0.4 }],
  expect: { tricks: ["FS Boardslide"] },
};
