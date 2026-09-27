/*
 * Browser-only asset helpers. Everything here degrades to "not available" in Node (the
 * tests) so callers keep their flat-colour fallbacks.
 */

/** True where images and canvases exist (a browser with a DOM), false in Node/tests. */
export function canLoadImages(): boolean {
  return typeof document !== "undefined" && typeof Image !== "undefined";
}

/** URL of a file in `public/`, respecting Vite's base path. */
export function publicUrl(path: string): string {
  const base = import.meta.env?.BASE_URL ?? "/";
  return `${base}${path.replace(/^\//, "")}`;
}

const images = new Map<string, Promise<HTMLImageElement>>();

/** Loads (once) and decodes an image. Rejects outside a browser. */
export function loadImage(url: string): Promise<HTMLImageElement> {
  const cached = images.get(url);
  if (cached !== undefined) return cached;
  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    if (!canLoadImages()) {
      reject(new Error("no DOM: images cannot load here"));
      return;
    }
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`failed to load ${url}`));
    image.src = url;
  });
  images.set(url, promise);
  return promise;
}

const fonts = new Map<string, Promise<void>>();

/**
 * Makes a webfont available to canvas text: a bundled file (`url`, via `FontFace`) or,
 * without one, a face the page already declares (e.g. Inter from index.html). Resolves
 * even when the font fails (the canvas then uses the fallback in its font string).
 */
export function loadFont(family: string, weight: string, url?: string): Promise<void> {
  const key = `${family}|${weight}|${url ?? ""}`;
  const cached = fonts.get(key);
  if (cached !== undefined) return cached;
  const promise = (async () => {
    if (typeof document === "undefined" || document.fonts === undefined) return;
    try {
      if (url !== undefined) {
        const face = new FontFace(family, `url(${url})`, { weight });
        await face.load();
        document.fonts.add(face);
      }
      await document.fonts.load(`${weight} 64px "${family}"`);
    } catch {
      // The canvas falls back to the next family in its font string.
    }
  })();
  fonts.set(key, promise);
  return promise;
}

/** A 2D canvas of the given size (browser only). */
export function createCanvas(
  width: number,
  height: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (!canLoadImages()) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  return ctx === null ? null : { canvas, ctx };
}
