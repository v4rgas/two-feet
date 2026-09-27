import type { KeyPress, Stance } from "../../contexts/input";
import type { ShotSegment } from "../../presentation/cinematic/cinematic-director";

/*
 * MONTAGE CLIP FORMAT (plain data). A clip is a line filmed with REAL inputs: a key
 * timeline replayed through the game's input → rider → physics path (ScriptedInputSource),
 * plus how to film it (camera shots, slow motion) and what must land (verification).
 * Clips live in `clips/*.ts` and are listed in `clips/index.ts`.
 */

/** Which map a clip is filmed on: a registered map id (`src/maps/<id>/`, `MAPS`). */
export type ClipLevel = string;

/** Where the clip starts: overrides the level's spawn. */
export interface ClipSpawn {
  /** Ground point under the board's centre, world m (the board adds its rest height). */
  readonly xM: number;
  readonly yM: number;
  readonly zM: number;
  /** Rotation about world +Y, rad (0 = nose toward world +X). */
  readonly headingRad: number;
  /** Initial speed along the nose, m/s (0 = standing start). */
  readonly speedMps: number;
}

/** A slow-motion window: the SIMULATION runs `scale` × real time between the two times. */
export interface SlowMotion {
  /** Clip (simulation) time, s. */
  readonly fromS: number;
  readonly toS: number;
  /** Simulation seconds per video second, (0, 1]. */
  readonly scale: number;
}

/** What `montage:verify` checks. */
export interface ClipExpectation {
  /** `TrickLanded` names, in order. No `TrickBailed` or `RiderBailed` is allowed. */
  readonly tricks: readonly string[];
  /** The board must be rolling fakie (backwards in the same stance) at this clip time, s. */
  readonly rollsFakieAtS?: number;
}

export interface MontageClip {
  /** URL id (`?montage=<id>`), kebab-case. */
  readonly id: string;
  /** Title card / lower-third caption, e.g. "Kickflip · 5-stair". */
  readonly title: string;
  readonly level: ClipLevel;
  readonly stance: Stance;
  /** Absent = the level's own spawn at rest. */
  readonly spawn?: ClipSpawn;
  /** Length of the clip, simulation s. */
  readonly durationS: number;
  /** Key timeline, simulation time from the clip start (see `KeyTimeline`). */
  readonly keys: readonly KeyPress[];
  /** Camera shots by clip time; the first one should start at 0. */
  readonly shots: readonly ShotSegment[];
  readonly slowMotion?: readonly SlowMotion[];
  readonly expect: ClipExpectation;
  /**
   * Set when the clip cannot land yet because of a missing game feature or a rider
   * limitation: the reason. `montage:verify` reports it and skips the assertion; the
   * montage still plays it.
   */
  readonly pending?: string;
}

/** Simulation seconds per video second at clip time `tS` (1 outside slow-motion windows). */
export function timeScaleAt(clip: MontageClip, tS: number): number {
  for (const w of clip.slowMotion ?? []) {
    if (tS >= w.fromS && tS < w.toS) return w.scale;
  }
  return 1;
}

/** Structural problems of a clip (empty = valid). */
export function clipProblems(clip: MontageClip): string[] {
  const problems: string[] = [];
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(clip.id)) problems.push(`id "${clip.id}" is not kebab-case`);
  if (!(clip.durationS > 0)) problems.push("durationS must be > 0");
  if (clip.shots.length === 0) problems.push("needs at least one shot");
  if ((clip.shots[0]?.fromS ?? 0) !== 0) problems.push("the first shot must start at 0");
  for (let i = 1; i < clip.shots.length; i += 1) {
    if ((clip.shots[i]?.fromS ?? 0) <= (clip.shots[i - 1]?.fromS ?? 0)) {
      problems.push(`shot ${i} does not start after shot ${i - 1}`);
    }
  }
  for (const s of clip.shots) {
    if (s.fromS >= clip.durationS) problems.push(`a shot starts after the end (${s.fromS} s)`);
  }
  for (const w of clip.slowMotion ?? []) {
    if (!(w.scale > 0 && w.scale <= 1)) problems.push(`slow-motion scale ${w.scale} not in (0, 1]`);
    if (!(w.toS > w.fromS)) problems.push(`slow-motion window ${w.fromS}–${w.toS} is empty`);
  }
  for (const k of clip.keys) {
    if (k.atS < 0 || k.holdS < 0) problems.push(`key ${k.code} has a negative time`);
    if (k.atS > clip.durationS) problems.push(`key ${k.code} at ${k.atS} s is after the end`);
  }
  return problems;
}
