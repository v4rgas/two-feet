import { describe, expect, it } from "vitest";
import { LocalStorageAssistLevelRepository } from "./local-storage-assist-level-repository";

function memory(): { getItem(k: string): string | null; setItem(k: string, v: string): void } {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
}

describe("LocalStorageAssistLevelRepository", () => {
  it("saves and loads a level", () => {
    const store = memory();
    const repo = new LocalStorageAssistLevelRepository("k", () => store);
    expect(repo.load()).toBeNull();
    repo.save("easy");
    expect(repo.load()).toBe("easy");
  });

  it("ignores junk and survives a throwing storage", () => {
    const store = memory();
    store.setItem("k", "godmode");
    expect(new LocalStorageAssistLevelRepository("k", () => store).load()).toBeNull();
    const broken = new LocalStorageAssistLevelRepository("k", () => {
      throw new Error("blocked");
    });
    expect(broken.load()).toBeNull();
    expect(() => broken.save("pro")).not.toThrow();
  });
});
