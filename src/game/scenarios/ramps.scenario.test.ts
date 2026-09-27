import { afterEach, describe, expect, it } from "vitest";
import type { BoardSnapshot } from "../../contexts/board";
import { BOARD_CONFIG, BoardSpec } from "../../contexts/board";
import { BoardHarness, STEP_S } from "../../contexts/board/infrastructure/board-harness";
import type { Obstacle } from "../../contexts/world";
import {
  ObstacleShape,
  obstacleCollider,
  quarterPipeLipXM,
  stairsFootXM,
  stairsHeightM,
  stairsSlopeRad,
} from "../../contexts/world";
import type { DomainEvent } from "../../shared";
import { degToRad, Quat, Transform, Vec3 } from "../../shared";

/*
 * HEADLESS RAMP SCENARIOS (M3, board only, real Rapier). The board is driven exactly like
 * the game loop drives it (prePhysics → step → postPhysics), with no rider: launched at a
 * speed, it must ride the M3 obstacles built by the world domain's geometry — the same
 * pieces the renderer draws (ADR 0008). These pin the collider choice and the tyre model
 * on slopes; re-run them after touching board.config.ts or world geometry.
 */

const harnesses: BoardHarness[] = [];

afterEach(() => {
  for (const h of harnesses.splice(0)) h.dispose();
});

function seconds(s: number): number {
  return Math.round(s / STEP_S);
}

function obstacle(
  id: string,
  surface: Obstacle["surface"],
  at: Transform,
  shape: Obstacle["shape"],
): Obstacle {
  return { id, name: id, surface, transform: at, shape };
}

function placedAt(x: number, z = 0, headingRad = 0): Transform {
  return Transform.create(Vec3.create(x, 0, z), Quat.fromAxisAngle(Vec3.UNIT_Y, headingRad));
}

async function harnessWith(
  obstacles: readonly Obstacle[],
  spawn?: Transform,
): Promise<{ h: BoardHarness; events: DomainEvent[] }> {
  const colliders = obstacles.map((o) => obstacleCollider(o));
  const h = await BoardHarness.create(
    spawn === undefined ? { obstacles: colliders } : { obstacles: colliders, spawn },
  );
  harnesses.push(h);
  const events: DomainEvent[] = [];
  h.bus.subscribeAll((e) => events.push(e));
  return { h, events };
}

/** Sets the board's velocity to `speedMps` along its nose, keeping its pose. */
function launch(h: BoardHarness, speedMps: number): void {
  const t = h.body.getTransform();
  h.body.resetTo(t, Transform.toWorldDirection(t, Vec3.create(speedMps, 0, 0)));
}

function noseDir(s: BoardSnapshot): Vec3 {
  return Transform.toWorldDirection(s.transform, Vec3.UNIT_X);
}

function upDir(s: BoardSnapshot): Vec3 {
  return Transform.toWorldDirection(s.transform, Vec3.UNIT_Y);
}

/** Lowest wheel bottom (world y) of the board, m. */
function lowestWheelY(h: BoardHarness): number {
  const t = h.body.getTransform();
  const r = h.spec.wheels.radiusM;
  let min = Infinity;
  for (const wheel of [
    "noseLeftWheel",
    "noseRightWheel",
    "tailLeftWheel",
    "tailRightWheel",
  ] as const) {
    min = Math.min(min, Transform.toWorldPoint(t, BoardSpec.wheelCenterLocal(h.spec, wheel)).y - r);
  }
  return min;
}

/** A 1.3 m quarter pipe on a 2.2 m radius (the kind's fixture: the old park's). */
const QP = ObstacleShape.quarterPipe({
  radiusM: 2.2,
  heightM: 1.3,
  widthM: 5,
  deckDepthM: 1.2,
  copingRadiusM: 0.03,
});
const QP_TOE_X = 2;

describe("quarter pipe (board only)", () => {
  it("at 4 m/s: climbs, stalls below the coping and rolls back down fakie without bouncing", async () => {
    const { h, events } = await harnessWith([obstacle("qp", "ramp", placedAt(QP_TOE_X), QP)]);
    h.run(seconds(0.25));
    launch(h, 4);
    events.length = 0;
    let maxY = 0;
    let stallS = -1;
    let minWheels = 4;
    let maxPitchUp = 0;
    for (let i = 0; i < seconds(3); i += 1) {
      h.step();
      const s = h.system.snapshot;
      maxY = Math.max(maxY, s.transform.positionM.y);
      maxPitchUp = Math.max(maxPitchUp, noseDir(s).y);
      minWheels = Math.min(minWheels, s.wheelsDown);
      if (stallS < 0 && Vec3.dot(s.linearVelocityMps, noseDir(s)) < 0) stallS = i * STEP_S;
    }
    const s = h.system.snapshot;
    // It climbed well up the transition (4 m/s ≈ 0.8 m of rise) but stalled below the lip.
    expect(maxY).toBeGreaterThan(0.6);
    expect(maxY).toBeLessThan(QP.heightM);
    expect(maxPitchUp).toBeGreaterThan(Math.sin(degToRad(35))); // riding the wall
    expect(stallS).toBeGreaterThan(0.8);
    expect(stallS).toBeLessThan(1.6);
    // Never left the surface, and never lost a wheel: no bounce at the toe or the seams.
    expect(minWheels).toBe(4);
    expect(events.filter((e) => e.type === "BoardLeftGround")).toEqual([]);
    // Back on the flat, rolling backward (fakie) nearly as fast as it went in.
    expect(s.transform.positionM.x).toBeLessThan(QP_TOE_X - 1);
    expect(noseDir(s).x).toBeGreaterThan(0.99); // still facing the ramp
    expect(Vec3.dot(s.linearVelocityMps, noseDir(s))).toBeLessThan(-3.2);
    expect(Math.abs(s.linearVelocityMps.z)).toBeLessThan(0.1);
    expect(s.wheelsDown).toBe(4);
  });

  it("at 7 m/s: rides up the wall and goes above the coping into the air", async () => {
    const { h, events } = await harnessWith([obstacle("qp", "ramp", placedAt(QP_TOE_X), QP)]);
    h.run(seconds(0.25));
    launch(h, 7);
    events.length = 0;
    let maxWheelY = 0;
    let airborneAboveCoping = false;
    let maxSpinRadps = 0;
    let wheelsOnWallBeforeLip = false;
    const lipX = QP_TOE_X + quarterPipeLipXM(QP);
    for (let i = 0; i < seconds(1.2); i += 1) {
      h.step();
      const s = h.system.snapshot;
      const wheelY = lowestWheelY(h);
      maxWheelY = Math.max(maxWheelY, wheelY);
      maxSpinRadps = Math.max(maxSpinRadps, Vec3.length(s.angularVelocityRadps));
      if (s.wheelsDown === 4 && s.transform.positionM.y > 0.8) wheelsOnWallBeforeLip = true;
      if (!s.grounded && wheelY > QP.heightM + 0.05) airborneAboveCoping = true;
    }
    expect(wheelsOnWallBeforeLip).toBe(true); // four wheels on the wall up to the lip
    expect(airborneAboveCoping).toBe(true);
    expect(maxWheelY).toBeGreaterThan(QP.heightM + 0.3);
    expect(events.some((e) => e.type === "BoardLeftGround")).toBe(true);
    expect(maxSpinRadps).toBeLessThan(15); // no explosive contact at the lip
    expect(lipX).toBeGreaterThan(QP_TOE_X);
  });
});

describe("bank (board only)", () => {
  const ANGLE = degToRad(20);
  const BANK = ObstacleShape.bank({ angleRad: ANGLE, lengthM: 3, widthM: 30 });

  /** Board on the slope, nose along +Z (across the fall line), rolling at 3 m/s. */
  /** Kinetic + potential energy per kg of the board frame origin, J/kg. */
  function energy(s: BoardSnapshot): number {
    return (
      0.5 * Vec3.lengthSq(s.linearVelocityMps) -
      BOARD_CONFIG.physics.gravityMps2 * s.transform.positionM.y
    );
  }

  async function acrossTheBank(
    leanNm: number,
  ): Promise<{ h: BoardHarness; slips: number[]; wheels: number[]; energyStart: number }> {
    const n = Vec3.create(-Math.sin(ANGLE), Math.cos(ANGLE), 0);
    const surfaceM = Vec3.create(1.4, 1.4 * Math.tan(ANGLE), -8);
    const rotation = Quat.multiply(
      Quat.fromAxisAngle(Vec3.UNIT_Z, ANGLE),
      Quat.fromAxisAngle(Vec3.UNIT_Y, -Math.PI / 2),
    );
    const spec = BoardSpec.create(BOARD_CONFIG.spec);
    const spawn = Transform.create(
      Vec3.add(surfaceM, Vec3.scale(n, BoardSpec.restHeightM(spec))),
      rotation,
    );
    const { h } = await harnessWith([obstacle("bank", "ramp", placedAt(0), BANK)], spawn);
    // A rider leaning: a 500 N press off-centre across the deck (+ = toward board +Z).
    const lean = (): void => {
      if (leanNm === 0) return;
      const t = h.body.getTransform();
      h.body.applyForceAtPoint(
        Transform.toWorldDirection(t, Vec3.create(0, -500, 0)),
        Transform.toWorldPoint(t, BoardSpec.deckTopPointLocal(h.spec, 0, leanNm / 500)),
      );
    };
    h.run(seconds(0.1), lean);
    launch(h, 3);
    h.step(lean);
    const energyStart = energy(h.system.snapshot);
    const slips: number[] = [];
    const wheels: number[] = [];
    for (let i = 0; i < seconds(1.2); i += 1) {
      h.step(lean);
      const s = h.system.snapshot;
      slips.push(
        Vec3.dot(s.linearVelocityMps, Transform.toWorldDirection(s.transform, Vec3.UNIT_Z)),
      );
      wheels.push(s.wheelsDown);
    }
    return { h, slips, wheels, energyStart };
  }

  it("rolls across a 20° bank on four wheels without sliding off, and carves with a lean", async () => {
    const free = await acrossTheBank(0);
    const carve = await acrossTheBank(-15); // lean toward board −Z: uphill here
    // Sideways slip in the bank plane stays small: the grip damper holds the board
    // against gravity with a slow creep (≈ 4 cm/s, ADR 0003 understeer) …
    expect(Math.max(...free.slips.map(Math.abs))).toBeLessThan(0.06);
    // … and a hard carve slips a little more while it bites (≈ 3° at 3 m/s), then settles.
    expect(Math.max(...carve.slips.map(Math.abs))).toBeLessThan(0.2);
    expect(Math.abs(carve.slips[carve.slips.length - 1] ?? 1)).toBeLessThan(0.05);
    for (const run of [free, carve]) {
      expect(Math.min(...run.wheels)).toBe(4); // stays on the slope, no tipping
      const s = run.h.system.snapshot;
      expect(s.transform.positionM.x).toBeGreaterThan(0.2); // still on the slope
      expect(s.transform.positionM.x).toBeLessThan(3 * Math.cos(ANGLE));
      // The grip and rolling forces act in the bank plane (the contact normal, not world
      // up), so they neither lift nor launch the board: only rolling resistance and the
      // grip damper's slip take energy (a few % over the run).
      const lost = run.energyStart - energy(s);
      expect(lost).toBeGreaterThan(0);
      expect(lost).toBeLessThan(0.1 * run.energyStart);
    }
    // Rolling free across the slope it keeps its speed; carving uphill trades it for height.
    expect(Vec3.length(free.h.system.snapshot.linearVelocityMps)).toBeGreaterThan(2.5);
    expect(carve.h.system.snapshot.transform.positionM.y).toBeGreaterThan(
      free.h.system.snapshot.transform.positionM.y + 0.2,
    );
    // Carving: leaning uphill turns the nose uphill (+X) compared with rolling free,
    // which drifts down the fall line as a real board does.
    const freeNose = noseDir(free.h.system.snapshot);
    const carveNose = noseDir(carve.h.system.snapshot);
    expect(carveNose.x - freeNose.x).toBeGreaterThan(0.3);
    expect(carveNose.x).toBeGreaterThan(0.1);
  });
});

describe("landing on a slope", () => {
  it("BoardLanded.surfaceUpDot measures the tilt against the landing surface, not world up", async () => {
    const angle = degToRad(20);
    const bank = ObstacleShape.bank({ angleRad: angle, lengthM: 3, widthM: 4 });
    const spec = BoardSpec.create(BOARD_CONFIG.spec);
    const n = Vec3.create(-Math.sin(angle), Math.cos(angle), 0);
    // Flush with the slope (nose up the fall line), 5 cm above it.
    const surfaceM = Vec3.create(1.4, 1.4 * Math.tan(angle), 0);
    const spawn = Transform.create(
      Vec3.add(surfaceM, Vec3.scale(n, BoardSpec.restHeightM(spec) + 0.05)),
      Quat.fromAxisAngle(Vec3.UNIT_Z, angle),
    );
    const { h, events } = await harnessWith([obstacle("bank", "ramp", placedAt(0), bank)], spawn);
    h.run(seconds(0.3));
    const landed = events.find((e) => e.type === "BoardLanded");
    if (landed?.type !== "BoardLanded") throw new Error("never landed");
    expect(landed.upDot).toBeCloseTo(Math.cos(angle), 2); // 20° from world up …
    expect(landed.surfaceUpDot).toBeGreaterThan(0.999); // … but flush with the bank
  });
});

describe("kicker (board only)", () => {
  it("launches the board: airborne past the lip, then lands on its wheels", async () => {
    const kicker = ObstacleShape.kicker({ lengthM: 1.4, heightM: 0.32, widthM: 1.2 });
    const { h, events } = await harnessWith([obstacle("kicker", "ramp", placedAt(2), kicker)]);
    h.run(seconds(0.25));
    launch(h, 5);
    events.length = 0;
    let maxWheelY = 0;
    let maxSpin = 0;
    for (let i = 0; i < seconds(2); i += 1) {
      h.step();
      maxWheelY = Math.max(maxWheelY, lowestWheelY(h));
      maxSpin = Math.max(maxSpin, Vec3.length(h.system.snapshot.angularVelocityRadps));
    }
    const left = events.find((e) => e.type === "BoardLeftGround");
    const landed = events.find((e) => e.type === "BoardLanded");
    expect(left).toBeDefined();
    expect(landed).toBeDefined();
    if (landed?.type !== "BoardLanded") throw new Error("no landing");
    expect(landed.airtimeS).toBeGreaterThan(0.2);
    expect(maxWheelY).toBeGreaterThan(kicker.heightM + 0.1); // it flew above the lip
    // Without a rider to level it, it lands nose-first and slaps flat: a brief spin, no explosion.
    expect(maxSpin).toBeLessThan(30);
    const s = h.system.snapshot;
    expect(upDir(s).y).toBeGreaterThan(0.95);
    expect(s.wheelsDown).toBe(4);
    expect(s.transform.positionM.x).toBeGreaterThan(2 + kicker.lengthM);
    expect(Vec3.dot(s.linearVelocityMps, noseDir(s))).toBeGreaterThan(3);
  });
});

describe("rails, ledges, stairs (board only)", () => {
  it("dropping onto a flat rail with the trucks reports a grindable SurfaceContactStarted", async () => {
    const rail = ObstacleShape.rail({
      lengthM: 4,
      heightM: 0.35,
      barRadiusM: 0.024,
      profile: "round",
    });
    const spec = BoardSpec.create(BOARD_CONFIG.spec);
    // Board along the rail (heading +X), trucks right above the bar, moving along it.
    const axleBelowOriginM = spec.deck.thicknessM / 2 + spec.trucks.heightM;
    const spawn = Transform.create(
      Vec3.create(-1, rail.heightM + axleBelowOriginM + 0.05, 0),
      Quat.IDENTITY,
    );
    const { h, events } = await harnessWith(
      [obstacle("rail", "grindable", placedAt(0), rail)],
      spawn,
    );
    h.body.resetTo(spawn, Vec3.create(2, 0, 0));
    h.run(seconds(0.4));
    const grind = events.filter(
      (e) => e.type === "SurfaceContactStarted" && e.surface === "grindable",
    );
    expect(grind.length).toBeGreaterThan(0);
    const first = grind[0];
    if (first?.type !== "SurfaceContactStarted") throw new Error("no grind contact");
    expect(first.obstacleId).toBe("rail");
    expect(["noseTruck", "tailTruck"]).toContain(first.part);
  });

  /** A 5-stair with a hubba and a handrail (the kind's fixture: the old park's). */
  const STAIRS = ObstacleShape.stairs({
    stepCount: 5,
    riseM: 0.16,
    runM: 0.32,
    widthM: 3.5,
    topDepthM: 8,
    hubba: { widthM: 0.45, heightM: 0.35, edgeRadiusM: 0.02, flatTopM: 0.9 },
    handrail: { heightM: 0.8, barRadiusM: 0.024, offsetM: 0.3 },
  });
  const H = stairsHeightM(STAIRS);

  it("at 4.5 m/s off the top platform: clears the stairs and lands on the flat without exploding", async () => {
    const spec = BoardSpec.create(BOARD_CONFIG.spec);
    const spawn = Transform.create(
      Vec3.create(-3, H + BoardSpec.restHeightM(spec), 0),
      Quat.IDENTITY,
    );
    const { h, events } = await harnessWith(
      [obstacle("stairs", "ground", placedAt(0), STAIRS)],
      spawn,
    );
    h.run(seconds(0.25));
    launch(h, 4.5);
    events.length = 0;
    let maxSpin = 0;
    let maxSpeed = 0;
    for (let i = 0; i < seconds(2.5); i += 1) {
      h.step();
      const s = h.system.snapshot;
      maxSpin = Math.max(maxSpin, Vec3.length(s.angularVelocityRadps));
      maxSpeed = Math.max(maxSpeed, Vec3.length(s.linearVelocityMps));
    }
    const landed = events.find((e) => e.type === "BoardLanded");
    if (landed?.type !== "BoardLanded") throw new Error("never landed");
    expect(landed.airtimeS).toBeGreaterThan(0.25);
    expect(maxSpin).toBeLessThan(20);
    expect(maxSpeed).toBeLessThan(7); // 4.5 m/s + a 0.8 m drop ≈ 6 m/s at touchdown
    const s = h.system.snapshot;
    // Rolling away on the flat bottom, upright on four wheels.
    expect(s.transform.positionM.x).toBeGreaterThan((STAIRS.stepCount - 1) * STAIRS.runM + 1);
    expect(s.transform.positionM.y).toBeLessThan(0.2);
    expect(upDir(s).y).toBeGreaterThan(0.95);
    expect(s.wheelsDown).toBe(4);
    expect(Vec3.dot(s.linearVelocityMps, noseDir(s))).toBeGreaterThan(2.5);
  });

  /** Board pose lined up down the stairs' slope, `aboveM` over the line at (x, top, z). */
  function downTheSlope(x: number, topY: number, z: number, aboveM: number): Transform {
    const a = stairsSlopeRad(STAIRS);
    const rotation = Quat.fromAxisAngle(Vec3.UNIT_Z, -a); // nose down the stairs
    return Transform.create(Vec3.create(x, topY + aboveM, z), rotation);
  }

  it("dropping onto the handrail reports grindable; onto the hubba top reports ledge", async () => {
    const spec = BoardSpec.create(BOARD_CONFIG.spec);
    const slope = Math.tan(stairsSlopeRad(STAIRS));
    const x = stairsFootXM(STAIRS) / 2;
    const rail = STAIRS.handrail;
    const hubba = STAIRS.hubba;
    if (rail === undefined || hubba === undefined) throw new Error("stairs without rails");
    const axleBelowOriginM = spec.deck.thicknessM / 2 + spec.trucks.heightM;

    // Handrail: trucks over the bar.
    const railZ = -STAIRS.widthM / 2 - rail.offsetM;
    const railTopY = H - x * slope + rail.heightM / Math.cos(stairsSlopeRad(STAIRS));
    const onRail = await harnessWith(
      [obstacle("stairs", "ground", placedAt(0), STAIRS)],
      downTheSlope(x, railTopY, railZ, axleBelowOriginM + 0.03),
    );
    onRail.h.run(seconds(0.3));
    const railHit = onRail.events.find(
      (e) => e.type === "SurfaceContactStarted" && e.surface === "grindable",
    );
    expect(railHit).toBeDefined();
    if (railHit?.type === "SurfaceContactStarted") {
      expect(["noseTruck", "tailTruck", "deck"]).toContain(railHit.part);
    }

    // Hubba: wheels onto the flat of its sloped top, away from its steel edge.
    const hubbaZ = STAIRS.widthM / 2 + hubba.widthM / 2 + 0.02;
    const hubbaTopY = H + hubba.heightM - x * slope;
    const onHubba = await harnessWith(
      [obstacle("stairs", "ground", placedAt(0), STAIRS)],
      downTheSlope(x, hubbaTopY, hubbaZ, BoardSpec.restHeightM(spec) + 0.03),
    );
    onHubba.h.run(seconds(0.2));
    const ledgeHit = onHubba.events.find(
      (e) => e.type === "SurfaceContactStarted" && e.surface === "ledge",
    );
    expect(ledgeHit).toBeDefined();
  });
});
