import { describe, expect, it } from "vitest";
import type { KeyValueStorage } from "./local-storage-stance-repository";
import { LocalStorageStanceRepository } from "./local-storage-stance-repository";

class MemoryStorage implements KeyValueStorage {
  readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

const throwing: KeyValueStorage = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("QuotaExceededError");
  },
};

describe("LocalStorageStanceRepository", () => {
  it("round-trips a stance under the configured key", () => {
    const storage = new MemoryStorage();
    const repo = new LocalStorageStanceRepository("skate.stance", () => storage);
    expect(repo.load()).toBeNull();
    repo.save("goofy");
    expect(storage.items.get("skate.stance")).toBe("goofy");
    expect(repo.load()).toBe("goofy");
  });

  it("ignores garbage values", () => {
    const storage = new MemoryStorage();
    storage.setItem("skate.stance", "mongo");
    expect(new LocalStorageStanceRepository("skate.stance", () => storage).load()).toBeNull();
  });

  it("survives a throwing or missing storage", () => {
    const repo = new LocalStorageStanceRepository("k", () => throwing);
    expect(repo.load()).toBeNull();
    expect(() => repo.save("regular")).not.toThrow();
    const none = new LocalStorageStanceRepository("k", () => null);
    expect(none.load()).toBeNull();
    expect(() => none.save("goofy")).not.toThrow();
  });
});
