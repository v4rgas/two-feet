import type { ObstacleId, SurfaceType, Transform, Vec3 } from "../../../shared";

/*
 * Obstacle shapes are DATA: parameters only. `obstacle-geometry.ts` turns them into
 * convex pieces (pure functions), which physics and rendering both consume, so the
 * collider and the mesh are always the same geometry.
 *
 * Local frame of every ramp-like shape (quarterPipe, bank, kicker): the toe of the ramp
 * (where it meets the ground) is on the local Z axis at x = 0, y = 0; the ramp rises
 * toward local +X; the width runs along Z, centred on z = 0. You ride INTO it along +X.
 * Ledges and rails run along local X, centred on the origin, standing on y = 0.
 */

/** A plain box, centred on the local origin (the M1 ground). */
export interface BoxShape {
  readonly kind: "box";
  readonly halfExtentsM: Vec3;
}

/** A quarter pipe: a circular transition from the ground up to a flat deck, with coping. */
export interface QuarterPipeShape {
  readonly kind: "quarterPipe";
  /** Radius of the transition, m. */
  readonly radiusM: number;
  /** Height of the deck (top of the transition), m. At most `radiusM` (vert). */
  readonly heightM: number;
  /** Width along local Z, m. */
  readonly widthM: number;
  /** Depth of the flat deck behind the lip, along +X, m. */
  readonly deckDepthM: number;
  /** Radius of the round coping pipe at the lip, m. */
  readonly copingRadiusM: number;
}

/** A bank: a flat slope at a constant angle, with a vertical back. */
export interface BankShape {
  readonly kind: "bank";
  /** Slope angle from the ground, rad. */
  readonly angleRad: number;
  /** Length of the slope surface (along the incline), m. */
  readonly lengthM: number;
  /** Width along local Z, m. */
  readonly widthM: number;
}

/** A kicker: a small curved launch ramp (circular arc tangent to the ground), vertical back. */
export interface KickerShape {
  readonly kind: "kicker";
  /** Horizontal length from the toe to the lip, m. */
  readonly lengthM: number;
  /** Lip height, m. */
  readonly heightM: number;
  /** Width along local Z, m. */
  readonly widthM: number;
}

/** A ledge: a concrete box along local X with chamfered top edges (the grind edges). */
export interface LedgeShape {
  readonly kind: "ledge";
  /** Length along local X, m. */
  readonly lengthM: number;
  /** Depth along local Z, m. */
  readonly depthM: number;
  readonly heightM: number;
  /** Size of the 45° chamfer on each long top edge, m. */
  readonly edgeChamferM: number;
}

/** A rail: a bar along local X held up by posts near both ends. */
export interface RailShape {
  readonly kind: "rail";
  /** Length of the bar along local X, m. */
  readonly lengthM: number;
  /** Height of the top of the bar above the ground, m. */
  readonly heightM: number;
  /** `round` = a pipe; `square` = a square tube with a flat top. */
  readonly profile: "round" | "square";
  /** Radius of a round bar, or half the side of a square bar, m. */
  readonly barRadiusM: number;
}

/** A hubba: a ledge running down beside a stair set (on its +Z side). */
export interface HubbaParams {
  /** Width of the hubba across the stairs (along +Z, outward from the stairs' side), m. */
  readonly widthM: number;
  /** Height of the hubba top above the line of the stair nosings, m. */
  readonly heightM: number;
  /** Radius of the round steel edge on the hubba's inner top edge (`grindable`), m. */
  readonly edgeRadiusM: number;
  /**
   * Length of its flat top on the platform, back from the top nosing, m (default: one
   * tread). A long flat top gives a board coming down onto it from the run-up room.
   */
  readonly flatTopM?: number;
}

/** A handrail: a bar running down beside a stair set (on its −Z side), on two posts. */
export interface HandrailParams {
  /** Height of the top of the bar above the line of the stair nosings (measured square to it), m. */
  readonly heightM: number;
  readonly barRadiusM: number;
  /** Gap between the stairs' side and the rail's axis, m. */
  readonly offsetM: number;
}

/**
 * A stair set going DOWN toward local +X. The top landing platform spans
 * x ∈ [−topDepthM, 0] (its front edge, the top nosing, is on the local Z axis); the steps
 * follow, and the last riser drops to the ground at x = (stepCount − 1) · runM.
 * The platform height is stepCount · riseM.
 */
export interface StairsShape {
  readonly kind: "stairs";
  /** Number of drops (risers), including the one off the platform and the last to the ground. */
  readonly stepCount: number;
  readonly riseM: number;
  /** Depth of each tread, m. */
  readonly runM: number;
  /** Width along local Z, centred on z = 0, m. */
  readonly widthM: number;
  /** Depth of the flat top landing platform, m (the run-up). */
  readonly topDepthM: number;
  /**
   * Angle of a roll-up slope from the ground to the back edge of the platform, rad.
   * It is part of the platform's convex piece, so there is no seam at the top (ADR 0008).
   * Omit for a vertical back.
   */
  readonly backSlopeRad?: number;
  readonly hubba?: HubbaParams;
  readonly handrail?: HandrailParams;
}

/** Obstacle geometry parameters, in the obstacle's local frame. */
export type ObstacleShape =
  | BoxShape
  | QuarterPipeShape
  | BankShape
  | KickerShape
  | LedgeShape
  | RailShape
  | StairsShape;

/** Every shape kind. */
export type ObstacleShapeKind = ObstacleShape["kind"];

/**
 * A piece of the level (entity, identity = `id`). `surface` is the obstacle's main
 * surface; individual pieces may differ (the coping of a quarter pipe is `grindable`),
 * see `obstacleGeometry`.
 */
export interface Obstacle {
  readonly id: ObstacleId;
  readonly name: string;
  readonly surface: SurfaceType;
  /** Pose of the obstacle's local frame, world. */
  readonly transform: Transform;
  readonly shape: ObstacleShape;
}

function requirePositive(kind: string, name: string, value: number): void {
  if (!(Number.isFinite(value) && value > 0)) {
    throw new RangeError(`${kind}: ${name} must be a positive finite number (got ${value})`);
  }
}

/**
 * Checks a shape's parameters. Throws a `RangeError` naming the bad parameter. The
 * factories below call it; `Level.create` calls it again for shapes built as literals.
 */
function validate(shape: ObstacleShape): void {
  const { kind } = shape;
  switch (kind) {
    case "box":
      requirePositive(kind, "halfExtentsM.x", shape.halfExtentsM.x);
      requirePositive(kind, "halfExtentsM.y", shape.halfExtentsM.y);
      requirePositive(kind, "halfExtentsM.z", shape.halfExtentsM.z);
      return;
    case "quarterPipe":
      requirePositive(kind, "radiusM", shape.radiusM);
      requirePositive(kind, "heightM", shape.heightM);
      requirePositive(kind, "widthM", shape.widthM);
      requirePositive(kind, "deckDepthM", shape.deckDepthM);
      requirePositive(kind, "copingRadiusM", shape.copingRadiusM);
      if (shape.heightM > shape.radiusM) {
        throw new RangeError(`${kind}: heightM must not exceed radiusM (no oververt)`);
      }
      if (2 * shape.copingRadiusM >= shape.deckDepthM) {
        throw new RangeError(
          `${kind}: the coping must fit on the deck (2·copingRadiusM < deckDepthM)`,
        );
      }
      if (shape.copingRadiusM >= shape.heightM) {
        throw new RangeError(`${kind}: copingRadiusM must be smaller than heightM`);
      }
      return;
    case "bank":
      requirePositive(kind, "angleRad", shape.angleRad);
      requirePositive(kind, "lengthM", shape.lengthM);
      requirePositive(kind, "widthM", shape.widthM);
      if (shape.angleRad >= Math.PI / 2) {
        throw new RangeError(`${kind}: angleRad must be below 90°`);
      }
      return;
    case "kicker":
      requirePositive(kind, "lengthM", shape.lengthM);
      requirePositive(kind, "heightM", shape.heightM);
      requirePositive(kind, "widthM", shape.widthM);
      if (shape.heightM >= shape.lengthM) {
        // The arc tangent to the ground through (L, H) reaches vertical when H ≥ L.
        throw new RangeError(`${kind}: heightM must be smaller than lengthM (lip below 90°)`);
      }
      return;
    case "ledge":
      requirePositive(kind, "lengthM", shape.lengthM);
      requirePositive(kind, "depthM", shape.depthM);
      requirePositive(kind, "heightM", shape.heightM);
      requirePositive(kind, "edgeChamferM", shape.edgeChamferM);
      if (2 * shape.edgeChamferM >= shape.depthM || shape.edgeChamferM >= shape.heightM) {
        throw new RangeError(`${kind}: edgeChamferM is too large for the ledge`);
      }
      return;
    case "rail":
      requirePositive(kind, "lengthM", shape.lengthM);
      requirePositive(kind, "heightM", shape.heightM);
      requirePositive(kind, "barRadiusM", shape.barRadiusM);
      if (2 * shape.barRadiusM >= shape.heightM) {
        throw new RangeError(`${kind}: the bar must sit above the ground (2·barRadiusM < heightM)`);
      }
      if (shape.profile !== "round" && shape.profile !== "square") {
        throw new RangeError(`${kind}: unknown profile "${String(shape.profile)}"`);
      }
      return;
    case "stairs":
      if (!(Number.isInteger(shape.stepCount) && shape.stepCount >= 1)) {
        throw new RangeError(`${kind}: stepCount must be a positive integer`);
      }
      requirePositive(kind, "riseM", shape.riseM);
      requirePositive(kind, "runM", shape.runM);
      requirePositive(kind, "widthM", shape.widthM);
      requirePositive(kind, "topDepthM", shape.topDepthM);
      if (shape.backSlopeRad !== undefined) {
        requirePositive(kind, "backSlopeRad", shape.backSlopeRad);
        if (shape.backSlopeRad >= Math.PI / 2) {
          throw new RangeError(`${kind}: backSlopeRad must be below 90°`);
        }
      }
      if (shape.hubba !== undefined) {
        requirePositive(kind, "hubba.widthM", shape.hubba.widthM);
        requirePositive(kind, "hubba.heightM", shape.hubba.heightM);
        requirePositive(kind, "hubba.edgeRadiusM", shape.hubba.edgeRadiusM);
        if (shape.hubba.flatTopM !== undefined) {
          requirePositive(kind, "hubba.flatTopM", shape.hubba.flatTopM);
        }
        if (2 * shape.hubba.edgeRadiusM >= shape.hubba.heightM) {
          throw new RangeError(`${kind}: hubba.edgeRadiusM is too large for the hubba`);
        }
      }
      if (shape.handrail !== undefined) {
        requirePositive(kind, "handrail.heightM", shape.handrail.heightM);
        requirePositive(kind, "handrail.barRadiusM", shape.handrail.barRadiusM);
        requirePositive(kind, "handrail.offsetM", shape.handrail.offsetM);
        if (2 * shape.handrail.barRadiusM >= shape.handrail.heightM) {
          throw new RangeError(`${kind}: handrail.barRadiusM is too large for the handrail`);
        }
      }
      return;
  }
}

function make<S extends ObstacleShape>(shape: S): S {
  validate(shape);
  const copy: S = { ...shape };
  return Object.freeze(copy);
}

/** Validating factories for obstacle shapes (value objects). */
export const ObstacleShape = Object.freeze({
  validate,
  box: (p: Omit<BoxShape, "kind">): BoxShape => make({ kind: "box", ...p }),
  quarterPipe: (p: Omit<QuarterPipeShape, "kind">): QuarterPipeShape =>
    make({ kind: "quarterPipe", ...p }),
  bank: (p: Omit<BankShape, "kind">): BankShape => make({ kind: "bank", ...p }),
  kicker: (p: Omit<KickerShape, "kind">): KickerShape => make({ kind: "kicker", ...p }),
  ledge: (p: Omit<LedgeShape, "kind">): LedgeShape => make({ kind: "ledge", ...p }),
  rail: (p: Omit<RailShape, "kind">): RailShape => make({ kind: "rail", ...p }),
  stairs: (p: Omit<StairsShape, "kind">): StairsShape => make({ kind: "stairs", ...p }),
});
