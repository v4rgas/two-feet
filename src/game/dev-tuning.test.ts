import { describe, expect, it } from "vitest";
import { TuningToggle } from "./dev-tuning";

describe("F3 tuning toggle", () => {
  it("hidden on load (not even built); F3 builds and shows it, F3 again hides it", async () => {
    const shown: boolean[] = [];
    let builds = 0;
    const toggle = new TuningToggle(async () => {
      builds += 1;
      return { setVisible: (v) => shown.push(v) };
    });
    expect(toggle.shown).toBe(false);
    expect(builds).toBe(0);
    await toggle.toggle();
    expect(toggle.shown).toBe(true);
    await toggle.toggle();
    await toggle.toggle();
    expect(builds).toBe(1);
    expect(shown).toEqual([true, false, true]);
  });
});
