import GUI from "lil-gui";
import { sliderRange } from "./tuning-range";

/**
 * DEV-ONLY lil-gui tuning panel (REQUIREMENTS §1.7). Built generically from config objects:
 * numbers become sliders, booleans checkboxes, "#rrggbb" strings color pickers, nested
 * objects and arrays folders. Load it with a dynamic `import()` behind
 * `import.meta.env.DEV` so it never reaches production bundles.
 *
 * Configs are deep-frozen, so `target` MUST be a `structuredClone` (`Tunable<T>`) that the
 * game injects into the systems; the panel edits it in place.
 */

/** One top-level folder of the panel. */
export interface TuningSection {
  readonly name: string;
  /** A mutable clone of a config object (`Tunable<T>`). Edited in place. */
  readonly target: object;
  /** String properties shown as a dropdown of these options (e.g. the assist level). */
  readonly choices?: Readonly<Record<string, readonly string[]>>;
}

/** Called after any value changes. `path` is dot-separated inside the section. */
export type TuningChangeHandler = (section: string, path: string, value: unknown) => void;

export interface TuningPanel {
  /** Shows or hides the panel (GAME.md: hidden on load, F3 toggles it). */
  setVisible(visible: boolean): void;
  dispose(): void;
}

const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

function labelFor(key: string, value: unknown): string {
  if (typeof value === "object" && value !== null && "name" in value) {
    const name = (value as { name: unknown }).name;
    if (typeof name === "string") return name;
  }
  return key;
}

function addEntries(
  gui: GUI,
  target: Record<string, unknown>,
  section: string,
  prefix: string,
  onChange: TuningChangeHandler | undefined,
): void {
  for (const [key, value] of Object.entries(target)) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    const notify = (v: unknown): void => onChange?.(section, path, v);
    if (typeof value === "number") {
      const { min, max, step } = sliderRange(value);
      gui.add(target, key, min, max, step).onChange(notify);
    } else if (typeof value === "boolean") {
      gui.add(target, key).onChange(notify);
    } else if (typeof value === "string" && COLOR_PATTERN.test(value)) {
      gui.addColor(target, key).onChange(notify);
    } else if (typeof value === "object" && value !== null) {
      const folder = gui.addFolder(labelFor(key, value));
      folder.close();
      addEntries(folder, value as Record<string, unknown>, section, path, onChange);
      if (folder.controllers.length === 0 && folder.folders.length === 0) folder.destroy();
    }
    // Other strings (key codes, storage keys, ids) are not tunables: skipped.
  }
}

export function createTuningPanel(
  sections: readonly TuningSection[],
  onChange?: TuningChangeHandler,
): TuningPanel {
  const gui = new GUI({ title: "Tuning (dev)", width: 300 });
  gui.close();
  gui.hide();
  for (const section of sections) {
    const folder = gui.addFolder(section.name);
    folder.close();
    for (const [key, options] of Object.entries(section.choices ?? {})) {
      folder
        .add(section.target as Record<string, unknown>, key, [...options])
        .listen()
        .onChange((v: unknown) => onChange?.(section.name, key, v));
    }
    addEntries(folder, section.target as Record<string, unknown>, section.name, "", onChange);
  }
  // lil-gui inputs have no name/id; give them one so DevTools' form audit stays quiet.
  gui.domElement.querySelectorAll("input, select").forEach((input, index) => {
    if (input instanceof HTMLInputElement || input instanceof HTMLSelectElement) {
      input.name ||= `tuning-${index}`;
    }
  });
  return { setVisible: (visible) => gui.show(visible), dispose: () => gui.destroy() };
}
