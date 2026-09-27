import { describe, expect, it } from "vitest";
import { degToRad, Quat, Transform, Vec3 } from "../../../shared";
import { RIDER_CONFIG } from "../rider.config";
import { deckTopPointLocal } from "./deck-surface";
import type { BoardKinematics, DeckGeometry, RiderControls } from "./foot-force-model";
import { NEUTRAL_CONTROLS, Rider, type RiderChange } from "./rider";

const DT = 1 / 120;

/** Same numbers as BOARD_CONFIG.spec (the domain test may not import the board context). */
const DECK: DeckGeometry = {
  deck: {
    lengthM: 0.8,
    widthM: 0.21,
    thicknessM: 0.012,
    kickLengthM: 0.15,
    kickAngleRad: degToRad(19),
  },
  trucks: { wheelbaseM: 0.36 },
};

const START = Transform.create(Vec3.create(0, 0.09, 0), Quat.IDENTITY);

function board(overrides: Partial<BoardKinematics> = {}): BoardKinematics {
  return {
    transform: START,
    linearVelocityMps: Vec3.ZERO,
    angularVelocityRadps: Vec3.ZERO,
    grounded: true,
    contacts: { tail: false, nose: false, deck: false },
    ...overrides,
  };
}

function controls(front: { x?: number; y?: number } = {}, back: { x?: number; y?: number } = {}) {
  const foot = (id: "front" | "back", s: { x?: number; y?: number }) => ({
    foot: id,
    stick: { x: s.x ?? 0, y: s.y ?? 0 },
    stickVelocityPerS: { x: 0, y: 0 },
  });
  return { front: foot("front", front), back: foot("back", back), push: false } as RiderControls;
}

function run(
  rider: Rider,
  c: RiderControls,
  b: BoardKinematics,
  steps: number,
): readonly RiderChange[] {
  const changes: RiderChange[] = [];
  for (let i = 0; i < steps; i += 1) changes.push(...rider.update(c, b, DT));
  return changes;
}

describe("Rider aggregate", () => {
  it("starts with both feet attached at their rest positions on the grip tape", () => {
    const rider = new Rider(DECK, RIDER_CONFIG, board());
    const { front, back, bailed } = rider.state;
    expect(bailed).toBe(false);
    expect(front.contact).toBe("attached");
    expect(front.deckPosition.alongM).toBeCloseTo(RIDER_CONFIG.feet.frontRestAlongM);
    expect(back.deckPosition.alongM).toBeCloseTo(RIDER_CONFIG.feet.backRestAlongM);
    const expected = Transform.toWorldPoint(START, deckTopPointLocal(DECK, 0.12, 0));
    expect(Vec3.equals(front.positionWorldM, expected, 1e-9)).toBe(true);
  });

  it("derives attached feet's world position from the board transform", () => {
    const rider = new Rider(DECK, RIDER_CONFIG, board());
    const turned = Transform.create(
      Vec3.create(3, 0.09, -2),
      Quat.fromAxisAngle(Vec3.UNIT_Y, Math.PI / 2),
    );
    rider.update(NEUTRAL_CONTROLS, board({ transform: turned }), DT);
    const expected = Transform.toWorldPoint(turned, deckTopPointLocal(DECK, -0.2, 0));
    expect(Vec3.equals(rider.state.back.positionWorldM, expected, 1e-9)).toBe(true);
  });

  it("slides a foot toward its stick target at most maxSlideSpeed", () => {
    const rider = new Rider(DECK, RIDER_CONFIG, board());
    rider.update(controls({}, { y: -1 }), board(), DT);
    const moved = RIDER_CONFIG.feet.backRestAlongM - rider.state.back.deckPosition.alongM;
    expect(moved).toBeCloseTo(RIDER_CONFIG.feet.maxSlideSpeedMps * DT, 9);
    run(rider, controls({}, { y: -1 }), board(), 30);
    expect(rider.state.back.deckPosition.alongM).toBeCloseTo(-0.38, 6);
    expect(rider.state.back.pressure).toBeCloseTo(1, 6);
  });

  it("keeps a foot on the deck (clamped at the edge) while grounded", () => {
    const rider = new Rider(DECK, RIDER_CONFIG, board());
    const changes = run(rider, controls({ x: 1 }), board(), 30);
    expect(changes).toEqual([]);
    expect(rider.state.front.contact).toBe("attached");
    expect(rider.state.front.deckPosition.acrossM).toBeCloseTo(0.105, 9);
  });

  it("detaches a foot that leaves the deck area in the air (leftDeck)", () => {
    const rider = new Rider(DECK, RIDER_CONFIG, board());
    const changes = rider.update(controls({ x: 1 }), board({ grounded: false }), DT);
    expect(changes).toEqual([{ type: "FootDetached", foot: "front", reason: "leftDeck" }]);
    expect(rider.state.front.contact).toBe("airborne");
    expect(rider.state.front.pressure).toBe(0);
  });

  it("detaches a foot when board spin moves the deck under it too fast (tooFast)", () => {
    const rider = new Rider(DECK, RIDER_CONFIG, board());
    // 25 rad/s of yaw: the back foot at 0.2 m sees 5 m/s, the front at 0.12 m sees 3 m/s.
    const changes = rider.update(
      NEUTRAL_CONTROLS,
      board({ angularVelocityRadps: Vec3.create(0, 25, 0) }),
      DT,
    );
    expect(changes).toEqual([{ type: "FootDetached", foot: "back", reason: "tooFast" }]);
    expect(rider.state.front.contact).toBe("attached");
  });

  it("detaches feet when the board flips away in the air (separated)", () => {
    const rider = new Rider(DECK, RIDER_CONFIG, board());
    const rolled = Transform.create(START.positionM, Quat.fromAxisAngle(Vec3.UNIT_X, degToRad(90)));
    const changes = rider.update(
      NEUTRAL_CONTROLS,
      board({ grounded: false, transform: rolled }),
      DT,
    );
    expect(changes).toEqual([
      { type: "FootDetached", foot: "front", reason: "separated" },
      { type: "FootDetached", foot: "back", reason: "separated" },
    ]);
  });

  it("reattaches within the catch radius once the stick is back and the board upright", () => {
    const rider = new Rider(DECK, RIDER_CONFIG, board());
    const air = board({ grounded: false });
    run(rider, controls({ x: 1 }), air, 1);
    expect(rider.state.front.contact).toBe("airborne");
    // Still past the edge: no reattach, the detached timer runs.
    run(rider, controls({ x: 1 }), air, 10);
    expect(rider.state.front.contact).toBe("airborne");
    expect(rider.state.front.detachedForS).toBeCloseTo(10 * DT, 9);
    // Airborne feet hover above their spot, near the deck.
    const hover = Vec3.distance(
      rider.state.front.positionWorldM,
      Transform.toWorldPoint(START, deckTopPointLocal(DECK, 0.12, 0.12)),
    );
    expect(hover).toBeLessThan(RIDER_CONFIG.feet.catchRadiusM);
    const changes = run(rider, NEUTRAL_CONTROLS, air, 1);
    expect(changes).toEqual([
      { type: "FootAttached", foot: "front", deckPosition: { alongM: 0.12, acrossM: 0 } },
    ]);
    expect(rider.state.front.detachedForS).toBe(0);
  });

  it("does not reattach to a board that is still upside down or out of reach", () => {
    const rider = new Rider(DECK, RIDER_CONFIG, board());
    const flipped = Transform.create(START.positionM, Quat.fromAxisAngle(Vec3.UNIT_X, Math.PI));
    run(rider, NEUTRAL_CONTROLS, board({ grounded: false, transform: flipped }), 20);
    expect(rider.state.front.contact).toBe("airborne");
    expect(rider.state.back.contact).toBe("airborne");
    const away = Transform.create(Vec3.create(0, 2, 0), Quat.IDENTITY);
    // Teleported far away: the torso lags behind, so the feet are out of the catch radius.
    const changes = rider.update(NEUTRAL_CONTROLS, board({ grounded: false, transform: away }), DT);
    expect(changes).toEqual([]);
  });

  it("bails when both feet stay off while the board is on its wheels", () => {
    const rider = new Rider(DECK, RIDER_CONFIG, board());
    const offBoth = controls({ x: 1 }, { x: 1 });
    run(rider, offBoth, board({ grounded: false }), 1);
    const limitSteps = Math.floor(RIDER_CONFIG.bail.feetDetachedAfterLandingS / DT);
    expect(run(rider, offBoth, board(), limitSteps - 1)).toEqual([]);
    const changes = run(rider, offBoth, board(), 3);
    expect(changes).toEqual([{ type: "RiderBailed", reason: "feetDetached" }]);
    expect(rider.state.bailed).toBe(true);
    // Only once, and no more attach/detach while bailed.
    expect(run(rider, NEUTRAL_CONTROLS, board(), 60)).toEqual([]);
  });

  it("does not bail if a foot catches in time", () => {
    const rider = new Rider(DECK, RIDER_CONFIG, board());
    run(rider, controls({ x: 1 }, { x: 1 }), board({ grounded: false }), 1);
    run(rider, controls({ x: 1 }, { x: 1 }), board(), 10);
    const changes = run(rider, controls({}, { x: 1 }), board(), 120);
    expect(changes.map((c) => c.type)).toEqual(["FootAttached"]);
    expect(rider.state.bailed).toBe(false);
  });

  it("bails on an upside-down or off-angle landing, not on a clean one", () => {
    expect(new Rider(DECK, RIDER_CONFIG, board()).land(0.98)).toEqual([]);
    expect(new Rider(DECK, RIDER_CONFIG, board()).land(-0.9)).toEqual([
      { type: "RiderBailed", reason: "upsideDown" },
    ]);
    expect(new Rider(DECK, RIDER_CONFIG, board()).land(Math.cos(1.2))).toEqual([
      { type: "RiderBailed", reason: "offAngle" },
    ]);
  });

  it("bails when the board rests upside down", () => {
    const rider = new Rider(DECK, RIDER_CONFIG, board());
    const flipped = Transform.create(START.positionM, Quat.fromAxisAngle(Vec3.UNIT_X, Math.PI));
    const resting = board({
      grounded: false,
      transform: flipped,
      contacts: { tail: false, nose: false, deck: true },
    });
    const changes = run(rider, NEUTRAL_CONTROLS, resting, 40);
    expect(changes.filter((c) => c.type === "RiderBailed")).toEqual([
      { type: "RiderBailed", reason: "upsideDown" },
    ]);
  });

  it("reset puts the feet back and clears the bail", () => {
    const rider = new Rider(DECK, RIDER_CONFIG, board());
    rider.land(-1);
    run(rider, controls({ x: 1 }), board({ grounded: false }), 5);
    rider.reset(board());
    expect(rider.state.bailed).toBe(false);
    expect(rider.state.front.contact).toBe("attached");
    expect(rider.state.front.deckPosition).toEqual({ alongM: 0.12, acrossM: 0 });
  });

  it("the torso follows a board rolling at constant speed without lag", () => {
    const rider = new Rider(DECK, RIDER_CONFIG, board({ linearVelocityMps: Vec3.create(3, 0, 0) }));
    let position = START.positionM;
    for (let i = 0; i < 240; i += 1) {
      position = Vec3.add(position, Vec3.create(3 * DT, 0, 0));
      rider.update(
        NEUTRAL_CONTROLS,
        board({
          transform: Transform.create(position, Quat.IDENTITY),
          linearVelocityMps: Vec3.create(3, 0, 0),
        }),
        DT,
      );
    }
    const torso = rider.state.torsoPositionWorldM;
    expect(torso.x).toBeCloseTo(position.x, 1);
    expect(torso.y).toBeCloseTo(position.y + RIDER_CONFIG.torso.heightM, 2);
  });
});
