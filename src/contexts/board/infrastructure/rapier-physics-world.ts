import RAPIER from "@dimforge/rapier3d-compat";
import type { BoardPartId, ObstacleId, SurfaceType, WheelId } from "../../../shared";
import { Quat, Transform, Vec3, WHEEL_IDS } from "../../../shared";
import type { BoardConfig } from "../board.config";
import { BoardSpec } from "../domain/board-spec";
import type {
  BoardBody,
  BoardContact,
  PhysicsWorld,
  Ray,
  RaycastHit,
  RaycastOptions,
  RigidBodyHandle,
  StaticColliderDesc,
} from "../domain/physics-world";

/*
 * THE ONLY FILE THAT TOUCHES RAPIER (REQUIREMENTS §2.3). Implements the physics port.
 * Board model (ADR 0003): one dynamic rigid body in the board frame carrying compound
 * colliders — a flat deck box, kicked nose/tail boxes, truck baseplates + hangers and
 * four ball wheels. Wheels have zero solver friction; the tyre model in the board
 * domain adds grip and rolling resistance as forces.
 */

type RapierWorld = InstanceType<typeof RAPIER.World>;
type RapierBody = InstanceType<typeof RAPIER.RigidBody>;
type RapierColliderDesc = InstanceType<typeof RAPIER.ColliderDesc>;
type RapierCollider = InstanceType<typeof RAPIER.Collider>;

let rapierReady: Promise<void> | null = null;

/** Initialises the Rapier WASM module once per process. */
function initRapier(): Promise<void> {
  rapierReady ??= RAPIER.init();
  return rapierReady;
}

function toRapierQuat(q: Quat): { x: number; y: number; z: number; w: number } {
  return { x: q.x, y: q.y, z: q.z, w: q.w };
}

function vec(v: { x: number; y: number; z: number }): Vec3 {
  return Vec3.create(v.x, v.y, v.z);
}

/** A point in a collider's local frame → world, using the collider's current pose. */
function colliderPointToWorld(
  collider: RapierCollider,
  local: { x: number; y: number; z: number },
): Vec3 {
  const r = collider.rotation();
  return Vec3.add(
    vec(collider.translation()),
    Quat.rotate(Quat.create(r.x, r.y, r.z, r.w), vec(local)),
  );
}

interface StaticInfo {
  readonly surface: SurfaceType;
  readonly obstacleId: ObstacleId;
}

/** Adapter from the port's `RigidBodyHandle` to a Rapier rigid body. */
class RapierRigidBodyHandle implements RigidBodyHandle {
  constructor(
    readonly raw: RapierBody,
    private readonly onReset: () => void,
  ) {}

  getTransform(): Transform {
    const t = this.raw.translation();
    const r = this.raw.rotation();
    return Transform.create(vec(t), Quat.create(r.x, r.y, r.z, r.w));
  }

  getLinearVelocity(): Vec3 {
    // Rapier's linvel is the centre-of-mass velocity; the port wants the frame origin's.
    return vec(this.raw.velocityAtPoint(this.raw.translation()));
  }

  getAngularVelocity(): Vec3 {
    return vec(this.raw.angvel());
  }

  getVelocityAtPoint(pointWorldM: Vec3): Vec3 {
    return vec(this.raw.velocityAtPoint(pointWorldM));
  }

  getCenterOfMassWorld(): Vec3 {
    return vec(this.raw.worldCom());
  }

  getMassKg(): number {
    return this.raw.mass();
  }

  applyForceAtPoint(forceN: Vec3, pointWorldM: Vec3): void {
    this.raw.addForceAtPoint(forceN, pointWorldM, true);
  }

  applyImpulseAtPoint(impulseNs: Vec3, pointWorldM: Vec3): void {
    this.raw.applyImpulseAtPoint(impulseNs, pointWorldM, true);
  }

  applyTorque(torqueNm: Vec3): void {
    this.raw.addTorque(torqueNm, true);
  }

  applyTorqueImpulse(impulseNms: Vec3): void {
    this.raw.applyTorqueImpulse(impulseNms, true);
  }

  resetTo(
    transform: Transform,
    linearVelocityMps: Vec3 = Vec3.ZERO,
    angularVelocityRadps: Vec3 = Vec3.ZERO,
  ): void {
    this.raw.setTranslation(transform.positionM, true);
    this.raw.setRotation(toRapierQuat(transform.rotation), true);
    // setLinvel sets the COM velocity; convert from the frame-origin velocity.
    const comOffset = Vec3.sub(vec(this.raw.worldCom()), transform.positionM);
    this.raw.setLinvel(
      Vec3.add(linearVelocityMps, Vec3.cross(angularVelocityRadps, comOffset)),
      true,
    );
    this.raw.setAngvel(angularVelocityRadps, true);
    this.raw.resetForces(true);
    this.raw.resetTorques(true);
    this.onReset();
  }
}

/** The board as built in Rapier: body handle + per-step contact extraction. */
class RapierBoardBody implements BoardBody {
  readonly body: RapierRigidBodyHandle;
  private cache: readonly BoardContact[] | null = null;

  constructor(
    private readonly world: RapierWorld,
    raw: RapierBody,
    private readonly parts: ReadonlyMap<number, BoardPartId>,
    private readonly statics: ReadonlyMap<number, StaticInfo>,
    private readonly toleranceM: number,
  ) {
    this.body = new RapierRigidBodyHandle(raw, () => this.invalidate());
  }

  invalidate(): void {
    this.cache = null;
  }

  contacts(): readonly BoardContact[] {
    this.cache ??= Object.freeze(this.collect());
    return this.cache;
  }

  private collect(): BoardContact[] {
    const out: BoardContact[] = [];
    const narrow = this.world.narrowPhase;
    for (const [handle, part] of this.parts) {
      const collider = this.world.getCollider(handle);
      narrow.contactPairsWith(handle, (other) => {
        const info = this.statics.get(other);
        if (info === undefined) return;
        const surfaceCollider = this.world.getCollider(other);
        narrow.contactPair(handle, other, this.world.bodies, (manifold, flipped) => {
          // The manifold normal points from its first collider to its second; we want
          // it from the surface toward the board.
          const n = manifold.normal();
          const sign = flipped ? 1 : -1;
          const normalWorld = Vec3.normalize(Vec3.create(n.x * sign, n.y * sign, n.z * sign));
          for (let i = 0; i < manifold.numContacts(); i += 1) {
            const onBoard = flipped
              ? manifold.localContactPoint2(i)
              : manifold.localContactPoint1(i);
            const onSurface = flipped
              ? manifold.localContactPoint1(i)
              : manifold.localContactPoint2(i);
            if (onBoard === null || onSurface === null) continue;
            // Rapier keeps a manifold across small motions without refreshing
            // `contactDist`, so measure the gap from the (collider-local) points instead.
            const boardPointM = colliderPointToWorld(collider, onBoard);
            const gapM = Vec3.dot(
              Vec3.sub(boardPointM, colliderPointToWorld(surfaceCollider, onSurface)),
              normalWorld,
            );
            if (gapM > this.toleranceM) continue;
            out.push(
              Object.freeze({
                part,
                surface: info.surface,
                obstacleId: info.obstacleId,
                pointWorldM: boardPointM,
                normalWorld,
                normalImpulseNs: manifold.contactImpulse(i),
              }),
            );
          }
        });
      });
    }
    return out;
  }
}

/** Rapier implementation of the `PhysicsWorld` port. Create with `RapierPhysicsWorld.create`. */
export class RapierPhysicsWorld implements PhysicsWorld {
  private readonly statics = new Map<number, StaticInfo>();
  private readonly staticIds = new Set<ObstacleId>();
  private readonly boards: RapierBoardBody[] = [];
  private disposed = false;

  private constructor(
    private readonly world: RapierWorld,
    private readonly config: BoardConfig,
  ) {}

  /** Loads the Rapier WASM module (once) and creates an empty world. */
  static async create(config: BoardConfig): Promise<RapierPhysicsWorld> {
    await initRapier();
    const world = new RAPIER.World({ x: 0, y: config.physics.gravityMps2, z: 0 });
    world.integrationParameters.numSolverIterations = config.physics.solverIterations;
    return new RapierPhysicsWorld(world, config);
  }

  addStaticCollider(desc: StaticColliderDesc): void {
    this.assertAlive();
    if (this.staticIds.has(desc.id)) {
      throw new Error(`RapierPhysicsWorld: duplicate static collider id "${desc.id}"`);
    }
    const colliderDesc = RapierPhysicsWorld.shapeDesc(desc)
      .setTranslation(
        desc.transform.positionM.x,
        desc.transform.positionM.y,
        desc.transform.positionM.z,
      )
      .setRotation(toRapierQuat(desc.transform.rotation))
      // Multiply wins over the board's Average/Min rules: μ = part coeff × surface factor.
      .setFriction(this.config.physics.surfaceFriction[desc.surface])
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Multiply)
      .setRestitution(1)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Multiply);
    const collider = this.world.createCollider(colliderDesc);
    this.statics.set(collider.handle, { surface: desc.surface, obstacleId: desc.id });
    this.staticIds.add(desc.id);
  }

  createBoard(spec: BoardSpec, transform: Transform): BoardBody {
    this.assertAlive();
    const { physics } = this.config;
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(transform.positionM.x, transform.positionM.y, transform.positionM.z)
      .setRotation(toRapierQuat(transform.rotation))
      .setLinearDamping(physics.linearDamping)
      .setAngularDamping(physics.angularDamping)
      .setCanSleep(false)
      .setCcdEnabled(true);
    const raw = this.world.createRigidBody(bodyDesc);
    const parts = new Map<number, BoardPartId>();
    for (const { part, desc } of this.boardColliders(spec)) {
      parts.set(this.world.createCollider(desc, raw).handle, part);
    }
    const board = new RapierBoardBody(
      this.world,
      raw,
      parts,
      this.statics,
      this.config.contact.wheelContactToleranceM,
    );
    this.boards.push(board);
    return board;
  }

  step(dtS: number): void {
    this.assertAlive();
    this.world.timestep = dtS;
    this.world.step();
    for (const board of this.boards) {
      // Port contract: forces act during one step only.
      board.body.raw.resetForces(false);
      board.body.raw.resetTorques(false);
      board.invalidate();
    }
  }

  raycast(ray: Ray, options: RaycastOptions): RaycastHit | null {
    this.assertAlive();
    const exclude =
      options.excludeBody instanceof RapierRigidBodyHandle ? options.excludeBody.raw : undefined;
    const hit = this.world.castRayAndGetNormal(
      new RAPIER.Ray(ray.originWorldM, ray.directionWorld),
      options.maxDistanceM,
      true,
      undefined,
      undefined,
      undefined,
      exclude,
    );
    if (hit === null) return null;
    const info = this.statics.get(hit.collider.handle);
    const distanceM = hit.timeOfImpact;
    return {
      pointWorldM: Vec3.add(ray.originWorldM, Vec3.scale(ray.directionWorld, distanceM)),
      normalWorld: vec(hit.normal),
      distanceM,
      // Dynamic bodies have no surface type; they are reported as plain ground.
      surface: info?.surface ?? "ground",
      obstacleId: info?.obstacleId ?? null,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.world.free();
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error("RapierPhysicsWorld used after dispose()");
  }

  private static shapeDesc(desc: StaticColliderDesc): RapierColliderDesc {
    const { shape } = desc;
    if (shape.kind === "box") {
      return RAPIER.ColliderDesc.cuboid(
        shape.halfExtentsM.x,
        shape.halfExtentsM.y,
        shape.halfExtentsM.z,
      );
    }
    const points = new Float32Array(shape.pointsM.flatMap((p) => [p.x, p.y, p.z]));
    const hull = RAPIER.ColliderDesc.convexHull(points);
    if (hull === null) {
      throw new Error(`RapierPhysicsWorld: degenerate convex hull for "${desc.id}"`);
    }
    return hull;
  }

  /** Builds the board's colliders in the board frame (see `BoardSpec`). */
  private boardColliders(spec: BoardSpec): { part: BoardPartId; desc: RapierColliderDesc }[] {
    const { physics, colliders } = this.config;
    const { deck, trucks, wheels } = spec;
    const out: { part: BoardPartId; desc: RapierColliderDesc }[] = [];
    const round = colliders.deckRoundingM;
    const halfT = deck.thicknessM / 2;
    const halfW = deck.widthM / 2;
    const halfFlat = BoardSpec.flatLengthM(spec) / 2;
    const deckLengthAlongM = 2 * halfFlat + 2 * deck.kickLengthM;

    const deckPart = (part: BoardPartId, desc: RapierColliderDesc): void => {
      const friction =
        part === "tail" || part === "nose" ? physics.kickFrictionCoeff : physics.deckFrictionCoeff;
      out.push({ part, desc: desc.setFriction(friction).setRestitution(physics.deckRestitution) });
    };

    // Flat section.
    deckPart(
      "deck",
      RAPIER.ColliderDesc.roundCuboid(
        halfFlat - round,
        halfT - round,
        halfW - round,
        round,
      ).setMass((deck.massKg * 2 * halfFlat) / deckLengthAlongM),
    );
    // Kicked ends: boxes starting at the flat section's end, tilted up by the kick angle.
    const kickMassKg = (deck.massKg * deck.kickLengthM) / deckLengthAlongM;
    for (const end of ["nose", "tail"] as const) {
      const s = end === "nose" ? 1 : -1;
      const a = deck.kickAngleRad;
      const cx = s * (halfFlat + (deck.kickLengthM / 2) * Math.cos(a));
      const cy = (deck.kickLengthM / 2) * Math.sin(a);
      // Plain (not rounded) boxes: a rounded box striking flat ground edge-on gets a
      // one-point manifold at a corner, and that off-centre pop impulse rolls the board.
      // A plain box gets the whole edge (symmetric strike).
      deckPart(
        end,
        RAPIER.ColliderDesc.cuboid(deck.kickLengthM / 2, halfT, halfW)
          .setTranslation(cx, cy, 0)
          .setRotation(toRapierQuat(Quat.fromAxisAngle(Vec3.UNIT_Z, s * a)))
          .setMass(kickMassKg),
      );
    }

    // Trucks: a baseplate block from the deck down to the axle, and a hanger along the axle.
    const axleY = -(halfT + trucks.heightM);
    const baseTopY = -halfT;
    const baseBottomY = axleY + colliders.hangerHalfHeightM;
    const hangerHalfZ = trucks.axleTrackM / 2 - wheels.widthM / 2;
    for (const truck of ["noseTruck", "tailTruck"] as const) {
      const x = (truck === "noseTruck" ? 1 : -1) * (trucks.wheelbaseM / 2);
      deckPart(
        truck,
        RAPIER.ColliderDesc.cuboid(
          colliders.truckBaseLengthM / 2,
          (baseTopY - baseBottomY) / 2,
          colliders.truckBaseWidthM / 2,
        )
          .setTranslation(x, (baseTopY + baseBottomY) / 2, 0)
          .setMass(trucks.massKg / 2),
      );
      deckPart(
        truck,
        RAPIER.ColliderDesc.cuboid(
          colliders.hangerHalfLengthM,
          colliders.hangerHalfHeightM,
          hangerHalfZ,
        )
          .setTranslation(x, axleY, 0)
          .setMass(trucks.massKg / 2),
      );
    }

    // Wheels: balls at the wheel centres, frictionless and non-bouncy (ADR 0003).
    for (const wheel of WHEEL_IDS) {
      out.push({ part: wheel, desc: this.wheelDesc(spec, wheel) });
    }
    return out;
  }

  private wheelDesc(spec: BoardSpec, wheel: WheelId): RapierColliderDesc {
    const { physics } = this.config;
    const c = BoardSpec.wheelCenterLocal(spec, wheel);
    return RAPIER.ColliderDesc.ball(spec.wheels.radiusM)
      .setTranslation(c.x, c.y, c.z)
      .setMass(spec.wheels.massKg)
      .setFriction(physics.wheelFrictionCoeff)
      .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min)
      .setRestitution(physics.wheelRestitution)
      .setRestitutionCombineRule(RAPIER.CoefficientCombineRule.Min);
  }
}
