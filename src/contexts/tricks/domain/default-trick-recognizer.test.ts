import { describe, expect, it } from "vitest";
import type { BailReason, DomainEvent, FootId, Kick, Quat as QuatT, Stance } from "../../../shared";
import { FOOT_IDS, Quat, TAU, Vec3 } from "../../../shared";
import { TRICK_TABLE, TRICKS_CONFIG } from "../tricks.config";
import { DefaultTrickRecognizer } from "./default-trick-recognizer";
import type { MotionSample, TrickOutcome } from "./trick-recognizer";

/*
 * Synthetic air sessions through the real recognizer. The board motion is generated from
 * the PHYSICAL definitions (not from the recognizer's sign rule), so these tests pin the
 * sign conventions:
 * - kickflip: the trick controller's flick — roll rate about the board's +X of
 *   −toe × facing (MECHANICS "Kickflip", rider/trick-controller `flip`); heelflip opposite;
 * - backside shove: the rider's TAIL end swings toward the HEEL side (MECHANICS "Shove
 *   direction naming"); frontside opposite — whichever kick popped;
 * - backside body spin: the rider's back turns toward the front first (MECHANICS
 *   "Prefixes"); the rider faces the toe edge (+Z of the rider frame in regular).
 */

const DT = 1 / 120;
const AIR_STEPS = 72;
const AIR_S = AIR_STEPS * DT;

interface Air {
  readonly stance: Stance;
  readonly kick?: Kick;
  /** Rider-sense full turns: + kickflip. */
  readonly flipTurns?: number;
  /** Rider-sense half turns: + backside (tail to the heel side). */
  readonly shoveHalfTurns?: number;
  /** Rider-sense half turns: + backside (back turns forward first). */
  readonly bodyHalfTurns?: number;
  /** The board under the rider the other way round (nose at the rider's back). */
  readonly boardBackwards?: boolean;
  readonly fakie?: boolean;
  readonly switchStance?: boolean;
  /** Scales the flip (under-rotation < 1). */
  readonly flipScale?: number;
  readonly caught?: boolean;
  readonly popped?: boolean;
  readonly headingRad?: number;
  readonly landingUpDot?: number;
  readonly wheelsDown?: number;
  /** Rider bails at this air step instead of landing. */
  readonly riderBailsAtStep?: number;
}

function toeSide(stance: Stance): 1 | -1 {
  return stance === "regular" ? 1 : -1;
}

function riderAxes(headingRad: number) {
  const yaw = Quat.fromAxisAngle(Vec3.UNIT_Y, headingRad);
  return { forward: Quat.rotate(yaw, Vec3.UNIT_X), side: Quat.rotate(yaw, Vec3.UNIT_Z) };
}

function sample(tick: number, rotation: QuatT, velocity: Vec3, grounded: boolean): MotionSample {
  return {
    tick,
    timeS: tick * DT,
    transform: { rotation },
    linearVelocityMps: velocity,
    wheelsDown: grounded ? 4 : 0,
    grounded,
  };
}

/** Runs one takeoff → landing through the recognizer and returns every outcome. */
function fly(air: Air): TrickOutcome[] {
  const kick = air.kick ?? "tail";
  const riding: Stance = air.switchStance
    ? air.stance === "regular"
      ? "goofy"
      : "regular"
    : air.stance;
  const toe = toeSide(riding);
  const h0 = air.headingRad ?? 0.3;
  const { forward, side } = riderAxes(h0);
  const facing = air.boardBackwards ? -1 : 1;
  let q = Quat.fromAxisAngle(Vec3.UNIT_Y, h0 + (air.boardBackwards ? Math.PI : 0));
  const velocity = Vec3.scale(forward, air.fakie ? -3 : 3);
  let heading = h0;
  const pose = () => ({ headingRad: heading, switchStance: air.switchStance ?? false });

  // Flip: the controller's roll about the board's own +X (kickflip = −toe × facing).
  const flipRad = (air.flipTurns ?? 0) * TAU * (air.flipScale ?? 1);
  const localRollRate = (-toe * facing * flipRad) / AIR_S;
  // Shove: sign of the yaw rate that swings the tail (−forward) toward the heel side (−toe·side).
  const heel = Vec3.scale(side, -toe);
  const bsYawSign = Math.sign(Vec3.dot(Vec3.cross(Vec3.UNIT_Y, Vec3.scale(forward, -1)), heel));
  const yawRate = (bsYawSign * (air.shoveHalfTurns ?? 0) * Math.PI) / AIR_S;
  // Body: the yaw rate that turns the back (−toe·side) toward the front first.
  const back = Vec3.scale(side, -toe);
  const bsBodySign = Math.sign(Vec3.dot(Vec3.cross(Vec3.UNIT_Y, back), forward));
  const bodyRate = (bsBodySign * (air.bodyHalfTurns ?? 0) * Math.PI) / AIR_S;

  const rec = new DefaultTrickRecognizer(TRICKS_CONFIG, TRICK_TABLE, air.stance);
  const out: TrickOutcome[] = [];
  const observe = (s: MotionSample) => out.push(...rec.observe(s, pose()));
  const emit = (e: DomainEvent) => out.push(...rec.onEvent(e));

  let tick = 0;
  observe(sample(tick, q, velocity, true));
  if (air.popped ?? true) {
    emit({
      type: "BoardPopped",
      tick,
      timeS: tick * DT,
      foot: kick === "tail" ? "back" : "front",
      kick,
      impulseNs: 1,
      pointWorldM: Vec3.ZERO,
    });
  }
  tick += 1;
  observe(sample(tick, q, velocity, false));
  for (const foot of FOOT_IDS) {
    emit({ type: "FootDetached", tick, timeS: tick * DT, foot, reason: "jumped" });
  }
  emit({ type: "BoardLeftGround", tick, timeS: tick * DT, velocityMps: velocity });
  const takeoffTick = tick;

  for (let i = 0; i < AIR_STEPS; i += 1) {
    tick += 1;
    // Roll about the board's own X (applied first, local), yaw about world +Y. Composed
    // separately so the long axis stays exactly horizontal (a combined-axis step would
    // tilt it by a second-order error that accumulates).
    const roll = Quat.fromAxisAngle(Vec3.UNIT_X, localRollRate * DT);
    const yaw = Quat.fromAxisAngle(Vec3.UNIT_Y, yawRate * DT);
    q = Quat.multiply(yaw, Quat.multiply(q, roll));
    heading += bodyRate * DT;
    const grounded = i === AIR_STEPS - 1;
    if (grounded && air.riderBailsAtStep === undefined) {
      observe(sample(tick, q, velocity, true));
      break;
    }
    observe(sample(tick, q, velocity, false));
    if (i === air.riderBailsAtStep) {
      emit({ type: "RiderBailed", tick, timeS: tick * DT, reason: "upsideDown" });
      return out;
    }
    if (i === AIR_STEPS - 10 && (air.caught ?? true)) {
      for (const foot of FOOT_IDS) {
        emit({
          type: "FootAttached",
          tick,
          timeS: tick * DT,
          foot,
          deckPosition: { alongM: 0, acrossM: 0 },
        });
      }
    }
  }
  emit({
    type: "BoardLanded",
    tick,
    timeS: tick * DT,
    airtimeS: (tick - takeoffTick) * DT,
    velocityMps: velocity,
    upDot: air.landingUpDot ?? Quat.rotate(q, Vec3.UNIT_Y).y,
    wheelsDown: air.wheelsDown ?? 4,
  });
  // Settle: a few steps on the ground.
  for (let i = 0; i < 60; i += 1) {
    tick += 1;
    observe({ ...sample(tick, q, velocity, true), wheelsDown: air.wheelsDown ?? 4 });
  }
  return out;
}

function landedName(air: Air): string {
  const out = fly(air);
  expect(out).toHaveLength(1);
  const [o] = out;
  if (o?.type !== "TrickLanded") throw new Error(`expected TrickLanded, got ${JSON.stringify(o)}`);
  return o.name;
}

function bailed(air: Air): { name: string | null; reason: BailReason } {
  const out = fly(air);
  expect(out).toHaveLength(1);
  const [o] = out;
  if (o?.type !== "TrickBailed") throw new Error(`expected TrickBailed, got ${JSON.stringify(o)}`);
  return { name: o.name, reason: o.reason };
}

const STANCES: Stance[] = ["regular", "goofy"];
const KICKS: Kick[] = ["tail", "nose"];

/** flip turns × shove half turns → MECHANICS.md name (no prefixes). */
const MATRIX: [number, number, string][] = [
  [0, 0, "Ollie"],
  [0, 1, "BS Pop Shove-it"],
  [0, -1, "FS Pop Shove-it"],
  [0, 2, "360 Shove-it"],
  [0, -2, "FS 360 Shove-it"],
  [1, 0, "Kickflip"],
  [1, 1, "Varial Kickflip"],
  [1, -1, "Hardflip"],
  [1, 2, "360 Flip"],
  [1, -2, "Kickflip + FS 360 Shove-it"],
  [-1, 0, "Heelflip"],
  [-1, 1, "Inward Heelflip"],
  [-1, -1, "Varial Heelflip"],
  [-1, 2, "Heelflip + 360 Shove-it"],
  [-1, -2, "Laser Flip"],
  [2, 0, "Double Kickflip"],
  [-2, 0, "Double Heelflip"],
  [2, 1, "Double Kickflip + BS Shove-it"],
  [-2, -1, "Double Heelflip + FS Shove-it"],
];

describe("recognizer: every cell, both stances, both kicks, board either way round", () => {
  for (const stance of STANCES) {
    for (const kick of KICKS) {
      for (const boardBackwards of [false, true]) {
        const label = `${stance} ${kick}${boardBackwards ? " (board backwards)" : ""}`;
        it.each(MATRIX)(`${label}: flip %i, shove %i → %s`, (flipTurns, shoveHalfTurns, name) => {
          const expected =
            kick === "nose" ? (name === "Ollie" ? "Nollie" : `Nollie ${name}`) : name;
          expect(landedName({ stance, kick, flipTurns, shoveHalfTurns, boardBackwards })).toBe(
            expected,
          );
        });
      }
    }
  }
});

describe("recognizer: prefixes", () => {
  for (const stance of STANCES) {
    it(`${stance}: fakie (rolling backwards vs the rider heading)`, () => {
      expect(landedName({ stance, fakie: true })).toBe("Fakie Ollie");
      expect(landedName({ stance, fakie: true, flipTurns: 1 })).toBe("Fakie Kickflip");
      expect(landedName({ stance, fakie: true, shoveHalfTurns: -1 })).toBe("Fakie FS Pop Shove-it");
    });

    it(`${stance}: switch (the rider reports the other stance): mirrored and prefixed`, () => {
      expect(landedName({ stance, switchStance: true, flipTurns: 1 })).toBe("Switch Kickflip");
      expect(landedName({ stance, switchStance: true, flipTurns: -1, shoveHalfTurns: -1 })).toBe(
        "Switch Varial Heelflip",
      );
    });

    it(`${stance}: body spins`, () => {
      expect(landedName({ stance, bodyHalfTurns: 1 })).toBe("BS 180");
      expect(landedName({ stance, bodyHalfTurns: -1 })).toBe("FS 180");
      expect(landedName({ stance, bodyHalfTurns: 2 })).toBe("360");
      expect(landedName({ stance, bodyHalfTurns: -2 })).toBe("360");
      expect(landedName({ stance, bodyHalfTurns: 1, flipTurns: 1 })).toBe("BS 180 Kickflip");
      expect(landedName({ stance, kick: "nose", bodyHalfTurns: -1, flipTurns: -1 })).toBe(
        "Nollie FS 180 Heelflip",
      );
      expect(landedName({ stance, kick: "nose", bodyHalfTurns: 1 })).toBe("Nollie BS 180");
      expect(landedName({ stance, fakie: true, bodyHalfTurns: -1 })).toBe("Fakie FS 180");
    });
  }

  it("the heading at takeoff does not matter", () => {
    for (const headingRad of [0, 1.2, -2.8, Math.PI]) {
      expect(landedName({ stance: "goofy", headingRad, flipTurns: 1, shoveHalfTurns: 2 })).toBe(
        "360 Flip",
      );
    }
  });
});

describe("recognizer: landings that fail", () => {
  for (const stance of STANCES) {
    for (const kick of KICKS) {
      it(`${stance} ${kick}: under-rotated flip → TrickBailed with the closest name`, () => {
        const b = bailed({ stance, kick, flipTurns: 1, flipScale: 0.85 });
        expect(b.reason).toBe("underRotated");
        expect(b.name).toBe(kick === "nose" ? "Nollie Kickflip" : "Kickflip");
        const h = bailed({ stance, kick, flipTurns: -1, flipScale: 0.85 });
        expect(h.name).toBe(kick === "nose" ? "Nollie Heelflip" : "Heelflip");
      });
    }
  }

  it("a flip within tolerance still lands", () => {
    expect(landedName({ stance: "regular", flipTurns: 1, flipScale: 0.93 })).toBe("Kickflip");
  });

  it("under-rotated shove and body spin bail", () => {
    expect(bailed({ stance: "regular", shoveHalfTurns: 0.6 }).reason).toBe("underRotated");
    expect(bailed({ stance: "goofy", bodyHalfTurns: -0.6 }).name).toBe("FS 180");
  });

  it("not caught → feetDetached", () => {
    expect(bailed({ stance: "regular", flipTurns: 1, caught: false })).toEqual({
      name: "Kickflip",
      reason: "feetDetached",
    });
  });

  it("upside down → upsideDown", () => {
    expect(bailed({ stance: "regular", flipTurns: 1, landingUpDot: -0.9 }).reason).toBe(
      "upsideDown",
    );
  });

  it("too tilted at touchdown → offAngle", () => {
    expect(bailed({ stance: "regular", landingUpDot: Math.cos(0.7) }).reason).toBe("offAngle");
  });

  it("never on four wheels → offAngle", () => {
    expect(bailed({ stance: "regular", wheelsDown: 2 }).reason).toBe("offAngle");
  });

  it("rider bails in the air → TrickBailed with the rider's reason and the trick so far", () => {
    const b = bailed({ stance: "regular", flipTurns: 1, riderBailsAtStep: 70 });
    expect(b.reason).toBe("upsideDown");
    expect(b.name).toBe("Kickflip");
  });

  it("an unpopped air (rolled off an edge) is not named", () => {
    expect(fly({ stance: "regular", popped: false })).toEqual([]);
  });
});

describe("recognizer: air read model and events", () => {
  it("exposes the rider-normalised rotation while in the air, null on the ground", () => {
    const rec = new DefaultTrickRecognizer(TRICKS_CONFIG, TRICK_TABLE, "goofy");
    const pose = { headingRad: 0 };
    let q = Quat.IDENTITY;
    rec.observe(sample(0, q, Vec3.ZERO, true), pose);
    expect(rec.air).toBeNull();
    rec.onEvent({
      type: "BoardPopped",
      tick: 0,
      timeS: 0,
      foot: "back",
      kick: "tail",
      impulseNs: 1,
      pointWorldM: Vec3.ZERO,
    });
    rec.onEvent({ type: "BoardLeftGround", tick: 0, timeS: 0, velocityMps: Vec3.ZERO });
    // Goofy kickflip = +roll about the board's +X (−toe = +1).
    for (let i = 1; i <= 10; i += 1) {
      q = Quat.multiply(q, Quat.fromAxisAngle(Vec3.UNIT_X, 0.1));
      rec.observe(sample(i, q, Vec3.ZERO, false), pose);
    }
    const air = rec.air;
    expect(air?.popped).toBe(true);
    expect(air?.kick).toBe("tail");
    expect(air?.rotation.rollRad).toBeCloseTo(1);
    expect(air?.airtimeS).toBeCloseTo(10 * DT);
    const detached: FootId[] = [];
    expect(air?.detachedFeet).toEqual(detached);
    rec.reset();
    expect(rec.air).toBeNull();
  });

  it("TrickLanded carries the id, stance, airtime and normalised rotation", () => {
    const out = fly({ stance: "goofy", kick: "nose", flipTurns: 1, shoveHalfTurns: 1 });
    const [o] = out;
    expect(o?.type).toBe("TrickLanded");
    if (o?.type !== "TrickLanded") return;
    expect(o.trickId).toBe("nollie-varial-kickflip");
    expect(o.stance).toBe("goofy");
    expect(o.airtimeS).toBeCloseTo(AIR_S);
    expect(o.rotation.rollRad).toBeCloseTo(TAU, 1);
    expect(o.rotation.yawRad).toBeCloseTo(Math.PI, 1);
  });
});
