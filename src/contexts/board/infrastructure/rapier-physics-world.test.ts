import { afterEach, describe, expect, it } from "vitest";
import { Quat, TAU, Transform, Vec3 } from "../../../shared";
import { BoardSpec } from "../domain/board-spec";
import { BoardHarness, STEP_S } from "./board-harness";

/*
 * HEADLESS RAPIER SCENARIOS — the regression net for physics tuning (REQUIREMENTS §2.6).
 * Every scenario drives the board exactly like the game loop: BoardSystem.prePhysics →
 * PhysicsWorld.step(1/120) → BoardSystem.postPhysics → bus.flush.
 * If you change board.config.ts, these must still pass.
 */

/** Pop impulse on the tail tip that the rider should use, N·s (board-only scenario). */
const POP_IMPULSE_NS = 4;
/** Roll angular impulse that turns one kickflip during a ~0.5 s ollie, N·m·s. */
const FLIP_TORQUE_IMPULSE_NMS = 0.13;
/** Take-off vertical speed of a plausible ollie (COM rises ≈ 0.3 m), m/s. */
const OLLIE_TAKEOFF_SPEED_MPS = 2.5;

const harnesses: BoardHarness[] = [];

async function harness(options?: Parameters<typeof BoardHarness.create>[0]): Promise<BoardHarness> {
  const h = await BoardHarness.create(options);
  harnesses.push(h);
  return h;
}

afterEach(() => {
  for (const h of harnesses.splice(0)) h.dispose();
});

function seconds(s: number): number {
  return Math.round(s / STEP_S);
}

/** Pushes the board forward (board +X) so its frame origin moves at `speedMps`. */
function launch(h: BoardHarness, velocityLocalMps: Vec3): void {
  const t = h.body.getTransform();
  h.body.resetTo(t, Transform.toWorldDirection(t, velocityLocalMps));
}

describe("RapierPhysicsWorld + PhysicsBoardSystem (headless)", () => {
  it("settles at rest height on four wheels and stays still", async () => {
    const h = await harness();
    const rest = BoardSpec.restHeightM(h.spec);
    h.run(seconds(0.5));
    const settled = h.system.snapshot;
    expect(settled.wheelsDown).toBe(4);
    expect(settled.grounded).toBe(true);
    expect(settled.transform.positionM.y).toBeCloseTo(rest, 3); // ±0.5 mm
    h.events.length = 0;

    h.run(seconds(3));
    const later = h.system.snapshot;
    expect(Vec3.distance(later.transform.positionM, settled.transform.positionM)).toBeLessThan(
      2e-4,
    );
    expect(Vec3.length(later.linearVelocityMps)).toBeLessThan(1e-3);
    expect(Vec3.length(later.angularVelocityRadps)).toBeLessThan(1e-2);
    expect(Quat.equals(later.transform.rotation, Quat.IDENTITY, 1e-7)).toBe(true);
    expect(h.events).toEqual([]); // no contact flicker
  });

  it("reports wheel contacts with the surface, point, upward normal and weight impulse", async () => {
    const h = await harness();
    h.run(seconds(0.5));
    const contacts = h.system.snapshot.contactPoints;
    expect(new Set(contacts.map((c) => c.part))).toEqual(
      new Set(["noseLeftWheel", "noseRightWheel", "tailLeftWheel", "tailRightWheel"]),
    );
    let impulseNs = 0;
    for (const c of contacts) {
      expect(c.surface).toBe("ground");
      expect(c.obstacleId).toBe("ground");
      expect(c.normalWorld.y).toBeGreaterThan(0.99);
      expect(Math.abs(c.pointWorldM.y)).toBeLessThan(2e-3);
      impulseNs += c.normalImpulseNs;
    }
    const weightImpulseNs = h.body.getMassKg() * 9.81 * STEP_S;
    expect(impulseNs).toBeCloseTo(weightImpulseNs, 2);
  });

  it("rolls straight on a forward push and decelerates slowly", async () => {
    const h = await harness();
    h.run(seconds(0.25));
    launch(h, Vec3.create(3, 0, 0));
    h.events.length = 0;
    h.run(seconds(2));
    const s = h.system.snapshot;
    const vx = s.linearVelocityMps.x;
    // Rolling resistance ≈ Crr·g ≈ 0.15 m/s² (+ a little air drag): 3 m/s → ≈ 2.6 m/s.
    expect(vx).toBeLessThan(2.9);
    expect(vx).toBeGreaterThan(2.4);
    expect(Math.abs(s.linearVelocityMps.z)).toBeLessThan(1e-3);
    expect(Math.abs(s.transform.positionM.z)).toBeLessThan(1e-3);
    expect(Math.abs(h.heading())).toBeLessThan(1e-3);
    expect(s.wheelsDown).toBe(4);
    expect(h.events).toEqual([]); // stays grounded every step
  });

  it("kills sideways velocity with wheel grip", async () => {
    const h = await harness();
    h.run(seconds(0.25));
    launch(h, Vec3.create(3, 0, 1));
    h.run(seconds(0.25));
    const s = h.system.snapshot;
    const lateral = Vec3.dot(
      s.linearVelocityMps,
      Transform.toWorldDirection(s.transform, Vec3.UNIT_Z),
    );
    expect(Math.abs(lateral)).toBeLessThan(0.05);
    expect(s.linearVelocityMps.x).toBeGreaterThan(2.8); // grip does not brake the roll
    expect(s.wheelsDown).toBe(4);
  });

  it("carves toward the loaded side: roll torque +X (toward +Z) turns the heading negative", async () => {
    const h = await harness();
    h.run(seconds(0.25));
    // A 500 N rider leaning 3 cm toward +Z (same as a +15 N·m torque about board +X).
    const lean = (): void => {
      const t = h.body.getTransform();
      h.body.applyForceAtPoint(
        Transform.toWorldDirection(t, Vec3.create(0, -500, 0)),
        Transform.toWorldPoint(t, BoardSpec.deckTopPointLocal(h.spec, 0, 0.03)),
      );
    };
    h.run(seconds(0.25), lean);
    expect(h.system.leanRad).toBeGreaterThan(0);
    expect(h.system.steerRad).toBeGreaterThan(0);
    launch(h, Vec3.create(3, 0, 0));
    h.run(seconds(0.5), lean);
    const s = h.system.snapshot;
    expect(h.heading()).toBeLessThan(-0.5); // clockwise seen from above
    expect(s.linearVelocityMps.z).toBeGreaterThan(0.5); // drifting toward +Z
    expect(s.wheelsDown).toBe(4); // carving, not tipping
    expect(Vec3.length(s.linearVelocityMps)).toBeGreaterThan(2.5);
  });

  it(`pops: ${POP_IMPULSE_NS} N·s down on the tail tip strikes the tail and lifts the nose`, async () => {
    const h = await harness();
    h.run(seconds(0.5));
    h.body.applyImpulseAtPoint(
      Vec3.create(0, -POP_IMPULSE_NS, 0),
      h.worldPoint(BoardSpec.tailTipLocal(h.spec)),
    );
    let tailStruck = false;
    let maxNoseM = 0;
    for (let i = 0; i < seconds(1); i += 1) {
      h.step();
      tailStruck ||= h.system.snapshot.contacts.tail;
      maxNoseM = Math.max(maxNoseM, h.worldPoint(BoardSpec.noseTipLocal(h.spec)).y);
    }
    expect(tailStruck).toBe(true);
    expect(maxNoseM).toBeGreaterThan(0.25);
    // …and the board comes back down onto its wheels.
    expect(h.system.snapshot.wheelsDown).toBe(4);
  });

  it(`flips: ${FLIP_TORQUE_IMPULSE_NMS} N·m·s of roll during an ollie turns ≈ 2π and lands on the wheels`, async () => {
    const h = await harness();
    h.run(seconds(0.25));
    const rest = BoardSpec.restHeightM(h.spec);
    h.body.resetTo(
      Transform.create(Vec3.create(0, rest + 0.01, 0), Quat.IDENTITY),
      Vec3.create(0, OLLIE_TAKEOFF_SPEED_MPS, 0),
    );
    let flicked = false;
    let rollRad = 0;
    let landed = false;
    for (let i = 0; i < seconds(1.5) && !landed; i += 1) {
      h.step(() => {
        // The flick happens once the board is clear of the ground, as in a kickflip.
        if (!flicked && h.body.getTransform().positionM.y > rest + 0.1) {
          flicked = true;
          const t = h.body.getTransform();
          h.body.applyTorqueImpulse(
            Transform.toWorldDirection(t, Vec3.create(FLIP_TORQUE_IMPULSE_NMS, 0, 0)),
          );
        }
      });
      const s = h.system.snapshot;
      const boardX = Transform.toWorldDirection(s.transform, Vec3.UNIT_X);
      rollRad += Vec3.dot(s.angularVelocityRadps, boardX) * STEP_S;
      landed = flicked && s.grounded;
    }
    const s = h.system.snapshot;
    expect(landed).toBe(true);
    expect(rollRad).toBeGreaterThan(TAU * 0.9);
    expect(rollRad).toBeLessThan(TAU * 1.1);
    expect(Transform.toWorldDirection(s.transform, Vec3.UNIT_Y).y).toBeGreaterThan(0.95);
    expect(h.events).toContain("BoardLeftGround");
    expect(h.events).toContain("BoardLanded");
  });

  it("lands from 0.5 m on the wheels without an explosive bounce", async () => {
    const h = await harness({ heightAboveRestM: 0.5 });
    const rest = BoardSpec.restHeightM(h.spec);
    let firstGroundedStep = -1;
    let maxYAfterLandingM = 0;
    for (let i = 0; i < seconds(1); i += 1) {
      h.step();
      const s = h.system.snapshot;
      if (firstGroundedStep < 0 && s.grounded) firstGroundedStep = i;
      if (firstGroundedStep >= 0) {
        maxYAfterLandingM = Math.max(maxYAfterLandingM, s.transform.positionM.y);
      }
    }
    const s = h.system.snapshot;
    // Free fall of 0.5 m takes ≈ 0.32 s; grounded within a few steps of touchdown.
    expect(firstGroundedStep).toBeGreaterThan(0);
    expect(firstGroundedStep * STEP_S).toBeLessThan(0.36);
    expect(maxYAfterLandingM - rest).toBeLessThan(0.01);
    expect(s.wheelsDown).toBe(4);
    expect(s.transform.positionM.y).toBeCloseTo(rest, 2);
    expect(h.events.filter((e) => e === "BoardLanded")).toHaveLength(1);
  });

  it("raycasts the ground and can ignore the board", async () => {
    const h = await harness();
    h.run(1);
    const ray = { originWorldM: Vec3.create(0, 1, 0), directionWorld: Vec3.create(0, -1, 0) };
    const hitBoard = h.physics.raycast(ray, { maxDistanceM: 5 });
    expect(hitBoard?.obstacleId).toBeNull();
    const hitGround = h.physics.raycast(ray, { maxDistanceM: 5, excludeBody: h.body });
    expect(hitGround?.obstacleId).toBe("ground");
    expect(hitGround?.surface).toBe("ground");
    expect(hitGround?.distanceM).toBeCloseTo(1, 4);
    expect(hitGround?.normalWorld.y).toBeCloseTo(1, 4);
    expect(h.physics.raycast(ray, { maxDistanceM: 0.5, excludeBody: h.body })).toBeNull();
  });

  it("clears forces after every step", async () => {
    const h = await harness({ heightAboveRestM: 1 });
    h.body.applyForceAtPoint(Vec3.create(0, 1000, 0), h.body.getCenterOfMassWorld());
    h.step();
    const vAfterForce = h.body.getLinearVelocity().y;
    expect(vAfterForce).toBeGreaterThan(1);
    h.step();
    expect(h.body.getLinearVelocity().y).toBeLessThan(vAfterForce); // gravity only now
  });

  it("builds the board mass from the spec", async () => {
    const h = await harness();
    expect(h.body.getMassKg()).toBeCloseTo(BoardSpec.totalMassKg(h.spec), 4);
    // Trucks and wheels hang below the deck: the centre of mass is below the board origin.
    expect(h.body.getCenterOfMassWorld().y).toBeLessThan(h.body.getTransform().positionM.y);
  });
});
