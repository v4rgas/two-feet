/**
 * A line of key caps and words, e.g. [↓] + [S] "release" [↓]: how the menu's controls
 * reference and the tutorial cards show keys (STYLE.md). Plain data built by the game.
 */
export type KeyPart =
  | { readonly kind: "cap"; readonly label: string }
  | { readonly kind: "text"; readonly text: string };

/** Renders parts into `parent` (key caps as <kbd>). Replaces its children. */
export function renderKeyParts(parent: HTMLElement, parts: readonly KeyPart[]): void {
  parent.replaceChildren(
    ...parts.map((part) => {
      if (part.kind === "text") {
        const span = document.createElement("span");
        span.className = "skate-keys-text";
        span.textContent = part.text;
        return span;
      }
      const kbd = document.createElement("kbd");
      kbd.className = "skate-cap";
      kbd.textContent = part.label;
      return kbd;
    }),
  );
}
