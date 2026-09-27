/**
 * A KEY SCRIPT: timed key presses by `KeyboardEvent.code`, at simulation time (value
 * objects). Shared by the headless scenario harness and the montage clips, and replayed
 * by `ScriptedInputSource` through the same key-state logic as the real keyboard.
 */

/** One key press: `code` goes down at `atS` and is held for `holdS` seconds. */
export interface KeyPress {
  readonly code: string;
  readonly atS: number;
  readonly holdS: number;
}

/** A single key transition at simulation time `atS`. */
export interface KeyScriptEvent {
  readonly atS: number;
  readonly type: "keydown" | "keyup";
  readonly code: string;
}

/**
 * Expands presses into down/up events, sorted by time. The sort is stable: events at the
 * same time keep the order of the presses (a press's down before its own up).
 * Throws on a negative time or hold.
 */
export function keyEventsFromPresses(presses: readonly KeyPress[]): KeyScriptEvent[] {
  const events: KeyScriptEvent[] = [];
  for (const p of presses) {
    if (!(p.atS >= 0) || !Number.isFinite(p.holdS) || p.holdS < 0) {
      throw new RangeError(`Bad key press ${p.code} at ${p.atS} s for ${p.holdS} s`);
    }
    events.push({ atS: p.atS, type: "keydown", code: p.code });
    events.push({ atS: p.atS + p.holdS, type: "keyup", code: p.code });
  }
  return events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => a.e.atS - b.e.atS || a.i - b.i)
    .map(({ e }) => e);
}

/** Time of the last event of a script, s (0 when empty). */
export function keyScriptEndS(events: readonly KeyScriptEvent[]): number {
  return events.reduce((end, e) => Math.max(end, e.atS), 0);
}
