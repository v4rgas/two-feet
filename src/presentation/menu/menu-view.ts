import "../ui/shell-ui.css";
import { renderKeyParts } from "../ui/key-parts";
import type { MenuIntent, MenuViewModel } from "./menu-view-model";

/** The credit in the menu's footer (the user's personal mark). */
export interface MenuCredit {
  readonly text: string;
  readonly linkText: string;
  readonly href: string;
  /** The pixel penguin, drawn pixelated. */
  readonly iconSrc: string;
}

/**
 * The Esc menu's DOM (GAME.md "Menu", STYLE.md): a centred card over a dimmed, paused
 * game. It draws the `MenuViewModel` it is given and reports the mouse (hover, click) as
 * `MenuIntent`s; the keyboard is routed by the game shell. It never changes game state.
 */
export class MenuView {
  private readonly root: HTMLDivElement;
  private readonly title: HTMLHeadingElement;
  private readonly subtitle: HTMLParagraphElement;
  private readonly controls: HTMLDListElement;
  private readonly list: HTMLUListElement;
  private lastKey = "";

  constructor(
    parent: HTMLElement,
    private readonly onIntent: (intent: MenuIntent) => void,
    credit?: MenuCredit,
  ) {
    this.root = document.createElement("div");
    this.root.className = "skate-ui skate-menu";
    this.root.dataset.open = "false";
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "true");
    const card = document.createElement("div");
    card.className = "skate-menu-card";
    this.title = document.createElement("h2");
    this.title.className = "skate-menu-title";
    this.subtitle = document.createElement("p");
    this.subtitle.className = "skate-menu-subtitle";
    this.controls = document.createElement("dl");
    this.controls.className = "skate-menu-controls";
    this.list = document.createElement("ul");
    this.list.className = "skate-menu-list";
    this.list.setAttribute("role", "menu");
    card.append(this.title, this.subtitle, this.controls, this.list);
    if (credit !== undefined) card.append(footer(credit));
    this.root.append(card);
    parent.append(this.root);
  }

  render(view: MenuViewModel): void {
    const key = JSON.stringify(view);
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.root.dataset.open = String(view.open);
    this.root.setAttribute("aria-hidden", String(!view.open));
    if (!view.open) return;
    this.root.dataset.screen = view.controls === undefined ? "list" : "controls";
    this.title.textContent = view.title;
    this.title.dataset.wordmark = String(view.subtitle !== undefined);
    this.subtitle.hidden = view.subtitle === undefined;
    this.subtitle.textContent = view.subtitle ?? "";
    this.controls.hidden = view.controls === undefined;
    this.controls.replaceChildren(
      ...(view.controls ?? []).flatMap((row) => {
        const dt = document.createElement("dt");
        dt.textContent = row.label;
        const dd = document.createElement("dd");
        const keys = document.createElement("span");
        keys.className = "skate-keys";
        renderKeyParts(keys, row.keys);
        dd.append(keys);
        return [dt, dd];
      }),
    );
    this.list.replaceChildren(
      ...view.items.map((item, index) => {
        const li = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "skate-menu-item";
        button.setAttribute("role", "menuitem");
        button.dataset.selected = String(item.selected);
        button.dataset.current = String(item.current === true);
        button.disabled = item.disabled;
        const text = document.createElement("span");
        text.className = "skate-menu-item-text";
        const label = document.createElement("span");
        label.textContent = item.label;
        text.append(label);
        const isValue = item.detail !== undefined && item.detail.length <= 8;
        if (item.detail !== undefined && !isValue) {
          const detail = document.createElement("span");
          detail.className = "skate-menu-detail";
          detail.textContent = item.detail;
          text.append(detail);
        }
        button.append(text);
        if (isValue && item.detail !== undefined) {
          const value = document.createElement("span");
          value.className = "skate-menu-value";
          value.textContent = item.detail;
          button.append(value);
        }
        button.addEventListener("mouseenter", () => this.onIntent({ type: "hover", index }));
        button.addEventListener("click", () => this.onIntent({ type: "activate", index }));
        li.append(button);
        return li;
      }),
    );
  }

  dispose(): void {
    this.root.remove();
  }
}

function footer(credit: MenuCredit): HTMLElement {
  const el = document.createElement("div");
  el.className = "skate-menu-footer";
  const img = document.createElement("img");
  img.src = credit.iconSrc;
  img.alt = "";
  img.width = 16;
  img.height = 16;
  const text = document.createElement("span");
  text.textContent = `${credit.text} · `;
  const link = document.createElement("a");
  link.href = credit.href;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = credit.linkText;
  text.append(link);
  el.append(img, text);
  return el;
}
