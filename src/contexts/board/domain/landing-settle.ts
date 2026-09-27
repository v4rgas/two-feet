import type { WheelId } from "../../../shared";
import { Transform, Vec3, WHEEL_IDS } from "../../../shared";
import type { BoardConfig } from "../board.config";
import { BoardSpec } from "./board-spec";
import type { BoardContact, RigidBodyHandle } from "./physics-world";
import { isWheel } from "./tyre-model";

/**
 * LANDING SETTLE (ADR 0003, "Hard landings"). Right after a hard touchdown, the wheels
 * that are not yet down but hang just above the contact plane (within `gapM`) must not
 * move away from it. The rigid solver resolves a many-contact impact at 5–9 m/s in an
 * order that follows the world's contact-pair order (so, the number of static colliders),
 * and the axle it serves first can kick the other one up: a 5 cm nose skip at 3.4 rad/s.
 * A rigid rod slapping its second axle down rebounds the first one the same way. On a
 * real board the urethane and the bushings soak that rebound up.
 *
 * The settle is one impulse along −n at the lifted wheels' mean bottom point that turns
 * their separation speed into a small closing speed (a fraction of the gap per step),
 * using the body's effective mass there. It acts only along the contact normal (no
 * thrust), only on wheels moving away from the plane, and never on a separation faster
 * than `maxReboundMps` (that is a pop or a manual, not a rebound).
 */

type LandingParams = BoardConfig["landing"];

/** An impulse to apply at a world point, N·s (value object). */
export interface SettleImpulse {
  readonly impulseNs: Vec3;
  readonly pointWorldM: Vec3;
}

/** `I⁻¹·v` from `I·v` on the basis vectors (the world inertia tensor is symmetric). */
function inverseInertiaTimes(body: RigidBodyHandle, v: Vec3): Vec3 {
  const c0 = body.angularInertiaTimes(Vec3.UNIT_X);
  const c1 = body.angularInertiaTimes(Vec3.UNIT_Y);
  const c2 = body.angularInertiaTimes(Vec3.UNIT_Z);
  // Rows of the inverse = cross products of the columns over the determinant.
  const r0 = Vec3.cross(c1, c2);
  const r1 = Vec3.cross(c2, c0);
  const r2 = Vec3.cross(c0, c1);
  const det = Vec3.dot(c0, r0);
  if (!(Math.abs(det) > 1e-18)) return Vec3.ZERO;
  return Vec3.scale(Vec3.create(Vec3.dot(r0, v), Vec3.dot(r1, v), Vec3.dot(r2, v)), 1 / det);
}

/**
 * The settle impulse for this step, or null when no lifted wheel is separating. `contacts`
 * are the last step's; `dtS` is the coming step.
 */
export function landingSettleImpulse(
  spec: BoardSpec,
  body: RigidBodyHandle,
  contacts: readonly BoardContact[],
  dtS: number,
  params: LandingParams,
): SettleImpulse | null {
  if (!(dtS > 0)) return null;
  const down = new Set<WheelId>();
  let normalSum = Vec3.ZERO;
  let pointSum = Vec3.ZERO;
  let count = 0;
  for (const c of contacts) {
    if (!isWheel(c.part)) continue;
    down.add(c.part);
    normalSum = Vec3.add(normalSum, c.normalWorld);
    pointSum = Vec3.add(pointSum, c.pointWorldM);
    count += 1;
  }
  if (count === 0 || down.size === WHEEL_IDS.length) return null;
  const n = Vec3.normalize(normalSum);
  const planePoint = Vec3.scale(pointSum, 1 / count);

  const transform = body.getTransform();
  let liftedPoint = Vec3.ZERO;
  let gapSumM = 0;
  let lifted = 0;
  for (const wheel of WHEEL_IDS) {
    if (down.has(wheel)) continue;
    const center = Transform.toWorldPoint(transform, BoardSpec.wheelCenterLocal(spec, wheel));
    const bottom = Vec3.sub(center, Vec3.scale(n, spec.wheels.radiusM));
    const gapM = Vec3.dot(Vec3.sub(bottom, planePoint), n);
    if (gapM > params.gapM) continue;
    liftedPoint = Vec3.add(liftedPoint, bottom);
    gapSumM += gapM;
    lifted += 1;
  }
  if (lifted === 0) return null;
  const p = Vec3.scale(liftedPoint, 1 / lifted);
  const gapM = Math.max(0, gapSumM / lifted);

  const separatingMps = Vec3.dot(body.getVelocityAtPoint(p), n);
  if (separatingMps <= 0 || separatingMps > params.maxReboundMps) return null;
  const targetMps = -Math.min((params.closeFractionPerStep * gapM) / dtS, params.maxCloseMps);

  const r = Vec3.sub(p, body.getCenterOfMassWorld());
  const rn = Vec3.cross(r, n);
  const invMass = 1 / body.getMassKg() + Vec3.dot(rn, inverseInertiaTimes(body, rn));
  if (!(invMass > 0)) return null;
  const impulse = (targetMps - separatingMps) / invMass; // < 0: along −n
  return { impulseNs: Vec3.scale(n, impulse), pointWorldM: p };
}
