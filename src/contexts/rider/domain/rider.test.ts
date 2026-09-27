import { describe, expect, it } from "vitest";
import { Vec3 } from "../../../shared";
import { RIDER_CONFIG } from "../rider.config";
import { deckTopPointLocal } from "./deck-surface";
import { NEUTRAL_CONTROLS, Rider, type RiderChange } from "./rider";
import { board, controls, DECK, DT, REST_Y } from "./test-fixtures";

function run(rider: Rider, c: ReturnType<typeof controls>, b = board(), steps = 1): RiderChange[] {
  const out: RiderChange[] = [];
  for (let i = 0; i < steps; i += 1) out.push(...rider.update(c, b, DT));
  return out;
}

describe("Rider aggregate", () => {
  it("starts with both feet attached at their rest positions on the grip tape", () => {
    const rider = new Rider(DECK, RIDER_CONFIG, board());
    const { front, back } = rider.state;
    expect(front.contact).toBe("attached");
    expect(front.deckPosition.alongM).toBeCloseTo(RIDER_CONFIG.feet.frontRestAlongM);
    expect(back.deckPosition.alongM).toBeCloseTo(RIDER_CONFIG.feet.backRestAlongM);
    const top = deckTopPointLocal(DECK, RIDER_CONFIG.feet.frontRestAlongM, 0);
    expect(front.positionWorldM.y).toBeCloseTo(REST_Y + top.y, 4);
  });

  it("slides an attached foot toward its target at most maxSlideSpeed, and keeps it on the deck while grounded", () => {
    const rider = new Rider(DECK, RIDER_CONFIG, board());
    run(rider, controls({ fy: 1 }));
    const moved = rider.state.front.riderPosition.alongM - RIDER_CONFIG.feet.frontRestAlongM;
    expect(moved).toBeCloseTo(RIDER_CONFIG.feet.maxSlideSpeedMps * DT, 6);
    run(rider, controls({ fx: 1 }), board(), 60);
    expect(Math.abs(rider.state.front.deckPosition.acrossM)).toBeLessThanOrEqual(
      DECK.deck.widthM / 2 + 1e-9,
    );
  });

  it("the pop lifts both feet; the catch puts them back", () => {
    const rider = new Rider(DECK, RIDER_CONFIG, board());
    const lifted = rider.liftFeet();
    expect(lifted.map((c) => c.type)).toEqual(["FootDetached", "FootDetached"]);
    expect(rider.state.front.contact).toBe("airborne");
    const caught = rider.catchFeet(board({ grounded: false, y: 0.3 }));
    expect(caught.map((c) => c.type)).toEqual(["FootAttached", "FootAttached"]);
    expect(rider.state.back.contact).toBe("attached");
  });

  it("feet stay upright in the rider frame while the board flips under them", () => {
    const rider = new Rider(DECK, RIDER_CONFIG, board());
    rider.liftFeet();
    run(rider, NEUTRAL_CONTROLS, board({ grounded: false }));
    const before = rider.state.front.positionWorldM;
    run(rider, NEUTRAL_CONTROLS, board({ grounded: false, rollRad: Math.PI / 2 }));
    const after = rider.state.front.positionWorldM;
    expect(Vec3.distance(before, after)).toBeLessThan(0.01);
    expect(rider.state.headingRad).toBeCloseTo(0, 9);
  });

  it("landing lined up with the travel (forward or fakie) is fine; sideways bails unless grinding", () => {
    const landing = (v: Vec3, grindable = false) => {
      const rider = new Rider(DECK, RIDER_CONFIG, board());
      const b = board({
        linearVelocityMps: v,
        contactPoints: grindable ? [{ surface: "grindable" }] : [],
      });
      return rider.land(1, b).map((c) => c.type);
    };
    expect(landing(Vec3.create(3, 0, 0))).not.toContain("RiderBailed");
    expect(landing(Vec3.create(-3, 0, 0))).not.toContain("RiderBailed");
    expect(landing(Vec3.create(3, 0, 1.5))).toContain("RiderBailed");
    expect(landing(Vec3.create(0, 0, 3), true)).not.toContain("RiderBailed");
    // Too slow to have a direction of travel: no yaw check.
    expect(landing(Vec3.create(0, 0, 0.2))).not.toContain("RiderBailed");
  });

  it("uncaught landing: level → feet come back; tilted → bail; upside down → bail", () => {
    const level = new Rider(DECK, RIDER_CONFIG, board());
    level.liftFeet();
    expect(level.land(1, board()).map((c) => c.type)).toEqual(["FootAttached", "FootAttached"]);

    const tilted = new Rider(DECK, RIDER_CONFIG, board());
    tilted.liftFeet();
    const landed = tilted.land(Math.cos(RIDER_CONFIG.tricks.landTiltRad + 0.1), board());
    expect(landed).toEqual([{ type: "RiderBailed", reason: "offAngle" }]);

    const flipped = new Rider(DECK, RIDER_CONFIG, board());
    expect(flipped.land(-0.9, board())).toEqual([{ type: "RiderBailed", reason: "upsideDown" }]);
  });

  it("bails when both feet stay off on the wheels, or the board rests upside down", () => {
    const off = new Rider(DECK, RIDER_CONFIG, board());
    off.liftFeet();
    const changes = run(off, NEUTRAL_CONTROLS, board(), 60);
    expect(changes).toContainEqual({ type: "RiderBailed", reason: "feetDetached" });

    const upside = new Rider(DECK, RIDER_CONFIG, board());
    const b = board({
      grounded: false,
      rollRad: Math.PI,
      contacts: { tail: false, nose: false, deck: true },
    });
    expect(run(upside, NEUTRAL_CONTROLS, b, 40)).toContainEqual({
      type: "RiderBailed",
      reason: "upsideDown",
    });
  });

  it("the heading follows the board axis either way round on the ground, and is held in the air", () => {
    const rider = new Rider(DECK, RIDER_CONFIG, board());
    const turned = (yaw: number, grounded: boolean) => ({
      ...board({ grounded }),
      transform: {
        ...board().transform,
        rotation: { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) },
      },
    });
    run(rider, NEUTRAL_CONTROLS, turned(0.3, true), 120);
    expect(rider.state.headingRad).toBeCloseTo(0.3, 2);
    // Board spun 180° (a shove-it): the rider does not turn.
    run(rider, NEUTRAL_CONTROLS, turned(0.3 + Math.PI, true), 120);
    expect(rider.state.headingRad).toBeCloseTo(0.3, 2);
    run(rider, NEUTRAL_CONTROLS, turned(1.2, false), 120);
    expect(rider.state.headingRad).toBeCloseTo(0.3, 2);
  });

  it("the torso follows a board rolling at constant speed without lag", () => {
    const at = (x: number) => {
      const b = board({ linearVelocityMps: Vec3.create(3, 0, 0) });
      return { ...b, transform: { ...b.transform, positionM: Vec3.create(x, REST_Y, 0) } };
    };
    const rider = new Rider(DECK, RIDER_CONFIG, at(0));
    for (let i = 1; i <= 60; i += 1) rider.update(NEUTRAL_CONTROLS, at(3 * DT * i), DT);
    expect(Math.abs(rider.state.torsoPositionWorldM.x - 3 * DT * 60)).toBeLessThan(0.03);
  });
});
