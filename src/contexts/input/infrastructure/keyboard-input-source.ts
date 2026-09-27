import type { InputSource, RawInputSample } from "../domain/input-source";
import { StickValue } from "../domain/stick-value";
import type { InputConfig } from "../input.config";

/** The part of `Window` (or any `EventTarget`) the keyboard source listens on. */
export interface KeyEventTarget {
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
}

type KeyBindings = InputConfig["keys"];
type ClusterKeys = KeyBindings["left"];

/**
 * Keyboard adapter of the `InputSource` port: WASD = left cluster, arrows = right
 * cluster, Space = feet down (codes from `INPUT_CONFIG.keys`, matched on `KeyboardEvent.code`
 * so layouts like AZERTY still use the physical WASD position).
 *
 * - Opposite keys on one axis: the most recently pressed wins (so a flick from one side
 *   to the other does not stall at 0 while both are down).
 * - `blur` releases every key (a keyup that happens in another window is never seen).
 * - `preventDefault` on arrows and the feet-down key, so the page does not scroll.
 */
export class KeyboardInputSource implements InputSource {
  /** Held key code → press order (higher = more recent). */
  private readonly held = new Map<string, number>();
  private pressCounter = 0;
  private readonly preventDefaultCodes: ReadonlySet<string>;

  constructor(
    private readonly target: KeyEventTarget,
    private readonly keys: KeyBindings,
  ) {
    this.preventDefaultCodes = new Set([
      keys.right.up,
      keys.right.down,
      keys.right.left,
      keys.right.right,
      keys.feetDown,
    ]);
    target.addEventListener("keydown", this.onKeyDown);
    target.addEventListener("keyup", this.onKeyUp);
    target.addEventListener("blur", this.onBlur);
  }

  sample(): RawInputSample {
    return {
      left: this.clusterValue(this.keys.left),
      right: this.clusterValue(this.keys.right),
      feetDown: this.held.has(this.keys.feetDown),
    };
  }

  /** Removes the listeners. The source keeps reporting neutral afterwards. */
  dispose(): void {
    this.target.removeEventListener("keydown", this.onKeyDown);
    this.target.removeEventListener("keyup", this.onKeyUp);
    this.target.removeEventListener("blur", this.onBlur);
    this.held.clear();
  }

  private readonly onKeyDown = (event: Event): void => {
    const code = codeOf(event);
    if (code === null) return;
    if (this.preventDefaultCodes.has(code)) event.preventDefault();
    if (this.held.has(code)) return; // auto-repeat keeps the original press order
    this.pressCounter += 1;
    this.held.set(code, this.pressCounter);
  };

  private readonly onKeyUp = (event: Event): void => {
    const code = codeOf(event);
    if (code === null) return;
    if (this.preventDefaultCodes.has(code)) event.preventDefault();
    this.held.delete(code);
  };

  private readonly onBlur = (): void => {
    this.held.clear();
  };

  private clusterValue(cluster: ClusterKeys): StickValue {
    return StickValue.create(
      this.axis(cluster.left, cluster.right),
      this.axis(cluster.down, cluster.up),
    );
  }

  /** -1, 0 or 1 for a negative/positive key pair; the most recent press wins. */
  private axis(negativeCode: string, positiveCode: string): number {
    const negative = this.held.get(negativeCode);
    const positive = this.held.get(positiveCode);
    if (negative === undefined && positive === undefined) return 0;
    if (negative === undefined) return 1;
    if (positive === undefined) return -1;
    return positive > negative ? 1 : -1;
  }
}

function codeOf(event: Event): string | null {
  const code: unknown = (event as Partial<KeyboardEvent>).code;
  return typeof code === "string" && code.length > 0 ? code : null;
}
