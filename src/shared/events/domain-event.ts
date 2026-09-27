import type { Vec3 } from "../math/vec3";
import type {
  BoardPartId,
  FootId,
  GrindExit,
  GrindKind,
  GrindSide,
  Kick,
  ObstacleId,
  Stance,
  SurfaceType,
} from "../vocabulary";

/**
 * Domain events: the only way bounded contexts react to each other (REQUIREMENTS §2.2).
 * Every event is plain, immutable data — no class instances, no functions, no handles —
 * so it can be logged, recorded for replays and shown in the debug overlay.
 *
 * Every event carries the fixed-step `tick` it was produced in and the simulation
 * time `timeS` (= tick × fixed step). The emitting context is documented per event.
 */
interface EventMeta {
  /** Fixed-step index (0-based) in which the event happened. */
  readonly tick: number;
  /** Simulation time in seconds at that tick. */
  readonly timeS: number;
}

/** Why a foot left the deck. */
export type FootDetachReason =
  /** The foot's target position went outside the deck area. */
  | "leftDeck"
  /** The foot moved too fast relative to the deck (e.g. a flick). */
  | "tooFast"
  /** The board moved away from the foot (e.g. it fell / flipped away). */
  | "separated"
  /** The rider jumped (the pop): both feet leave the deck until the catch. */
  | "jumped"
  /** Forced by a reset or bail. */
  | "reset";

/** Why a landing or a run failed. */
export type BailReason =
  /** Both feet detached for too long after landing. */
  | "feetDetached"
  /** The board landed with its grip tape facing down. */
  | "upsideDown"
  /** The board landed too far off level (tilt beyond threshold). */
  | "offAngle"
  /** A trick's flip, shove or body spin ended too far from a whole turn (tricks only). */
  | "underRotated"
  /** The balance on a grind or slide was lost: the rider fell off the edge (M4). */
  | "lostBalance";

/** Rotation accumulated around the board's local axes during an air session (rad, signed). */
export interface RotationTotals {
  /** Around local X (long axis) — flips. */
  readonly rollRad: number;
  /** Around local Y (up axis) — shuvits / body varials of the board. */
  readonly yawRad: number;
  /** Around local Z (across axis) — nose/tail pitch. */
  readonly pitchRad: number;
}

/** Emitted by `rider` when a pop gesture applies the pop impulse on the tail (or nose). */
export interface BoardPopped extends EventMeta {
  readonly type: "BoardPopped";
  /** The pop foot: `back` for an ollie, `front` for a nollie. */
  readonly foot: FootId;
  /** The kick that popped: `tail` (ollie) or `nose` (nollie). */
  readonly kick: Kick;
  /** Magnitude of the impulse applied, N·s. */
  readonly impulseNs: number;
  /** World point where it was applied, m. */
  readonly pointWorldM: Vec3;
}

/** Emitted by `board` when it goes from grounded to airborne (no wheel on the ground). */
export interface BoardLeftGround extends EventMeta {
  readonly type: "BoardLeftGround";
  /** Board linear velocity at takeoff, m/s (world). */
  readonly velocityMps: Vec3;
}

/** Emitted by `board` when it goes from airborne to grounded. */
export interface BoardLanded extends EventMeta {
  readonly type: "BoardLanded";
  /** Time since the matching `BoardLeftGround`, s. */
  readonly airtimeS: number;
  /** Board linear velocity at touchdown, m/s (world). */
  readonly velocityMps: Vec3;
  /** Dot product of the board's local +Y with world +Y at touchdown (1 = flat, <0 = upside down). */
  readonly upDot: number;
  /**
   * Dot product of the board's local +Y with the normal of the surface it landed on (the
   * mean normal of the touching wheels; 1 = flush with the surface). On flat ground it
   * equals `upDot`; on a ramp or bank it is what "landed level" means (M3). Optional so
   * older producers and test fakes stay valid; consumers fall back to `upDot`.
   */
  readonly surfaceUpDot?: number;
  /** Number of wheels touching at touchdown. */
  readonly wheelsDown: number;
}

/** Emitted by `rider` when a foot (re)attaches to the deck. */
export interface FootAttached extends EventMeta {
  readonly type: "FootAttached";
  readonly foot: FootId;
  /** Deck-frame position where it attached, m: `alongM` toward +X (nose), `acrossM` toward +Z. */
  readonly deckPosition: { readonly alongM: number; readonly acrossM: number };
}

/** Emitted by `rider` when a foot leaves the deck. */
export interface FootDetached extends EventMeta {
  readonly type: "FootDetached";
  readonly foot: FootId;
  readonly reason: FootDetachReason;
}

/** Emitted by `tricks` when an air session ends in a clean landing. */
export interface TrickLanded extends EventMeta {
  readonly type: "TrickLanded";
  /** Id of the matched `TrickDefinition`. */
  readonly trickId: string;
  /** Display name, e.g. "Kickflip". */
  readonly name: string;
  readonly stance: Stance;
  readonly rotation: RotationTotals;
  readonly airtimeS: number;
}

/** Emitted by `tricks` when an air session ends in a failed landing. */
export interface TrickBailed extends EventMeta {
  readonly type: "TrickBailed";
  /** The trick that was being attempted (the closest match), or null if unknown. */
  readonly trickId: string | null;
  /** Display name of that closest trick, e.g. "Kickflip"; null if unknown. */
  readonly name: string | null;
  readonly reason: BailReason;
  readonly rotation: RotationTotals;
  readonly airtimeS: number;
}

/** Emitted by `rider` when the run is lost; the game resets after a delay. */
export interface RiderBailed extends EventMeta {
  readonly type: "RiderBailed";
  readonly reason: BailReason;
}

/** Emitted by `board` when a board part starts touching a surface. */
export interface SurfaceContactStarted extends EventMeta {
  readonly type: "SurfaceContactStarted";
  readonly part: BoardPartId;
  readonly surface: SurfaceType;
  readonly obstacleId: ObstacleId;
  /** Approximate contact point, m (world). */
  readonly pointWorldM: Vec3;
}

/** Emitted by `board` when a board part stops touching a surface. */
export interface SurfaceContactEnded extends EventMeta {
  readonly type: "SurfaceContactEnded";
  readonly part: BoardPartId;
  readonly surface: SurfaceType;
  readonly obstacleId: ObstacleId;
}

/** Emitted by `tricks` when the board locks onto a grind edge (MECHANICS.md M4). */
export interface GrindStarted extends EventMeta {
  readonly type: "GrindStarted";
  readonly grind: GrindKind;
  readonly side: GrindSide;
  /** Display name, e.g. "BS Tailslide", "FS 50-50". */
  readonly name: string;
  readonly obstacleId: ObstacleId;
  readonly surface: SurfaceType;
}

/** Emitted by `tricks` when the lock on a grind edge ends. */
export interface GrindEnded extends EventMeta {
  readonly type: "GrindEnded";
  readonly grind: GrindKind;
  readonly side: GrindSide;
  readonly name: string;
  readonly obstacleId: ObstacleId;
  /** Time locked on the edge, s. */
  readonly durationS: number;
  readonly exit: GrindExit;
}

/** Discriminated union (on `type`) of every domain event. */
export type DomainEvent =
  | BoardPopped
  | BoardLeftGround
  | BoardLanded
  | FootAttached
  | FootDetached
  | TrickLanded
  | TrickBailed
  | RiderBailed
  | SurfaceContactStarted
  | SurfaceContactEnded
  | GrindStarted
  | GrindEnded;

/** The `type` tag of a domain event. */
export type DomainEventType = DomainEvent["type"];

/** Narrows the union to the event with the given `type`. */
export type EventOfType<T extends DomainEventType> = Extract<DomainEvent, { type: T }>;
