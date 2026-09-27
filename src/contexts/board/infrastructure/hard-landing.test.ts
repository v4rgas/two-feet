import { afterEach, describe, expect, it } from "vitest";
import { Quat, Transform, Vec3 } from "../../../shared";
import { BOARD_CONFIG } from "../board.config";
import { BoardSpec } from "../domain/board-spec";
import type { StaticColliderDesc } from "../domain/physics-world";
import { BoardHarness, STEP_S } from "./board-harness";

/*
 * HARD LANDINGS ARE DETERMINISTIC (ADR 0003, "Hard landings"). A board falling onto the
 * flat at 5–9 m/s, level or pitched ±0.1 rad, must land the same whatever else is in the
 * world. The contact solver resolves the impact in the order of the world's contact
 * pairs, which follows the number of static colliders; before the hard-landing settle,
 * adding one unrelated collider 700 m away could turn a clean four-wheel landing into a
 * 5 cm nose skip at 3.4 rad/s. Each case runs with 0, 1, 5 and 20 far-away colliders,
 * and from two drop heights (the CCD step lands at a different depth).
 */

const FAR_COUNTS = [0, 1, 5, 20] as const;
const IMPACT_MPS = [5, 7, 9] as const;
const PITCH_RAD = [0, 0.1, -0.1] as const;
const DROP_HEIGHTS_M = [0.2, 0.237] as const;
/** Four wheels down by this many steps after the first wheel touches. */
const SETTLE_STEPS = 3;
const REST_M = BoardSpec.restHeightM(BoardSpec.create(BOARD_CONFIG.spec));

const harnesses: BoardHarness[] = [];
afterEach(() => {
  for (const h of harnesses.splice(0)) h.dispose();
});

function farColliders(count: number): StaticColliderDesc[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `far-${i}`,
    surface: "ground" as const,
    transform: Transform.create(Vec3.create(500 + 3 * i, 0.5, 500), Quat.IDENTITY),
    shape: { kind: "box" as const, halfExtentsM: Vec3.create(1, 0.5, 1) },
  }));
}

interface Landing {
  /** Steps from the first wheel contact to four wheels down. */
  readonly fourWheelsAfter: number;
  /** Highest the board origin rises above rest height from `SETTLE_STEPS` on, m. */
  readonly maxRiseM: number;
  /** Fastest spin after `SETTLE_STEPS`, rad/s. */
  readonly maxSpinRadps: number;
  /** Fewest wheels down from `SETTLE_STEPS` on. */
  readonly minWheelsAfterSettle: number;
  readonly leftGround: number;
  /** Where the board is 0.5 s after the touchdown. */
  readonly restPositionM: Vec3;
}

async function land(
  far: number,
  impactMps: number,
  pitchRad: number,
  heightM: number,
): Promise<Landing> {
  const rest = REST_M;
  const spawn = Transform.create(
    Vec3.create(0, rest + heightM, 0),
    Quat.fromAxisAngle(Vec3.UNIT_Z, pitchRad),
  );
  const h = await BoardHarness.create({ obstacles: farColliders(far), spawn });
  harnesses.push(h);
  h.body.resetTo(spawn, Vec3.create(6, -impactMps, 0));
  let touch = -1;
  let fourWheelsAfter = -1;
  let maxRiseM = 0;
  let maxSpinRadps = 0;
  let minWheelsAfterSettle = 4;
  let restPositionM = Vec3.ZERO;
  for (let i = 0; i < Math.round(0.8 / STEP_S); i += 1) {
    h.step();
    const s = h.system.snapshot;
    if (touch < 0 && s.wheelsDown > 0) touch = i;
    if (touch < 0) continue;
    if (fourWheelsAfter < 0 && s.wheelsDown === 4) fourWheelsAfter = i - touch;
    if (i - touch >= SETTLE_STEPS) {
      maxRiseM = Math.max(maxRiseM, s.transform.positionM.y - rest);
      // The step the last axle arrives it may still be turning onto it.
      if (i - touch > SETTLE_STEPS) {
        maxSpinRadps = Math.max(maxSpinRadps, Vec3.length(s.angularVelocityRadps));
      }
      minWheelsAfterSettle = Math.min(minWheelsAfterSettle, s.wheelsDown);
    }
    if (i - touch === Math.round(0.5 / STEP_S)) restPositionM = s.transform.positionM;
  }
  return {
    fourWheelsAfter,
    maxRiseM,
    maxSpinRadps,
    minWheelsAfterSettle,
    leftGround: h.events.filter((e) => e === "BoardLeftGround").length,
    restPositionM,
  };
}

describe("hard landings do not depend on the number of static colliders", () => {
  for (const impactMps of IMPACT_MPS) {
    for (const pitchRad of PITCH_RAD) {
      it(`${impactMps} m/s, pitch ${pitchRad} rad: four wheels within ${SETTLE_STEPS} steps, no skip, with 0/1/5/20 far colliders`, async () => {
        for (const heightM of DROP_HEIGHTS_M) {
          const runs: Landing[] = [];
          for (const far of FAR_COUNTS) runs.push(await land(far, impactMps, pitchRad, heightM));
          for (const r of runs) {
            expect(r.fourWheelsAfter).toBeGreaterThanOrEqual(0);
            expect(r.fourWheelsAfter).toBeLessThanOrEqual(SETTLE_STEPS);
            expect(r.minWheelsAfterSettle).toBe(4); // stays down: no nose (or tail) skip
            expect(r.leftGround).toBe(0);
            expect(r.maxRiseM).toBeLessThan(0.002);
            expect(r.maxSpinRadps).toBeLessThan(0.3);
          }
          // The same landing: where it rolls to does not depend on the far colliders.
          const [first, ...rest] = runs;
          if (first === undefined) throw new Error("no runs");
          for (const r of rest) {
            expect(Vec3.distance(r.restPositionM, first.restPositionM)).toBeLessThan(0.01);
          }
        }
      });
    }
  }
});
