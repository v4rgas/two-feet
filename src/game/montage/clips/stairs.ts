import type { MontageClip } from "../clip";
import { KeyTimeline } from "../timeline";

/*
 * The 5-stair (park spawn: the top platform, 6.8 m behind the nosing, facing the drop).
 * Three pushes reach ≈ 3.7 m/s; the pop at 2.75 s is ≈ 0.3 m before the nosing. The drop
 * makes the air ≈ 0.78 s, longer than the flip's planned airtime, so the flip is caught
 * once it has turned (catch window ≈ 3.33–3.39 s, found with `findCatchTimeS`).
 */

const POP_S = 2.75;

function pushAndPop(k: KeyTimeline): KeyTimeline {
  return k.push(0.3).push(1.0).push(1.7).loadAndPop("tail", POP_S - 0.22, POP_S);
}

/** Kickflip down the 5-stair: W + A just after the pop, Space once the flip has turned. */
export const kickflipStairs: MontageClip = {
  id: "kickflip-stairs",
  title: "Kickflip · 5-stair",
  level: "park",
  stance: "regular",
  durationS: 4.8,
  keys: pushAndPop(new KeyTimeline("regular"))
    .level("tail", POP_S + 0.05)
    .flick("tail", "heel", POP_S + 0.05, 0.08)
    .catch(3.36)
    .build(),
  shots: [
    { fromS: 0, shot: { kind: "fisheyeFollow" } },
    {
      fromS: 2.45,
      shot: { kind: "fixedTripod", positionM: [3.4, 0.55, 2.4], fovStartDeg: 46, fovEndDeg: 32, zoomS: 5 },
    },
  ],
  slowMotion: [{ fromS: 2.72, toS: 3.62, scale: 0.35 }],
  expect: { tricks: ["Kickflip"] },
};

/** Varial heelflip down the 5-stair: W + D flick and a frontside sweep (→) together. */
export const varialHeelflipStairs: MontageClip = {
  id: "varial-heelflip-stairs",
  title: "Varial Heelflip · 5-stair",
  level: "park",
  stance: "regular",
  durationS: 5,
  keys: pushAndPop(new KeyTimeline("regular"))
    .level("tail", POP_S + 0.05)
    .flick("tail", "toe", POP_S + 0.05, 0.08)
    .sweep("tail", "toe", POP_S + 0.05, 0.08)
    .catch(3.36)
    .build(),
  shots: [
    { fromS: 0, shot: { kind: "follow" } },
    { fromS: 2.3, blendS: 0.5, shot: { kind: "lowSide", side: "right", distanceM: 2.8 } },
    { fromS: 3.75, blendS: 0.6, shot: { kind: "slowOrbit", startAngleRad: Math.PI / 2 } },
  ],
  slowMotion: [{ fromS: 2.72, toS: 3.62, scale: 0.3 }],
  expect: { tricks: ["Varial Heelflip"] },
};
