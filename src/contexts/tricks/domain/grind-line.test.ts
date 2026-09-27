import { describe, expect, it } from "vitest";
import type { DomainEvent, GrindExit, GrindKind, GrindSide } from "../../../shared";
import { FOOT_IDS, Quat, TAU, Vec3 } from "../../../shared";
import { TRICK_TABLE, TRICKS_CONFIG } from "../tricks.config";
import { DefaultTrickRecognizer } from "./default-trick-recognizer";
import type { RiderPose } from "./rider-frame";
import type { MotionSample, TrickOutcome } from "./trick-recognizer";

/*
 * Grinds and lines (MECHANICS.md M4 "Recognizer") through the real recognizer, with
 * synthetic board motion and rider poses (regular stance, heading 0, rolling along +X).
 */

const DT = 1 / 120;

class Script {
  readonly out: TrickOutcome[] = [];
  private readonly rec = new DefaultTrickRecognizer(TRICKS_CONFIG, TRICK_TABLE, "regular");
  private tick = 0;
  private q: Quat = Quat.IDENTITY;
  private grounded = true;
  private pose: {
    headingRad: number;
    grind: NonNullable<RiderPose["grind"]> | null;
    lastGrindExit: GrindExit | null;
    popOutTurnRad: number;
  } = { headingRad: 0, grind: null, lastGrindExit: null, popOutTurnRad: 0 };

  private get timeS(): number {
    return this.tick * DT;
  }

  private emit(event: DomainEvent): void {
    this.out.push(...this.rec.onEvent(event));
  }

  private observe(): void {
    const sample: MotionSample = {
      tick: this.tick,
      timeS: this.timeS,
      transform: { rotation: this.q },
      linearVelocityMps: Vec3.create(3, 0, 0),
      wheelsDown: this.grounded ? 4 : 0,
      grounded: this.grounded,
    };
    this.out.push(...this.rec.observe(sample, this.pose));
  }

  step(n = 1, rollRadps = 0, bodyRadps = 0): this {
    for (let i = 0; i < n; i += 1) {
      this.tick += 1;
      this.q = Quat.multiply(this.q, Quat.fromAxisAngle(Vec3.UNIT_X, rollRadps * DT));
      this.pose.headingRad += bodyRadps * DT;
      this.q = Quat.multiply(Quat.fromAxisAngle(Vec3.UNIT_Y, bodyRadps * DT), this.q);
      this.observe();
    }
    return this;
  }

  pop(): this {
    this.emit({
      type: "BoardPopped",
      tick: this.tick,
      timeS: this.timeS,
      foot: "back",
      kick: "tail",
      impulseNs: 1,
      pointWorldM: Vec3.ZERO,
    });
    for (const foot of FOOT_IDS) {
      this.emit({
        type: "FootDetached",
        tick: this.tick,
        timeS: this.timeS,
        foot,
        reason: "jumped",
      });
    }
    return this;
  }

  leaveGround(): this {
    this.grounded = false;
    this.step();
    this.emit({
      type: "BoardLeftGround",
      tick: this.tick,
      timeS: this.timeS,
      velocityMps: Vec3.create(3, 0, 0),
    });
    return this;
  }

  catchFeet(): this {
    for (const foot of FOOT_IDS) {
      this.emit({
        type: "FootAttached",
        tick: this.tick,
        timeS: this.timeS,
        foot,
        deckPosition: { alongM: 0, acrossM: 0 },
      });
    }
    return this;
  }

  lock(kind: GrindKind, side: GrindSide): this {
    this.pose.grind = { kind, side, obstacleId: "rail", surface: "grindable" };
    this.pose.lastGrindExit = null;
    return this.step();
  }

  release(exit: GrindExit, turnRad = 0): this {
    this.pose.grind = null;
    this.pose.lastGrindExit = exit;
    this.pose.popOutTurnRad = turnRad;
    this.step();
    if (exit === "popOut") this.pop();
    return this;
  }

  land(upDot = 1): this {
    this.grounded = true;
    this.step();
    this.emit({
      type: "BoardLanded",
      tick: this.tick,
      timeS: this.timeS,
      airtimeS: 0.5,
      velocityMps: Vec3.create(3, 0, 0),
      upDot,
      wheelsDown: 4,
    });
    return this.step(3);
  }

  landedTouchingDuringGrind(): this {
    this.emit({
      type: "BoardLanded",
      tick: this.tick,
      timeS: this.timeS,
      airtimeS: 0.3,
      velocityMps: Vec3.create(3, 0, 0),
      upDot: 1,
      wheelsDown: 2,
    });
    return this;
  }

  riderBails(): this {
    this.emit({ type: "RiderBailed", tick: this.tick, timeS: this.timeS, reason: "lostBalance" });
    return this;
  }

  names(type: TrickOutcome["type"]): string[] {
    return this.out.filter((e) => e.type === type).map((e) => ("name" in e ? String(e.name) : ""));
  }
}

describe("grinds and lines", () => {
  it("a grind rolled into (no pop) is named on its own, with its time and exit", () => {
    const s = new Script().step(2).leaveGround().step(5).lock("fiftyFifty", "frontside");
    s.step(60).release("rollOff").step(20).land().catchFeet().step(2);
    expect(s.names("GrindStarted")).toEqual(["FS 50-50"]);
    const ended = s.out.find((e) => e.type === "GrindEnded");
    expect(ended?.type === "GrindEnded" && ended.exit).toBe("rollOff");
    expect(ended?.type === "GrindEnded" && ended.durationS).toBeCloseTo(61 * DT, 6);
    expect(s.names("TrickLanded")).toEqual(["FS 50-50"]);
    expect(s.names("TrickBailed")).toEqual([]);
  });

  it("a plain ollie into a grind is left out of the line; a wheel touch while locked is no landing", () => {
    const s = new Script().step(2).pop().leaveGround().step(30).catchFeet();
    s.lock("fiveO", "backside").landedTouchingDuringGrind().step(40);
    s.release("rollOff").step(10).land().step(2);
    expect(s.names("TrickLanded")).toEqual(["BS 5-0"]);
  });

  it("a kickflip into a slide with the body's quarter turn is named Kickflip, then the slide", () => {
    // Regular: a kickflip rolls about −X (toe +1); the quarter turn is a frontside Q.
    const s = new Script().step(2).pop().leaveGround();
    s.step(40, -TAU / (40 * DT), Math.PI / 2 / (40 * DT)).catchFeet();
    s.lock("tailslide", "frontside").step(40).release("rollOff").step(10);
    s.step(12, 0, -Math.PI / 2 / (12 * DT))
      .land()
      .step(2);
    expect(s.names("GrindStarted")).toEqual(["FS Tailslide"]);
    expect(s.names("TrickLanded")).toEqual(["Kickflip → FS Tailslide"]);
  });

  it("a pop out keeps its trick name with ' out'; the body's own turn out is not a spin", () => {
    const s = new Script().step(2).leaveGround().step(3).lock("boardslide", "backside").step(40);
    // Pop out, kickflip, the body turns back a quarter on its own (turnRad).
    s.release("popOut", -Math.PI / 2);
    s.step(40, -TAU / (40 * DT), -Math.PI / 2 / (40 * DT))
      .catchFeet()
      .land()
      .step(2);
    expect(s.names("TrickLanded")).toEqual(["BS Boardslide → Kickflip out"]);
  });

  it("losing the balance fails the whole line", () => {
    const s = new Script().step(2).pop().leaveGround().step(30).catchFeet();
    s.lock("fiftyFifty", "frontside").step(40).release("fellOff").riderBails();
    expect(s.names("TrickBailed")).toEqual(["FS 50-50"]);
    expect(s.out.find((e) => e.type === "TrickBailed")).toMatchObject({ reason: "lostBalance" });
    expect(s.names("TrickLanded")).toEqual([]);
  });
});
