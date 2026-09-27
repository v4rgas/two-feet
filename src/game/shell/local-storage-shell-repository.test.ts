import { describe, expect, it } from "vitest";
import type { KeyValueStorage } from "./local-storage-shell-repository";
import { LocalStorageShellRepository } from "./local-storage-shell-repository";

const KEYS = { tutorialDoneKey: "skate.tutorialDone", lastMapKey: "skate.lastMap" };

class MapStorage implements KeyValueStorage {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
}

describe("LocalStorageShellRepository", () => {
  it("round-trips the tutorial flag and the last map under skate.* keys", () => {
    const storage = new MapStorage();
    const repo = new LocalStorageShellRepository(KEYS, () => storage);
    expect(repo.loadTutorialDone()).toBe(false);
    expect(repo.loadLastMap()).toBeNull();
    repo.saveTutorialDone(true);
    repo.saveLastMap("flat");
    expect(storage.data.get("skate.tutorialDone")).toBe("true");
    expect(repo.loadTutorialDone()).toBe(true);
    expect(repo.loadLastMap()).toBe("flat");
  });

  it("no storage, or storage that throws: nothing remembered, nothing thrown", () => {
    const none = new LocalStorageShellRepository(KEYS, () => null);
    none.saveTutorialDone(true);
    expect(none.loadTutorialDone()).toBe(false);
    const throwing = new LocalStorageShellRepository(KEYS, () => ({
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    }));
    expect(() => throwing.saveLastMap("street")).not.toThrow();
    expect(throwing.loadLastMap()).toBeNull();
  });
});
