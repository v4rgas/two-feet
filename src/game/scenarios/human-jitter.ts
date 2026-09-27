/*
 * HUMAN JITTER (MECHANICS.md "Assists" → Acceptance): a montage clip's key timeline played
 * the way a person would, with seeded random timing errors, to measure how often a line
 * lands. Test support only; never imported by the game.
 */
import type { KeyPress } from "../../contexts/input";
import type { RiderConfig } from "../../contexts/rider";
import { createFlatGroundLevel, createSkateparkLevel, WORLD_CONFIG } from "../../contexts/world";
import { GAME_CONFIG } from "../game.config";
import type { MontageClip } from "../montage/clip";
import { clipLevel } from "../montage/clip-run";
import { footKey, ScenarioHarness } from "./scenario-harness";
import { heel, toe } from "./scenario-helpers";

/** How sloppy the player is (MECHANICS.md G4H: ± 70 ms, ± 40 ms, ± 0.2 m, ± 0.3 m/s). */
export interface Jitter {
  /** Every key's press time moves by up to ± this, s (uniform). */
  readonly keyS: number;
  /** Every hold lasts up to ± this longer or shorter, s (uniform). */
  readonly holdS: number;
  /** The spawn moves sideways by up to ± this, m (uniform). */
  readonly lateralM: number;
  /** The spawn speed changes by up to ± this, m/s (uniform; never below 0). */
  readonly speedMps: number;
  /** Only these key codes are jittered (all when absent): for finding what a line is sensitive to. */
  readonly onlyCodes?: readonly string[];
}

export const HUMAN_JITTER: Jitter = { keyS: 0.07, holdS: 0.04, lateralM: 0.2, speedMps: 0.3 };

/**
 * A finger cannot press a key it still holds: presses of the same key keep their order, at
 * least this far apart (a press moved into the previous one starts just after it), s.
 */
const SAME_KEY_GAP_S = 0.03;
/** The shortest press, s. */
const MIN_HOLD_S = 0.02;

/** Deterministic PRNG (mulberry32) from a seed: uniform numbers in [0, 1). */
export function seededRandom(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `clip` as played by a sloppy human (run `seed`). */
export function jitterClip(
  clip: MontageClip,
  seed: number,
  jitter: Jitter = HUMAN_JITTER,
): MontageClip {
  const random = seededRandom(seed * 7919 + 17);
  const spread = (size: number): number => (2 * random() - 1) * size;
  const moved: KeyPress[] = clip.keys.map((k) => {
    const dt = spread(jitter.keyS);
    const dh = spread(jitter.holdS);
    if (jitter.onlyCodes !== undefined && !jitter.onlyCodes.includes(k.code)) return { ...k };
    return {
      code: k.code,
      atS: Math.max(0, k.atS + dt),
      holdS: Math.max(MIN_HOLD_S, k.holdS + dh),
    };
  });
  // Same key: in the original order, never overlapping.
  const keys: KeyPress[] = [];
  const lastEnd = new Map<string, number>();
  const order = clip.keys.map((k, i) => ({ k, i })).sort((a, b) => a.k.atS - b.k.atS);
  for (const { i } of order) {
    const k = moved[i];
    if (k === undefined) continue;
    const free = (lastEnd.get(k.code) ?? Number.NEGATIVE_INFINITY) + SAME_KEY_GAP_S;
    const atS = Math.max(k.atS, free);
    keys.push({ code: k.code, atS, holdS: k.holdS });
    lastEnd.set(k.code, atS + k.holdS);
  }
  const base = clip.spawn ?? levelSpawn(clip);
  const side = spread(jitter.lateralM);
  // The rider's side: +Z rotated by the heading (heading 0 = nose toward +X).
  const h = base.headingRad;
  return {
    ...clip,
    keys,
    spawn: {
      xM: base.xM + Math.sin(h) * side,
      yM: base.yM,
      zM: base.zM + Math.cos(h) * side,
      headingRad: h,
      speedMps: Math.max(0, base.speedMps + spread(jitter.speedMps)),
    },
  };
}

function levelSpawn(clip: MontageClip): NonNullable<MontageClip["spawn"]> {
  const level =
    clip.level === "park"
      ? createSkateparkLevel(WORLD_CONFIG)
      : createFlatGroundLevel(WORLD_CONFIG.flatGround);
  const p = level.spawn.positionM;
  return { xM: p.x, yM: p.y, zM: p.z, headingRad: level.spawn.headingRad, speedMps: 0 };
}

/** One jittered run's result. */
export interface JitterRun {
  readonly seed: number;
  readonly landed: boolean;
  readonly tricks: readonly string[];
  readonly bails: readonly string[];
  /** Each grind of the run: its name and how it ended. */
  readonly grinds: readonly string[];
}

/**
 * What counts as landing a line: its trick names, in order (a pattern where either side of
 * an obstacle is fine, e.g. `/^(FS|BS) 50-50$/`).
 */
export type LineNames = readonly (string | RegExp)[];

/** How a jittered line is played and judged. */
export interface JitterOptions {
  readonly jitter?: Jitter;
  /** Default: the clip's `expect.tricks`. */
  readonly names?: LineNames;
  /**
   * The player balances on a grind like a person watching the HUD's balance bar: both
   * feet lean against it (A + ← / D + → in regular) once |balance| passes
   * `BALANCE_REFLEX.threshold`, reacting `BALANCE_REFLEX.delayS` late.
   */
  readonly balanceReflex?: boolean;
  /** Rider tunables (default: `RIDER_CONFIG`), for tuning experiments. */
  readonly rider?: RiderConfig;
}

/** The balance reflex (see `JitterOptions.balanceReflex`). */
export const BALANCE_REFLEX = { threshold: 0.25, delayS: 0.15 } as const;

/**
 * Plays `clip` jittered by `seed` through the full loop (the scenario harness:
 * the real keyboard adapter, like a clip's scripted input). Landed = exactly the line's
 * names, and no bail.
 */
export async function playJittered(
  clip: MontageClip,
  seed: number,
  options: JitterOptions = {},
): Promise<JitterRun> {
  const played = seed === 0 ? clip : jitterClip(clip, seed, options.jitter ?? HUMAN_JITTER);
  const spawn = played.spawn ?? levelSpawn(clip);
  const base = clipLevel(played);
  const h = await ScenarioHarness.create({
    level: base,
    stance: clip.stance,
    ...(options.rider === undefined ? {} : { rider: options.rider }),
  });
  try {
    h.launch(spawn.speedMps);
    h.press(...played.keys);
    const steps = Math.round(clip.durationS / GAME_CONFIG.loop.fixedStepS);
    let held: string[] = [];
    for (let i = 0; i < steps; i += 1) {
      if (options.balanceReflex === true) held = balanceReflex(h, held);
      h.run(GAME_CONFIG.loop.fixedStepS);
    }
    const tricks = h.eventsOf("TrickLanded").map((e) => e.name);
    const bails = [
      ...h.eventsOf("TrickBailed").map((e) => `trick bailed: ${e.name ?? "?"} (${e.reason})`),
      ...h.eventsOf("RiderBailed").map((e) => `rider bailed (${e.reason})`),
    ];
    const names = options.names ?? clip.expect.tricks;
    const matches = (t: string, n: string | RegExp | undefined): boolean =>
      typeof n === "string" ? t === n : n?.test(t) === true;
    const landed =
      bails.length === 0 &&
      tricks.length === names.length &&
      tricks.every((t, i) => matches(t, names[i]));
    const ends = h.eventsOf("GrindEnded");
    const grinds = h.eventsOf("GrindStarted").map((g, i) => `${g.name}:${ends[i]?.exit ?? "-"}`);
    return { seed, landed, tricks, bails, grinds };
  } finally {
    h.dispose();
  }
}

/** One step of the balance reflex: returns the keys now held for it. */
function balanceReflex(h: ScenarioHarness, held: readonly string[]): string[] {
  const past = h.records.at(-1 - Math.round(BALANCE_REFLEX.delayS / GAME_CONFIG.loop.fixedStepS));
  const b = past?.rider.grind?.balance ?? 0;
  const lean: "heel" | "toe" | null =
    h.rider.grind === null || Math.abs(b) < BALANCE_REFLEX.threshold
      ? null
      : b > 0
        ? "heel"
        : "toe";
  const dir = lean === null ? null : lean === "heel" ? heel(h.stance) : toe(h.stance);
  const want =
    dir === null ? [] : [footKey(h.stance, "front", dir), footKey(h.stance, "back", dir)];
  if (want.join() === held.join()) return [...held];
  for (const k of held) h.keyUp(k);
  for (const k of want) h.keyDown(k);
  return want;
}

/** Runs seeds 1…`runs` and returns every result. */
export async function jitterRuns(
  clip: MontageClip,
  runs: number,
  options: JitterOptions = {},
): Promise<JitterRun[]> {
  const out: JitterRun[] = [];
  for (let seed = 1; seed <= runs; seed += 1) out.push(await playJittered(clip, seed, options));
  return out;
}

/** Fraction of runs that landed. */
export function landedRate(runs: readonly JitterRun[]): number {
  return runs.length === 0 ? 0 : runs.filter((r) => r.landed).length / runs.length;
}
