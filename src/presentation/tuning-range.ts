/** Slider range and step for a tunable number, derived from its default value. */
export interface SliderRange {
  readonly min: number;
  readonly max: number;
  readonly step: number;
}

/** Range multiplier: a slider spans 0 → 4× the default (or 4× → 0 for negatives). */
const SPAN_FACTOR = 4;
/** Slider resolution: two orders of magnitude below the default. */
const STEP_DECADES_BELOW = 2;

export function sliderRange(value: number): SliderRange {
  if (Number.isInteger(value) && Math.abs(value) >= 1) {
    const span = Math.max(SPAN_FACTOR, Math.abs(value) * SPAN_FACTOR);
    return { min: value < 0 ? -span : 0, max: value < 0 ? 0 : span, step: 1 };
  }
  if (value === 0) return { min: -1, max: 1, step: 0.001 };
  const magnitude = Math.abs(value);
  const step = 10 ** (Math.floor(Math.log10(magnitude)) - STEP_DECADES_BELOW);
  const span = magnitude * SPAN_FACTOR;
  return value < 0 ? { min: -span, max: 0, step } : { min: 0, max: span, step };
}
