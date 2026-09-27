import type { MontageClip } from "../clip";
import { KeyTimeline } from "../timeline";

/*
 * El Toro (`?level=el-toro`): the 20-stair, a 3.3 m drop (src/maps/el-toro).
 * From the map's spawn (a standing start on the plaza, 14 m behind the nosing), five
 * pushes reach ≈ 6 m/s; the pop at 3.8 s is ≈ 0.3 m before the lip. W + A kickflip. The
 * flip keeps its flat-ground rhythm (MECHANICS.md "Kickflip": timed to the ground under the
 * board at the flick), so Space goes in as the flip comes round, ≈ 0.5 s after the pop,
 * and the rider rides the rest of the ≈ 1.2 s drop with the feet on. Catch window (a scan
 * of the Space time): pop + 0.35 … 0.70 s; 0.52 is its middle.
 */

const POP_S = 3.8;

/** Kickflip down El Toro: a fisheye on the push, then a wide tripod from the bottom. */
export const elToroKickflip: MontageClip = {
  id: "el-toro-kickflip",
  title: "Kickflip · El Toro",
  level: "el-toro",
  stance: "regular",
  durationS: 6.6,
  keys: new KeyTimeline("regular")
    .push(0.3)
    .push(0.95)
    .push(1.6)
    .push(2.25)
    .push(2.9)
    .loadAndPop("tail", POP_S - 0.36, POP_S)
    .level("tail", POP_S + 0.05, 0.12)
    .flick("tail", "heel", POP_S + 0.05, 0.12)
    .catch(POP_S + 0.52)
    .build(),
  shots: [
    { fromS: 0, shot: { kind: "fisheyeFollow" } },
    {
      fromS: POP_S - 0.15,
      shot: {
        kind: "fixedTripod",
        // Down on the landing, off the +Z side past the foot: the whole set in frame.
        positionM: [15, 0.7, 7.5],
        fovStartDeg: 58,
        fovEndDeg: 44,
        zoomS: 4,
      },
    },
  ],
  slowMotion: [{ fromS: POP_S + 0.05, toS: POP_S + 1.25, scale: 0.4 }],
  expect: { tricks: ["Kickflip"] },
};
