import type { ShellRepository } from "./shell-repository";

/** The part of the Web Storage API the repository uses. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function browserStorage(): KeyValueStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * `ShellRepository` on `localStorage`. Every access is wrapped in try/catch (GAME.md
 * "First launch"): with no storage the tutorial just runs on every launch.
 */
export class LocalStorageShellRepository implements ShellRepository {
  constructor(
    private readonly keys: { readonly tutorialDoneKey: string; readonly lastMapKey: string },
    private readonly storage: () => KeyValueStorage | null = browserStorage,
  ) {}

  loadTutorialDone(): boolean {
    return this.read(this.keys.tutorialDoneKey) === "true";
  }

  saveTutorialDone(done: boolean): void {
    this.write(this.keys.tutorialDoneKey, String(done));
  }

  loadLastMap(): string | null {
    return this.read(this.keys.lastMapKey);
  }

  saveLastMap(id: string): void {
    this.write(this.keys.lastMapKey, id);
  }

  private read(key: string): string | null {
    try {
      return this.storage()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  private write(key: string, value: string): void {
    try {
      this.storage()?.setItem(key, value);
    } catch {
      // Storage blocked or full: remembered for this session only.
    }
  }
}
