import { STREET_CONFIG } from "../../../maps/street/street.config";
import type { MontageClip } from "../clip";
import { KeyTimeline } from "../timeline";

/* Street course clips (`?map=street`, see STREET_CONFIG). */

const street = STREET_CONFIG;
const stairs = street.bigStairs;

/**
 * Ollie down the 7-stair (1.05 m): rolling at 4.5 m/s on the landing, 4.5 m behind the
 * nosing in the lane between the handrail and the +Z hubba; ↓ + S from 0.72 s, the pop
 * at 0.92 s just before the nosing, W to level, Space as it comes down. It opens on a wide,
 * high shot of the whole course from beyond its south side.
 */
export const ollieSevenStair: MontageClip = {
  id: "ollie-seven-stair",
  title: "Ollie · 7-stair",
  level: "street",
  stance: "regular",
  spawn: {
    xM: stairs.xM - 4.5,
    yM: stairs.stepCount * stairs.riseM,
    zM: street.spawn.zM,
    headingRad: 0,
    speedMps: 4.5,
  },
  durationS: 3.2,
  keys: new KeyTimeline("regular")
    .loadAndPop("tail", 0.72, 0.92)
    .level("tail", 0.97, 0.15)
    .catch(1.22)
    .build(),
  shots: [
    {
      fromS: 0,
      shot: {
        kind: "fixedTripod",
        positionM: [street.funbox.xM + 2, 19, street.perimeter.minZM - 15],
        fovStartDeg: 62,
        fovEndDeg: 50,
        zoomS: 1,
      },
    },
    {
      fromS: 0.7,
      shot: {
        kind: "fixedTripod",
        positionM: [stairs.xM + 5, 0.5, street.spawn.zM + 3],
        fovStartDeg: 50,
        fovEndDeg: 36,
        zoomS: 3,
      },
    },
  ],
  slowMotion: [{ fromS: 0.85, toS: 1.7, scale: 0.35 }],
  expect: { tricks: ["Ollie"] },
};
