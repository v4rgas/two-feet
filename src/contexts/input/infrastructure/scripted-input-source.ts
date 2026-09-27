import type { InputSource, RawInputSample } from "../domain/input-source";
import type { KeyScriptEvent } from "../domain/key-script";
import type { InputConfig } from "../input.config";
import { KeyboardInputSource } from "./keyboard-input-source";

/** Tolerance when comparing event times with step boundaries, s. */
const TIME_EPS_S = 1e-9;

function keyEvent(type: string, code: string): Event {
  const event = new Event(type, { cancelable: true });
  Object.defineProperty(event, "code", { value: code });
  return event;
}

/**
 * Replay adapter of the `InputSource` port: plays a key script (timed key events at
 * SIMULATION time) instead of listening to the real keyboard.
 *
 * - Deterministic: driven by the fixed-step tick, never by wall time. The loop samples
 *   the input once at the start of every fixed step (loop step 1), so sample number `n`
 *   (0-based) starts at `n · stepS`; before it, every event with `atS < (n + 1) · stepS`
 *   is delivered. This is the same rule as the headless scenario harness.
 * - Same path as the keyboard: the events are dispatched as `keydown` / `keyup` on a
 *   private target that a real `KeyboardInputSource` listens to, so key ordering ("most
 *   recent wins"), Space and Q / E behave exactly as on a keyboard.
 */
export class ScriptedInputSource implements InputSource {
  private readonly target = new EventTarget();
  private readonly keyboard: KeyboardInputSource;
  private readonly events: readonly KeyScriptEvent[];
  private next = 0;
  private tick = 0;

  constructor(
    events: readonly KeyScriptEvent[],
    keys: InputConfig["keys"],
    private readonly stepS: number,
  ) {
    // Stable sort: events at the same time keep their script order.
    this.events = [...events].sort((a, b) => a.atS - b.atS);
    this.keyboard = new KeyboardInputSource(this.target, keys);
  }

  /** Simulation time at which the next sample's step starts, s. */
  get timeS(): number {
    return this.tick * this.stepS;
  }

  /** True once every scripted event has been delivered. */
  get finished(): boolean {
    return this.next >= this.events.length;
  }

  sample(): RawInputSample {
    const stepEndS = (this.tick + 1) * this.stepS;
    while (this.next < this.events.length) {
      const e = this.events[this.next];
      if (e === undefined || e.atS >= stepEndS - TIME_EPS_S) break;
      this.target.dispatchEvent(keyEvent(e.type, e.code));
      this.next += 1;
    }
    this.tick += 1;
    return this.keyboard.sample();
  }

  /** Back to time 0 with every key up (replays the script from the start). */
  restart(): void {
    this.target.dispatchEvent(new Event("blur"));
    this.next = 0;
    this.tick = 0;
  }

  dispose(): void {
    this.keyboard.dispose();
  }
}
