import "../ui/shell-ui.css";
import "./tutorial.css";
import { renderKeyParts } from "../ui/key-parts";
import type { TutorialCardView } from "./tutorial-card-view-model";

/**
 * The tutorial's prompt card, top centre (GAME.md "Tutorial", STYLE.md): the step's title,
 * its key caps in the current stance, and a hint line after a failed attempt. Shown only
 * while the tutorial runs.
 */
export class TutorialCard {
  private readonly root: HTMLDivElement;
  private readonly progress: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly keys: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private readonly footnote: HTMLDivElement;
  private lastKey = "";

  constructor(parent: HTMLElement) {
    this.root = document.createElement("div");
    this.root.className = "skate-ui skate-tutorial";
    this.root.dataset.show = "false";
    this.root.setAttribute("role", "status");
    const make = (cls: string) => {
      const el = document.createElement("div");
      el.className = cls;
      this.root.append(el);
      return el;
    };
    this.progress = make("skate-tutorial-progress");
    this.title = make("skate-tutorial-title");
    this.keys = make("skate-tutorial-keys skate-keys");
    this.hint = make("skate-tutorial-hint");
    this.footnote = make("skate-tutorial-footnote");
    parent.append(this.root);
  }

  render(card: TutorialCardView | null): void {
    const key = JSON.stringify(card);
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.root.dataset.show = String(card !== null);
    if (card === null) return;
    this.progress.textContent = card.progress;
    this.title.textContent = card.title;
    renderKeyParts(this.keys, card.keys);
    this.hint.textContent = card.hint ?? "";
    this.hint.dataset.show = String(card.hint !== null);
    this.footnote.textContent = card.footnote ?? "";
    this.footnote.hidden = card.footnote === null;
  }

  dispose(): void {
    this.root.remove();
  }
}
