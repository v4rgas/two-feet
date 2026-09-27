import "./shell-ui.css";

/** A short, subtle line that fades out (GAME.md: the checkpoint toast, ≈ 0.8 s). */
export class Toast {
  private readonly el: HTMLDivElement;

  constructor(parent: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "skate-toast";
    this.el.setAttribute("role", "status");
    parent.append(this.el);
  }

  show(text: string): void {
    this.el.textContent = text;
    // Restart the fade even when shown again mid-animation.
    this.el.dataset.show = "false";
    void this.el.offsetWidth;
    this.el.dataset.show = "true";
  }

  dispose(): void {
    this.el.remove();
  }
}
