import { STREET_CONFIG } from "../../../maps/street/street.config";
import type { MontageClip } from "../clip";
import { KeyTimeline } from "../timeline";

/* Street grind clips (M4): the flat bar and the long ledge (see STREET_CONFIG). */

const bar = STREET_CONFIG.flatBar;
const ledge = STREET_CONFIG.longLedge;

/**
 * 50-50 on the flat bar (scenario G1): rolling at 4 m/s from 4 m before its start, 0.15 m
 * to its side and angled 0.03 rad onto it; full-load pop at 0.70 s (pops from ≈ 0.55 to
 * ≈ 0.85 s lock on: the middle of the window, ADR 0012), W; the lock-on (nothing held: a
 * 50-50, backside — the bar was on the heel side) is near the bar's start, it grinds to
 * the end and rolls off (the feet stay on), then lands.
 */
export const railFiftyFifty: MontageClip = {
  id: "rail-fifty-fifty",
  title: "BS 50-50 · flat bar",
  level: "street",
  stance: "regular",
  spawn: { xM: bar.xM - 6.5, yM: 0, zM: bar.zM + 0.15, headingRad: 0.03, speedMps: 4 },
  durationS: 3.6,
  keys: new KeyTimeline("regular").loadAndPop("tail", 0.34, 0.7).level("tail", 0.75).build(),
  shots: [
    { fromS: 0, shot: { kind: "lowSide", side: "left", distanceM: 2.4, leadM: 0.8 } },
    { fromS: 2.0, blendS: 0.5, shot: { kind: "follow" } },
  ],
  slowMotion: [{ fromS: 1.0, toS: 1.5, scale: 0.4 }],
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
  title: "FS Boardslide · long ledge",
  level: "street",
  stance: "regular",
  spawn: {
    xM: ledge.xM - ledge.lengthM / 2 - 5,
    yM: 0,
    zM: ledge.zM - 0.35,
    headingRad: 0,
    speedMps: 4,
  },
  durationS: 3.6,
  keys: new KeyTimeline("regular")
    .loadAndPop("tail", 0.6, 0.92)
    .level("tail", 0.97, 0.12)
    .spin("left", 0.94, 0.14)
    .catch(1.18)
    .loadAndPop("tail", 1.9, 2.1)
    .level("tail", 2.15, 0.1)
    .catch(2.31)
    .build(),
  shots: [
    { fromS: 0, shot: { kind: "fisheyeFollow" } },
    { fromS: 1.0, blendS: 0.4, shot: { kind: "lowSide", side: "right", distanceM: 2.6 } },
  ],
  slowMotion: [{ fromS: 1.1, toS: 1.5, scale: 0.4 }],
  expect: { tricks: ["FS Boardslide"] },
};
