import { Transform, Vec3 } from "../../../shared";
import type { RigidBodyHandle } from "./physics-world";

/** One call recorded by `FakeRigidBodyHandle`. */
export type RecordedApplication =
  | { readonly kind: "force"; readonly forceN: Vec3; readonly pointWorldM: Vec3 }
  | { readonly kind: "impulse"; readonly impulseNs: Vec3; readonly pointWorldM: Vec3 }
  | { readonly kind: "torque"; readonly torqueNm: Vec3 }
  | { readonly kind: "torqueImpulse"; readonly impulseNms: Vec3 };

/**
 * Test double for `RigidBodyHandle` (no physics). State is set directly by the test;
 * every force / impulse is recorded in `applied`. Lets rider and tricks logic be
 * unit-tested without Rapier (REQUIREMENTS §2.3).
 */
export class FakeRigidBodyHandle implements RigidBodyHandle {
  transform: Transform = Transform.IDENTITY;
  linearVelocityMps: Vec3 = Vec3.ZERO;
  angularVelocityRadps: Vec3 = Vec3.ZERO;
  massKg = 2.2;
  /** Isotropic inertia used by `angularInertiaTimes`, kg·m². */
  angularInertiaKgM2 = 0.05;
  readonly applied: RecordedApplication[] = [];

  getTransform(): Transform {
    return this.transform;
  }

  getLinearVelocity(): Vec3 {
    return this.linearVelocityMps;
  }

  getAngularVelocity(): Vec3 {
    return this.angularVelocityRadps;
  }

  getVelocityAtPoint(pointWorldM: Vec3): Vec3 {
    const r = Vec3.sub(pointWorldM, this.getCenterOfMassWorld());
    return Vec3.add(this.linearVelocityMps, Vec3.cross(this.angularVelocityRadps, r));
  }

  getCenterOfMassWorld(): Vec3 {
    return this.transform.positionM;
  }

  getMassKg(): number {
    return this.massKg;
  }

  angularInertiaTimes(vectorWorld: Vec3): Vec3 {
    return Vec3.scale(vectorWorld, this.angularInertiaKgM2);
  }

  applyForceAtPoint(forceN: Vec3, pointWorldM: Vec3): void {
    this.applied.push({ kind: "force", forceN, pointWorldM });
  }

  applyImpulseAtPoint(impulseNs: Vec3, pointWorldM: Vec3): void {
    this.applied.push({ kind: "impulse", impulseNs, pointWorldM });
  }

  applyTorque(torqueNm: Vec3): void {
    this.applied.push({ kind: "torque", torqueNm });
  }

  applyTorqueImpulse(impulseNms: Vec3): void {
    this.applied.push({ kind: "torqueImpulse", impulseNms });
  }

  resetTo(
    transform: Transform,
    linearVelocityMps: Vec3 = Vec3.ZERO,
    angularVelocityRadps: Vec3 = Vec3.ZERO,
  ): void {
    this.transform = transform;
    this.linearVelocityMps = linearVelocityMps;
    this.angularVelocityRadps = angularVelocityRadps;
    this.applied.length = 0;
  }
}
