import type { Stance } from "../../../shared";
import type { StanceRepository } from "../domain/input-source";

/** The part of the Web Storage API the repository uses. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Returns `localStorage`, or null where it is missing or access throws (privacy modes). */
function browserStorage(): KeyValueStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isStance(value: unknown): value is Stance {
  return value === "regular" || value === "goofy";
}

/**
 * `StanceRepository` backed by `localStorage`. Every storage access is wrapped in
 * try/catch: a blocked or full storage just means the stance is not remembered.
 */
export class LocalStorageStanceRepository implements StanceRepository {
  constructor(
    private readonly key: string,
    private readonly storage: () => KeyValueStorage | null = browserStorage,
  ) {}

  load(): Stance | null {
    try {
      const value = this.storage()?.getItem(this.key) ?? null;
      return isStance(value) ? value : null;
    } catch {
      return null;
    }
  }

  save(stance: Stance): void {
    try {
      this.storage()?.setItem(this.key, stance);
    } catch {
      // Storage unavailable or full: the setting lives for this session only.
    }
  }
}
