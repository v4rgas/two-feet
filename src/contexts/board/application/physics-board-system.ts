import type { BoardPartId, EventBus, ObstacleId, SurfaceType, Transform } from "../../../shared";
import { Quat, Vec3 } from "../../../shared";
import type { BoardConfig } from "../board.config";
import type { BoardSnapshot } from "../domain/board-snapshot";
import { contactStateFrom, countWheelsDown, NO_CONTACT } from "../domain/board-snapshot";
import type { BoardSpec } from "../domain/board-spec";
import type { BoardBody, BoardContact, RigidBodyHandle } from "../domain/physics-world";
import type { BoardForce } from "../domain/tyre-model";
import {
  followLeanRad,
  isWheel,
  rollingLoadScale,
  targetLeanRad,
  truckSteerRad,
  tyreForces,
  wheelLoadN,
  wheelLoadRollMomentNm,
} from "../domain/tyre-model";
import type { BoardSystem } from "./board-system";

interface SurfaceKeyInfo {
  readonly part: BoardPartId;
  readonly surface: SurfaceType;
  readonly obstacleId: ObstacleId;
}

/** One (part, obstacle) pair counts as one surface contact, however many points it has. */
function surfaceKey(contact: {
  readonly part: BoardPartId;
  readonly obstacleId: ObstacleId;
}): string {
  return `${contact.part}|${contact.obstacleId}`;
}

/**
 * The real `BoardSystem`: applies the tyre/truck model through the physics port before
 * each step and turns the contacts after it into a `BoardSnapshot` and domain events.
 *
 * The first `postPhysics` after construction or `reset` only establishes the contact
 * baseline: it publishes no ground/surface events (a board spawned on the ground has
 * not "landed").
 */
export class PhysicsBoardSystem implements BoardSystem {
  readonly body: RigidBodyHandle;
  snapshot: BoardSnapshot;
  lastForces: readonly BoardForce[] = [];
  /** Current bushing lean, rad (see `tyre-model.ts` for the sign). */
  leanRad = 0;
  /** Current truck steer angle, rad. */
  steerRad = 0;

  private primed = false;
  private grounded = false;
  private leftGroundAtS = 0;
  private lastDtS = 0;
  private surfaces = new Map<string, SurfaceKeyInfo>();

  constructor(
    private readonly board: BoardBody,
    private readonly spec: BoardSpec,
    private readonly config: BoardConfig,
    private readonly bus: EventBus,
  ) {
    this.body = board.body;
    this.snapshot = this.restingSnapshot(0, 0);
  }

  prePhysics(dtS: number): void {
    const params = this.config.physics;
    // Contacts (and their impulses) describe the previous step, of length `lastDtS`.
    const contacts = this.lastDtS > 0 ? this.board.contacts() : [];
    const impulseDtS = this.lastDtS;
    this.lastDtS = dtS;

    const momentNm = wheelLoadRollMomentNm(this.spec, contacts, impulseDtS, params);
    this.leanRad = followLeanRad(
      this.leanRad,
      targetLeanRad(this.spec, momentNm, params),
      dtS,
      params,
    );
    this.steerRad = truckSteerRad(this.spec, this.leanRad);

    let totalLoadN = 0;
    for (const contact of contacts) {
      if (isWheel(contact.part)) totalLoadN += wheelLoadN(contact, impulseDtS, params);
    }
    const boardWeightN = this.body.getMassKg() * Math.abs(params.gravityMps2);
    const loadScale = rollingLoadScale(boardWeightN, totalLoadN);

    const transform = this.body.getTransform();
    const forces: BoardForce[] = [];
    for (const contact of contacts) {
      if (!isWheel(contact.part)) continue;
      forces.push(
        ...tyreForces(
          {
            wheel: contact.part,
            contact,
            boardTransform: transform,
            velocityAtContactMps: this.body.getVelocityAtPoint(contact.pointWorldM),
            steerRad: this.steerRad,
            rollingLoadScale: loadScale,
            dtS: impulseDtS,
          },
          params,
        ),
      );
    }
    for (const force of forces) this.body.applyForceAtPoint(force.forceN, force.pointWorldM);
    this.lastForces = forces;
  }

  postPhysics(tick: number, timeS: number): BoardSnapshot {
    const contacts = this.board.contacts();
    const state = contactStateFrom(contacts);
    const wheelsDown = countWheelsDown(state);
    const grounded = wheelsDown >= this.config.contact.groundedMinWheels;
    const transform = this.body.getTransform();
    const linearVelocityMps = this.body.getLinearVelocity();

    if (this.primed) {
      if (this.grounded && !grounded) {
        this.leftGroundAtS = timeS;
        this.bus.publish({ type: "BoardLeftGround", tick, timeS, velocityMps: linearVelocityMps });
      } else if (!this.grounded && grounded) {
        this.bus.publish({
          type: "BoardLanded",
          tick,
          timeS,
          airtimeS: timeS - this.leftGroundAtS,
          velocityMps: linearVelocityMps,
          upDot: Quat.rotate(transform.rotation, Vec3.UNIT_Y).y,
          wheelsDown,
        });
      }
      this.publishSurfaceChanges(contacts, tick, timeS);
    } else {
      this.primed = true;
      this.leftGroundAtS = timeS;
      this.surfaces = PhysicsBoardSystem.surfaceKeys(contacts);
    }
    this.grounded = grounded;

    this.snapshot = Object.freeze({
      tick,
      timeS,
      transform,
      linearVelocityMps,
      angularVelocityRadps: this.body.getAngularVelocity(),
      contacts: state,
      wheelsDown,
      grounded,
      airtimeS: grounded ? 0 : timeS - this.leftGroundAtS,
      contactPoints: contacts,
    });
    return this.snapshot;
  }

  reset(transform: Transform): void {
    this.body.resetTo(transform);
    this.primed = false;
    this.grounded = false;
    this.leftGroundAtS = 0;
    this.lastDtS = 0;
    this.leanRad = 0;
    this.steerRad = 0;
    this.lastForces = [];
    this.surfaces = new Map();
    this.snapshot = this.restingSnapshot(0, 0);
  }

  private publishSurfaceChanges(
    contacts: readonly BoardContact[],
    tick: number,
    timeS: number,
  ): void {
    const next = PhysicsBoardSystem.surfaceKeys(contacts);
    for (const [key, info] of this.surfaces) {
      if (!next.has(key)) this.bus.publish({ type: "SurfaceContactEnded", tick, timeS, ...info });
    }
    const started = new Set<string>();
    for (const contact of contacts) {
      const key = surfaceKey(contact);
      if (this.surfaces.has(key) || started.has(key)) continue;
      started.add(key);
      this.bus.publish({
        type: "SurfaceContactStarted",
        tick,
        timeS,
        part: contact.part,
        surface: contact.surface,
        obstacleId: contact.obstacleId,
        pointWorldM: contact.pointWorldM,
      });
    }
    this.surfaces = next;
  }

  private static surfaceKeys(contacts: readonly BoardContact[]): Map<string, SurfaceKeyInfo> {
    const keys = new Map<string, SurfaceKeyInfo>();
    for (const { part, surface, obstacleId } of contacts) {
      keys.set(surfaceKey({ part, obstacleId }), { part, surface, obstacleId });
    }
    return keys;
  }

  private restingSnapshot(tick: number, timeS: number): BoardSnapshot {
    return Object.freeze({
      tick,
      timeS,
      transform: this.body.getTransform(),
      linearVelocityMps: this.body.getLinearVelocity(),
      angularVelocityRadps: this.body.getAngularVelocity(),
      contacts: NO_CONTACT,
      wheelsDown: 0,
      grounded: false,
      airtimeS: 0,
      contactPoints: [],
    });
  }
}
