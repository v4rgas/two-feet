import type { BoardSnapshot, BoardSpec } from "../contexts/board";
import type { IntentFrame, Stance } from "../contexts/input";
import type { AssistLevel, RiderState } from "../contexts/rider";
import type { AirSession } from "../contexts/tricks";
import type { Level } from "../contexts/world";
import type { DomainEvent, FootId, RotationTotals, Vec3 } from "../shared";

/**
 * READ MODEL consumed by the renderer, HUD and debug overlay (REQUIREMENTS §2.3 rule 4).
 * Built by `src/game` once per animation frame. Everything is immutable data: the
 * presentation layer never mutates domain state and never calls physics.
 */

/** A force/impulse arrow for the debug overlay. */
export interface DebugVector {
  readonly kind: "force" | "impulse";
  /** Foot that applied it (colour), or null for board-internal forces (wheels, trucks). */
  readonly foot: FootId | null;
  /** Short label, e.g. "pop", "friction", "grip". */
  readonly label: string;
  readonly originWorldM: Vec3;
  /** Force in N or impulse in N·s (world); the overlay chooses the arrow scale. */
  readonly vectorWorld: Vec3;
  /** Time since it was applied, s (impulses fade after 200 ms, STYLE.md). */
  readonly ageS: number;
}

/** Debug numbers for the F1 overlay (the overlay itself owns its on/off toggle). */
export interface DebugInfo {
  /** Wall time of the last `PhysicsWorld.step`, ms. */
  readonly physicsStepMs: number;
  /** Fixed steps simulated for this animation frame. */
  readonly stepsThisFrame: number;
  readonly vectors: readonly DebugVector[];
  /** Recognizer's accumulated rotation (board frame), or null while grounded. */
  readonly rotation: RotationTotals | null;
}

/** Everything one rendered frame needs. */
export interface RenderFrame {
  /** Interpolation factor between `previousBoard` and `currentBoard`, [0, 1). */
  readonly alpha: number;
  readonly previousBoard: BoardSnapshot;
  readonly currentBoard: BoardSnapshot;
  /** Deck lean on the trucks, rad (+ = the +Z side down): the deck mesh tilts by it. */
  readonly leanRad: number;
  /** Rider state after the previous step; feet, torso and heading interpolate by `alpha`. */
  readonly previousRider: RiderState;
  readonly rider: RiderState;
  /** Latest intents — HUD foot pads show `stick` per foot. */
  readonly intents: IntentFrame;
  /** Decides which pad is which foot: the WASD pad is always on the left (STYLE.md). */
  readonly stance: Stance;
  /** The assist level (ADR 0012), shown discreetly next to the stance. Absent: not shown. */
  readonly assistLevel?: AssistLevel;
  readonly air: AirSession | null;
  /** Domain events delivered since the previous frame, oldest first (trick popup, bail). */
  readonly recentEvents: readonly DomainEvent[];
  readonly debug: DebugInfo;
}

/** Static data the renderer needs once, to build meshes that match the colliders exactly. */
export interface SceneSetup {
  readonly boardSpec: BoardSpec;
  readonly level: Level;
}
