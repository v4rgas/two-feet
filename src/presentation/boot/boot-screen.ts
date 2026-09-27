/**
 * The boot screen (the credit: "a game by v4rgas") is plain HTML in index.html, so it
 * shows before any script loads. Once the game is ready it fades into the game (like
 * v4rgas.com's own intro) and is removed. Never blocks input for longer than the fade.
 */
export function dismissBootScreen(doc: Document = document, fadeS = 0.6): void {
  const el = doc.getElementById("boot");
  if (el === null) return;
  el.style.transition = `opacity ${fadeS}s ease-out`;
  el.style.pointerEvents = "none";
  el.classList.add("off");
  setTimeout(() => el.remove(), fadeS * 1000 + 50);
}
