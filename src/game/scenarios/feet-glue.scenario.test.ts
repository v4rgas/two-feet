import { afterEach, describe, expect, it } from "vitest";
import { deckTopPointLocal, RIDER_CONFIG } from "../../contexts/rider";
import { Transform, Vec3 } from "../../shared";
import type { ScenarioHarness, StepRecord } from "./scenario-harness";
import { ScenarioHarness as Harness } from "./scenario-harness";
import { edgeKey, horizontalSpeed, STANCES } from "./scenario-helpers";

/*
 * FEET GLUED TO THE DECK ("when I push, the feet kind of lag behind the board"): an
 * ATTACHED foot moves rigidly with its deck point every step, whatever the board's speed
 * or acceleration; only its motion relative to the deck is eased. The rider frame's
 * translation tracks the board exactly while a foot is on. Presentation draws an attached
 * foot from its board-frame point on the interpolated board (the same interpolation).
 */

const open: ScenarioHarness[] = [];
afterEach(() => {
  for (const h of open.splice(0)) h.dispose();
});

const T = 30_000;
const MM = 1e-3;

/** Every attached foot of `r` sits on its board-frame point, and the torso over the board. */
function expectGlued(h: ScenarioHarness, r: StepRecord, onDeckSpot: boolean): number {
  let checked = 0;
  for (const foot of [r.rider.front, r.rider.back]) {
    if (foot.contact !== "attached") continue;
    const local = foot.positionBoardM;
    expect(local, `${foot.id} on the deck at ${r.timeS.toFixed(3)} s`).not.toBeNull();
    if (local === null) continue;
    const onBoard = Transform.toWorldPoint(r.board.transform, local);
    expect(Vec3.distance(foot.positionWorldM, onBoard)).toBeLessThan(MM);
    // On the grip tape: the deck's top surface under that point.
    const top = deckTopPointLocal(h.sim.spec, local.x, local.z);
    expect(Math.abs(local.y - top.y)).toBeLessThan(MM);
    if (onDeckSpot) {
      // Standing still on the deck: exactly on its deck spot.
      const spot = deckTopPointLocal(
        h.sim.spec,
        foot.deckPosition.alongM,
        foot.deckPosition.acrossM,
      );
      expect(Vec3.distance(local, spot)).toBeLessThan(MM);
    }
    checked += 1;
  }
  const torso = Vec3.add(
    r.board.transform.positionM,
    Vec3.create(0, RIDER_CONFIG.torso.heightM, 0),
  );
  if (checked > 0) expect(Vec3.distance(r.rider.torsoPositionWorldM, torso)).toBeLessThan(MM);
  return checked;
}

describe("feet glued to the deck", () => {
  for (const stance of STANCES) {
    it(
      `${stance}: holding Space from rest to 6 m/s, both feet stay on their deck spots every step`,
      async () => {
        const h = await Harness.create({ stance });
        open.push(h);
        h.run(0.5);
        const t0 = h.timeS;
        h.keyDown("Space");
        for (let i = 0; i < 12 * 120; i += 1) {
          h.run(1 / 120);
          const last = h.records.at(-1);
          if (last !== undefined && horizontalSpeed(last) > 5.6) break;
        }
        h.keyUp("Space");
        h.run(0.2);
        const steps = h.since(t0);
        expect(Math.max(...steps.map(horizontalSpeed))).toBeGreaterThan(5.6);
        let checked = 0;
        for (const r of steps) checked += expectGlued(h, r, true);
        expect(checked).toBe(2 * steps.length);
      },
      T,
    );

    it(
      `${stance}: hard carves both ways at speed (A + ←, then D + →), the feet ride the deck`,
      async () => {
        const h = await Harness.create({ stance });
        open.push(h);
        h.run(0.3);
        h.launch(4);
        h.run(0.2);
        const t0 = h.timeS;
        h.foot("front", edgeKey(h, "heel"), 0, 0.8);
        h.foot("back", edgeKey(h, "heel"), 0, 0.8);
        h.foot("front", edgeKey(h, "toe"), 0.9, 0.8);
        h.foot("back", edgeKey(h, "toe"), 0.9, 0.8);
        h.run(2);
        const steps = h.since(t0);
        expect(Math.max(...steps.map((r) => Math.abs(r.leanRad)))).toBeGreaterThan(0.05);
        let checked = 0;
        for (const r of steps) checked += expectGlued(h, r, false);
        expect(checked).toBe(2 * steps.length);
      },
      T,
    );
  }
});
