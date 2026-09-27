import type { AssistLevel } from "../rider.config";
import { isAssistLevel } from "../rider.config";

/** The part of the Web Storage API the repository uses. */
export interface AssistLevelStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Returns `localStorage`, or null where it is missing or access throws (privacy modes). */
function browserStorage(): AssistLevelStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Remembers the player's assist level (ADR 0012) in `localStorage`, like the stance.
 * Every storage access is wrapped in try/catch: a blocked or full storage just means the
 * level is not remembered.
 */
export class LocalStorageAssistLevelRepository {
  constructor(
    private readonly key: string,
    private readonly storage: () => AssistLevelStorage | null = browserStorage,
  ) {}

  load(): AssistLevel | null {
    try {
      const value = this.storage()?.getItem(this.key) ?? null;
      return isAssistLevel(value) ? value : null;
    } catch {
      return null;
    }
  }

  save(level: AssistLevel): void {
    try {
      this.storage()?.setItem(this.key, level);
    } catch {
      // Storage unavailable or full: the setting lives for this session only.
    }
  }
}
