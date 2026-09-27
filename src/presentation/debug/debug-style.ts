import type { PresentationConfig } from "../presentation.config";
import type { DebugVector } from "../render-frame";

type DebugConfig = PresentationConfig["debug"];

/** Arrow length, m: forces scale per N, impulses per N·s (STYLE.md §Debug). */
export function arrowLengthM(vector: DebugVector, config: DebugConfig): number {
  const w = vector.vectorWorld;
  const magnitude = Math.hypot(w.x, w.y, w.z);
  return (
    magnitude * (vector.kind === "impulse" ? config.impulseScaleMPerNs : config.forceScaleMPerN)
  );
}

/** Arrow shaft radius, m: impulses are drawn thicker than forces. */
export function arrowRadiusM(vector: DebugVector, config: DebugConfig): number {
  return vector.kind === "impulse" ? config.impulseShaftRadiusM : config.forceShaftRadiusM;
}

/** Opacity in [0, 1]: forces are opaque; impulses fade linearly to 0 over `impulseFadeS`. */
export function arrowOpacity(vector: DebugVector, config: DebugConfig): number {
  if (vector.kind === "force") return 1;
  if (config.impulseFadeS <= 0) return 0;
  return Math.max(0, Math.min(1, 1 - vector.ageS / config.impulseFadeS));
}
