/*
 * DEV-ONLY synthetic scene (`/?demo`, optional `&goofy`, `&debug`). Drives the real
 * ThreeRenderer with a scripted, fixed-step "fake game" so the presentation layer can be
 * checked visually while the physics and input contexts are not wired yet. Nothing here
 * is physics: the board pose is a closed-form animation. Loaded with a dynamic import
 * from main.ts, so it never ships in production bundles.
 */
import type { BoardContact, BoardSnapshot } from "../contexts/board";
import { BOARD_CONFIG, BoardSpec, NO_CONTACT, WHEEL_IDS } from "../contexts/board";
import type { FootIntent, IntentFrame } from "../contexts/input";
import { StickValue } from "../contexts/input";
import type { FootState, RiderState } from "../contexts/rider";
import { DeckPosition, RIDER_CONFIG } from "../contexts/rider";
import type { AirSession } from "../contexts/tricks";
import { createFlatGroundLevel, WORLD_CONFIG } from "../contexts/world";
import type { PresentationConfig } from "../presentation/presentation.config";
import { PRESENTATION_CONFIG } from "../presentation/presentation.config";
import type { DebugVector, RenderFrame } from "../presentation/render-frame";
import { ThreeRenderer } from "../presentation/three-renderer";
import type { DomainEvent, FootId, RotationTotals, Stance, Tunable } from "../shared";
import { FixedStepAccumulator, Quat, TAU, Transform, Vec2, Vec3 } from "../shared";
import { GAME_CONFIG } from "./game.config";

/** Script of the demo (dev-only visual fixture, not gameplay tuning). */
const DEMO = Object.freeze({
  speedMps: 4,
  turnRadiusM: 14,
  carveLeanRad: -0.05,
  cycleS: 4,
  holdTailAtS: 1.3,
  popAtS: 1.8,
  airS: 0.55,
  popHeightM: 0.38,
  popPitchRad: 0.32,
  flickS: 0.08,
  frontDetachFromU: 0.08,
  frontDetachToU: 0.72,
  bailResetS: 1.5,
});

type TrickScript = "kickflip" | "shuvit" | "ollie" | "bail";
const SCRIPT: readonly TrickScript[] = ["kickflip", "shuvit", "ollie", "bail"];

const smoothstep = (u: number): number => u * u * (3 - 2 * u);
const clamp01 = (u: number): number => Math.max(0, Math.min(1, u));

interface ScriptSample {
  readonly transform: Transform;
  readonly velocity: Vec3;
  readonly grounded: boolean;
  readonly airtimeS: number;
  readonly rotation: RotationTotals;
  readonly frontStick: StickValue;
  readonly backStick: StickValue;
  readonly frontDetached: boolean;
}

class DemoGame {
  private readonly spec = BoardSpec.create(BOARD_CONFIG.spec);
  private readonly stepS = GAME_CONFIG.loop.fixedStepS;
  private readonly accumulator = new FixedStepAccumulator({
    stepS: GAME_CONFIG.loop.fixedStepS,
    maxStepsPerAdvance: GAME_CONFIG.loop.maxStepsPerFrame,
  });
  private tick = 0;
  private previous: BoardSnapshot;
  private current: BoardSnapshot;
  private sample: ScriptSample;
  private prevFront = StickValue.NEUTRAL;
  private prevBack = StickValue.NEUTRAL;
  private intents: IntentFrame;
  private events: DomainEvent[] = [];
  private impulses: { vector: Omit<DebugVector, "ageS">; timeS: number }[] = [];
  private bailedUntilS = -1;

  constructor(private readonly stance: Stance) {
    this.sample = this.scriptAt(0);
    this.current = this.snapshot(this.sample, 0);
    this.previous = this.current;
    this.intents = this.intentFrame(this.sample);
  }

  get boardSpec(): BoardSpec {
    return this.spec;
  }

  advance(elapsedS: number): void {
    const steps = this.accumulator.advance(elapsedS);
    for (let i = 0; i < steps; i += 1) this.step();
  }

  private step(): void {
    this.tick += 1;
    const timeS = this.tick * this.stepS;
    const before = this.sample;
    this.sample = this.scriptAt(timeS);
    this.previous = this.current;
    this.current = this.snapshot(this.sample, timeS);
    this.intents = this.intentFrame(this.sample);
    this.emitEvents(before, this.sample, timeS);
  }

  /** Closed-form board motion: a big left-hand circle with a trick every cycle. */
  private scriptAt(timeS: number): ScriptSample {
    const s = DEMO.speedMps * timeS;
    const theta = s / DEMO.turnRadiusM;
    const R = DEMO.turnRadiusM;
    const ground = Vec3.create(R * Math.sin(theta), 0, -R + R * Math.cos(theta));
    const velocity0 = Vec3.create(
      DEMO.speedMps * Math.cos(theta),
      0,
      -DEMO.speedMps * Math.sin(theta),
    );

    const cycle = Math.floor(timeS / DEMO.cycleS);
    const trick = SCRIPT[cycle % SCRIPT.length] ?? "ollie";
    const c = timeS - cycle * DEMO.cycleS;
    const airU = (c - DEMO.popAtS) / DEMO.airS;
    const inAir = airU > 0 && airU < 1;

    let pitch = 0;
    if (c > DEMO.popAtS - 0.1 && c <= DEMO.popAtS)
      pitch = DEMO.popPitchRad * clamp01((c - (DEMO.popAtS - 0.1)) / 0.1);
    if (inAir)
      pitch =
        DEMO.popPitchRad * (1 - smoothstep(clamp01(airU / 0.45))) - 0.05 * Math.sin(Math.PI * airU);

    const u = clamp01(airU);
    const flipU = smoothstep(clamp01((u - 0.05) / 0.8));
    const roll =
      inAir && trick === "kickflip" ? TAU * flipU : inAir && trick === "bail" ? Math.PI * flipU : 0;
    const shuv = inAir && trick === "shuvit" ? Math.PI * flipU : 0;
    const upsideDown = trick === "bail" && airU >= 1 && timeS < this.bailedUntilS;

    const height = inAir ? 4 * DEMO.popHeightM * u * (1 - u) : 0;
    const pivotLift = Math.sin(Math.abs(pitch)) * (this.spec.trucks.wheelbaseM / 2);
    const rest = BoardSpec.restHeightM(this.spec);
    const lift = upsideDown ? this.spec.deck.thicknessM : rest + height + pivotLift;

    const heading = Quat.fromAxisAngle(Vec3.UNIT_Y, theta);
    const local = Quat.multiply(
      Quat.fromAxisAngle(Vec3.UNIT_Y, shuv),
      Quat.multiply(
        Quat.fromAxisAngle(Vec3.UNIT_Z, pitch),
        Quat.fromAxisAngle(
          Vec3.UNIT_X,
          upsideDown ? Math.PI : roll + (inAir ? 0 : DEMO.carveLeanRad),
        ),
      ),
    );
    const transform = Transform.create(
      Vec3.add(ground, Vec3.create(0, lift, 0)),
      Quat.multiply(heading, local),
    );
    const vy = inAir ? (4 * DEMO.popHeightM * (1 - 2 * u)) / DEMO.airS : 0;
    const velocity = upsideDown
      ? Vec3.scale(velocity0, 0.2)
      : Vec3.add(velocity0, Vec3.create(0, vy, 0));

    // Sticks: hold the tail, snap it (pop), slide the front foot up (+ flick on flips).
    const holding = c >= DEMO.holdTailAtS && c < DEMO.popAtS;
    const backStick = StickValue.clamped(
      trick === "shuvit" && inAir && u < 0.3 ? 0.9 : 0,
      holding ? -1 : 0,
    );
    const sliding = c >= DEMO.popAtS && c < DEMO.popAtS + DEMO.airS * 0.5;
    const flicking =
      (trick === "kickflip" || trick === "bail") &&
      c >= DEMO.popAtS &&
      c < DEMO.popAtS + DEMO.flickS;
    const frontStick = StickValue.clamped(flicking ? 1 : 0, sliding ? 0.8 : 0);

    return {
      transform,
      velocity,
      grounded: !inAir,
      airtimeS: inAir ? airU * DEMO.airS : 0,
      rotation: { rollRad: roll, yawRad: shuv, pitchRad: pitch },
      frontStick,
      backStick,
      frontDetached:
        (inAir && trick !== "ollie" && u > DEMO.frontDetachFromU && u < DEMO.frontDetachToU) ||
        timeS < this.bailedUntilS,
    };
  }

  private snapshot(sample: ScriptSample, timeS: number): BoardSnapshot {
    const contactPoints: BoardContact[] = [];
    if (sample.grounded) {
      for (const wheel of WHEEL_IDS) {
        const c = BoardSpec.wheelCenterLocal(this.spec, wheel);
        const bottom = Vec3.create(c.x, c.y - this.spec.wheels.radiusM, c.z);
        contactPoints.push({
          part: wheel,
          surface: "ground",
          obstacleId: "ground",
          pointWorldM: Transform.toWorldPoint(sample.transform, bottom),
          normalWorld: Vec3.UNIT_Y,
          normalImpulseNs: 0,
        });
      }
    }
    return {
      tick: this.tick,
      timeS,
      transform: sample.transform,
      linearVelocityMps: sample.velocity,
      angularVelocityRadps: Vec3.ZERO,
      contacts: sample.grounded
        ? {
            ...NO_CONTACT,
            wheels: {
              noseLeftWheel: true,
              noseRightWheel: true,
              tailLeftWheel: true,
              tailRightWheel: true,
            },
          }
        : NO_CONTACT,
      wheelsDown: sample.grounded ? 4 : 0,
      grounded: sample.grounded,
      airtimeS: sample.airtimeS,
      contactPoints,
    };
  }

  private intentFrame(now: ScriptSample): IntentFrame {
    // Smooth the scripted sticks like the virtual stick would (first-order, visual only).
    const k = 1 - Math.exp(-this.stepS * 25);
    const smooth = (prev: StickValue, target: StickValue): StickValue =>
      StickValue.clamped(prev.x + (target.x - prev.x) * k, prev.y + (target.y - prev.y) * k);
    const front = smooth(this.prevFront, now.frontStick);
    const back = smooth(this.prevBack, now.backStick);
    const intent = (foot: FootId, stick: StickValue, prev: StickValue): FootIntent => ({
      foot,
      stick,
      stickVelocityPerS: Vec2.create(
        (stick.x - prev.x) / this.stepS,
        (stick.y - prev.y) / this.stepS,
      ),
    });
    const frame = {
      front: intent("front", front, this.prevFront),
      back: intent("back", back, this.prevBack),
      feetDown: false,
      stance: this.stance,
      spin: 0,
    };
    this.prevFront = front;
    this.prevBack = back;
    return frame;
  }

  private emitEvents(before: ScriptSample, now: ScriptSample, timeS: number): void {
    const meta = { tick: this.tick, timeS };
    const cycle = Math.floor(timeS / DEMO.cycleS);
    const trick = SCRIPT[cycle % SCRIPT.length] ?? "ollie";
    if (before.grounded && !now.grounded) {
      const tail = Transform.toWorldPoint(now.transform, BoardSpec.tailTipLocal(this.spec));
      this.events.push({
        type: "BoardPopped",
        ...meta,
        foot: "back",
        kick: "tail",
        impulseNs: 4,
        pointWorldM: tail,
      });
      this.events.push({ type: "BoardLeftGround", ...meta, velocityMps: now.velocity });
      this.impulses.push({
        timeS,
        vector: {
          kind: "impulse",
          foot: "back",
          label: "pop",
          originWorldM: tail,
          vectorWorld: Vec3.create(0, -4, 0),
        },
      });
      if (trick === "kickflip" || trick === "bail") {
        const edge = Transform.toWorldPoint(
          now.transform,
          Vec3.create(0.2, 0, this.spec.deck.widthM / 2),
        );
        const flick = Transform.toWorldDirection(now.transform, Vec3.create(0, -0.6, 2));
        this.impulses.push({
          timeS: timeS + 0.03,
          vector: {
            kind: "impulse",
            foot: "front",
            label: "flick",
            originWorldM: edge,
            vectorWorld: flick,
          },
        });
      }
    }
    if (!before.grounded && now.grounded) {
      const rotation = before.rotation;
      this.events.push({
        type: "BoardLanded",
        ...meta,
        airtimeS: DEMO.airS,
        velocityMps: Vec3.create(now.velocity.x, -2.6, now.velocity.z),
        upDot: trick === "bail" ? -1 : 1,
        wheelsDown: trick === "bail" ? 0 : 4,
      });
      if (trick === "bail") {
        this.events.push({
          type: "TrickBailed",
          ...meta,
          trickId: null,
          name: null,
          reason: "upsideDown",
          rotation,
          airtimeS: DEMO.airS,
        });
        this.events.push({ type: "RiderBailed", ...meta, reason: "upsideDown" });
        this.bailedUntilS = timeS + DEMO.bailResetS;
      } else {
        const name =
          trick === "kickflip" ? "Kickflip" : trick === "shuvit" ? "Pop Shuvit" : "Ollie";
        this.events.push({
          type: "TrickLanded",
          ...meta,
          trickId: trick,
          name,
          stance: this.stance,
          rotation,
          airtimeS: DEMO.airS,
        });
      }
    }
  }

  private foot(
    id: FootId,
    detached: boolean,
    stick: StickValue,
    t: Transform,
    timeS: number,
  ): FootState {
    const rest =
      id === "front" ? RIDER_CONFIG.feet.frontRestAlongM : RIDER_CONFIG.feet.backRestAlongM;
    const along = rest + stick.y * RIDER_CONFIG.feet.reachAlongM;
    const across = stick.x * RIDER_CONFIG.feet.reachAcrossM;
    const top = BoardSpec.deckTopPointLocal(this.spec, along, across);
    const onDeck = Transform.toWorldPoint(t, top);
    const hover = Vec3.add(onDeck, Vec3.create(0, 0.18, 0.12 * Math.sin(timeS * 6)));
    return {
      id,
      contact: detached ? "airborne" : "attached",
      riderPosition: DeckPosition.create(along, across),
      deckPosition: DeckPosition.create(along, across),
      pressure: detached ? 0 : id === "back" && stick.y < -0.5 ? 1 : 0.5,
      positionWorldM: detached ? hover : onDeck,
      positionRiderM: Vec3.create(along, top.y, across),
      positionBoardM: detached ? null : top,
      detachedForS: detached ? 0.1 : 0,
    };
  }

  buildFrame(): RenderFrame {
    const timeS = this.tick * this.stepS;
    const s = this.sample;
    const t = s.transform;
    const bailed = timeS < this.bailedUntilS;
    const rider: RiderState = {
      front: this.foot("front", s.frontDetached, this.intents.front.stick, t, timeS),
      back: this.foot("back", bailed, this.intents.back.stick, t, timeS),
      torsoPositionWorldM: Vec3.add(t.positionM, Vec3.create(0, RIDER_CONFIG.torso.heightM, 0)),
      headingRad: 0,
      windUpRad: 0,
      bodySpinRateRadps: 0,
      grind: null,
      lastGrindExit: null,
      popOutTurnRad: 0,
      kickflipFlick: null,
      bailed,
    };
    const vectors: DebugVector[] = [];
    for (const foot of [rider.front, rider.back]) {
      if (foot.contact !== "attached") continue;
      const down = Transform.toWorldDirection(
        t,
        Vec3.create(0, -2 * RIDER_CONFIG.stance.standingPressN * foot.pressure, 0),
      );
      vectors.push({
        kind: "force",
        foot: foot.id,
        label: "press",
        originWorldM: foot.positionWorldM,
        vectorWorld: down,
        ageS: 0,
      });
    }
    if (s.grounded) {
      // Board-internal lateral grip (centripetal), neutral colour.
      const inward = Vec3.scale(Vec3.normalize(Vec3.cross(Vec3.UNIT_Y, s.velocity)), 40);
      for (const contact of this.current.contactPoints) {
        vectors.push({
          kind: "force",
          foot: null,
          label: "grip",
          originWorldM: contact.pointWorldM,
          vectorWorld: inward,
          ageS: 0,
        });
      }
    }
    this.impulses = this.impulses.filter(
      (i) => timeS - i.timeS <= GAME_CONFIG.debug.impulseLifetimeS,
    );
    for (const i of this.impulses) {
      if (timeS >= i.timeS) vectors.push({ ...i.vector, ageS: timeS - i.timeS });
    }
    const air: AirSession | null = s.grounded
      ? null
      : {
          startedTick: this.tick,
          startedAtS: timeS - s.airtimeS,
          airtimeS: s.airtimeS,
          popped: true,
          kick: "tail",
          rotation: s.rotation,
          bodyRad: 0,
          detachedFeet: s.frontDetached ? ["front"] : [],
        };
    const events = this.events;
    this.events = [];
    return {
      alpha: this.accumulator.alpha,
      previousBoard: this.previous,
      currentBoard: this.current,
      leanRad: 0,
      previousRider: rider,
      rider,
      intents: this.intents,
      stance: this.stance,
      air,
      recentEvents: events,
      debug: { physicsStepMs: 0.12, stepsThisFrame: 2, vectors, rotation: air?.rotation ?? null },
    };
  }
}

/** Boots the renderer on the synthetic demo instead of the game loop. */
export function startDemo(canvas: HTMLCanvasElement, params: URLSearchParams): void {
  const stance: Stance = params.has("goofy") ? "goofy" : "regular";
  const game = new DemoGame(stance);
  // `&zoom=0.4` scales the camera offsets for close-up visual checks of the board.
  const config = structuredClone(PRESENTATION_CONFIG) as Tunable<PresentationConfig>;
  const zoom = Number(params.get("zoom") ?? "1");
  if (Number.isFinite(zoom) && zoom > 0) {
    config.camera.distanceBehindM *= zoom;
    config.camera.heightM *= zoom;
    config.camera.heelSideOffsetM *= zoom;
    config.camera.lookAheadM *= zoom;
  }
  const renderer = new ThreeRenderer({ canvas, config });
  renderer.setup({
    boardSpec: game.boardSpec,
    level: createFlatGroundLevel(WORLD_CONFIG.flatGround),
  });
  if (params.has("debug")) renderer.setDebugEnabled(true);
  let last = performance.now();
  const frame = (now: number): void => {
    game.advance((now - last) / 1000);
    last = now;
    renderer.render(game.buildFrame());
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
