import { describe, expect, it } from "vitest";
import { Quat, Transform, Vec3 } from "../../../shared";
import { RIDER_CONFIG } from "../rider.config";
import type { FootForce } from "./foot-force";
import type { BoardKinematics, GrindEdgeView } from "./foot-force-model";
import { GrindController } from "./grind-controller";
import { DECK, DT, MASS } from "./test-fixtures";

/*
 * The lock-on and the locked assists (MECHANICS.md M4) against a rail along world X at
 * y = 0.35 (two-sided) and a ledge edge (one-sided, top toward −Z).
 */

const RAIL: GrindEdgeView = {
  obstacleId: "rail",
  surface: "grindable",
  startM: Vec3.create(-2, 0.35, 0),
  endM: Vec3.create(2, 0.35, 0),
  outwardNormal: Vec3.create(0, 0, 1),
  twoSided: true,
  halfWidthM: 0.024,
};

/** Hanger bottom below the board origin, m. */
const HANGER_M =
  DECK.deck.thicknessM / 2 + DECK.trucks.heightM + RIDER_CONFIG.grind.hangerBelowAxleM;

function board(
  position: Vec3,
  headingRad: number,
  velocity = Vec3.create(3, -1, 0),
  rollRad = 0,
): BoardKinematics {
  const q = Quat.multiply(
    Quat.fromAxisAngle(Vec3.UNIT_Y, headingRad),
    Quat.fromAxisAngle(Vec3.UNIT_X, rollRad),
  );
  return {
    transform: Transform.create(position, q),
    linearVelocityMps: velocity,
    angularVelocityRadps: Vec3.ZERO,
    grounded: false,
    contacts: { tail: false, nose: false, deck: false },
  };
}

function tryLock(
  b: BoardKinematics,
  keys: { tail?: boolean; nose?: boolean } = {},
  edges: readonly GrindEdgeView[] = [RAIL],
) {
  const g = new GrindController(DECK, RIDER_CONFIG);
  const locked = g.tryLock({
    board: b,
    edges,
    tailHeld: keys.tail ?? false,
    noseHeld: keys.nose ?? false,
    facing: 1,
    toe: 1,
    airStart: { positionM: Vec3.create(-1, 0.1, 0.5), headingRad: 0 },
  });
  return { g, locked };
}

/** A board flying along the rail, its hangers `gapM` above it. */
const along = (gapM = 0.03) => board(Vec3.create(0, 0.35 + HANGER_M + gapM, 0), 0);
/** A board across the rail, its deck `gapM` above it, the rail under `crossAlongM`. */
const across = (crossAlongM = 0, gapM = 0.03) =>
  board(Vec3.create(0, 0.35 + DECK.deck.thicknessM / 2 + gapM, crossAlongM), Math.PI / 2);

describe("GrindController lock-on: the stance table", () => {
  it("along the edge: 50-50, ↓ 5-0, W nosegrind", () => {
    expect(tryLock(along()).g.report?.kind).toBe("fiftyFifty");
    expect(tryLock(along(), { tail: true }).g.report?.kind).toBe("fiveO");
    expect(tryLock(along(), { nose: true }).g.report?.kind).toBe("noseGrind");
    // Both kicks at once is no press: a 50-50.
    expect(tryLock(along(), { tail: true, nose: true }).g.report?.kind).toBe("fiftyFifty");
  });

  it("across the edge: boardslide (deck middle), ↓ tailslide, W noseslide", () => {
    expect(tryLock(across(0)).g.report?.kind).toBe("boardslide");
    // Heading π/2: the board's +X points to −Z, so the tail (−X) lies toward +Z.
    expect(tryLock(across(-0.32), { tail: true }).g.report?.kind).toBe("tailslide");
    expect(tryLock(across(0.32), { nose: true }).g.report?.kind).toBe("noseslide");
    expect(tryLock(across(0)).g.report?.slide).toBe(true);
  });

  it("frontside when the edge was on the toe side at takeoff", () => {
    // Took off at z = +0.5 (heading 0: toes toward +Z): the rail at z = 0 was on the heel side.
    expect(tryLock(along()).g.report?.side).toBe("backside");
  });

  it("no lock: too far, moving away, mid-flip, between the bands, or no part near", () => {
    expect(tryLock(along(0.1)).locked).toBe(false);
    expect(
      tryLock(board(Vec3.create(0, 0.35 + HANGER_M + 0.03, 0), 0, Vec3.create(3, 1, 0))).locked,
    ).toBe(false);
    expect(
      tryLock(board(Vec3.create(0, 0.35 + HANGER_M + 0.03, 0), 0, undefined, 1.2)).locked,
    ).toBe(false);
    expect(tryLock(board(Vec3.create(0, 0.35 + HANGER_M + 0.03, 0), Math.PI / 4)).locked).toBe(
      false,
    );
    // A tailslide needs the tail over the edge: here the deck middle is.
    expect(tryLock(across(0), { tail: true }).locked).toBe(false);
  });
});

describe("GrindController while locked", () => {
  function hold(b: BoardKinematics, leanToe = 0): { forces: FootForce[]; exit: string | null } {
    const { g } = tryLock(along());
    const forces: FootForce[] = [];
    const exit = g.hold(
      {
        board: b,
        mass: MASS,
        edges: [RAIL],
        dtS: DT,
        leanToe,
        riderSide: Vec3.UNIT_Z,
        toe: 1,
      },
      forces,
    );
    return { forces, exit };
  }

  function linearImpulse(forces: readonly FootForce[]): Vec3 {
    let sum = Vec3.ZERO;
    for (const f of forces) if (f.kind === "impulse") sum = Vec3.add(sum, f.impulseNs);
    return sum;
  }

  it("brakes along the edge by the grind friction, never pushes", () => {
    const b = board(
      Vec3.create(0, 0.35 + HANGER_M + RIDER_CONFIG.grind.hoverM, 0),
      0,
      Vec3.create(3, 0, 0),
    );
    const { forces, exit } = hold(b);
    expect(exit).toBeNull();
    const j = linearImpulse(forces);
    const g = RIDER_CONFIG.tricks.gravityMps2;
    expect(j.x / MASS.massKg).toBeCloseTo(-RIDER_CONFIG.grind.grindFrictionG * g * DT, 6);
    // Moving backwards: the brake flips, still against the motion.
    const back = hold(board(b.transform.positionM, 0, Vec3.create(-2, 0, 0)));
    expect(linearImpulse(back.forces).x).toBeGreaterThan(0);
    // Standing still: no push at all along the edge.
    const still = hold(board(b.transform.positionM, 0, Vec3.ZERO));
    expect(Math.abs(linearImpulse(still.forces).x)).toBeLessThan(1e-9);
  });

  it("pulls the locked point back onto the line square to the edge and carries the weight", () => {
    const off = board(
      Vec3.create(0, 0.35 + HANGER_M + RIDER_CONFIG.grind.hoverM, 0.02),
      0,
      Vec3.ZERO,
    );
    const j = linearImpulse(hold(off).forces);
    expect(j.z).toBeLessThan(0); // back toward z = 0
    // On the line: the lift equals one step of gravity.
    const on = board(Vec3.create(0, 0.35 + HANGER_M + RIDER_CONFIG.grind.hoverM, 0), 0, Vec3.ZERO);
    const lift = linearImpulse(hold(on).forces).y / MASS.massKg;
    expect(lift).toBeCloseTo(RIDER_CONFIG.tricks.gravityMps2 * DT, 4);
  });

  it("rolls off past the end of the edge", () => {
    const past = board(Vec3.create(2.1, 0.35 + HANGER_M, 0), 0, Vec3.create(3, 0, 0));
    expect(hold(past).exit).toBe("rollOff");
  });

  it("falls off when the balance runs out; leaning against it holds it", () => {
    const { g } = tryLock(along());
    const b = board(Vec3.create(0, 0.35 + HANGER_M + RIDER_CONFIG.grind.hoverM, 0), 0, Vec3.ZERO);
    let exit: string | null = null;
    let steps = 0;
    for (; steps < 120 * 20 && exit === null; steps += 1) {
      exit = g.hold(
        {
          board: b,
          mass: MASS,
          edges: [RAIL],
          dtS: DT,
          leanToe: 0,
          riderSide: Vec3.UNIT_Z,
          toe: 1,
        },
        [],
      );
    }
    expect(exit).toBe("fellOff");
    // With the lean against the drift every step, it stays on far longer.
    const held = tryLock(along()).g;
    let heldExit: string | null = null;
    for (let i = 0; i < steps && heldExit === null; i += 1) {
      const lean = -Math.sign(held.report?.balance ?? 0);
      heldExit = held.hold(
        {
          board: b,
          mass: MASS,
          edges: [RAIL],
          dtS: DT,
          leanToe: lean,
          riderSide: Vec3.UNIT_Z,
          toe: 1,
        },
        [],
      );
    }
    expect(heldExit).toBeNull();
  });
});
