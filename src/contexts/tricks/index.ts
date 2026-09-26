/** Public API of the `tricks` context. */
export type { TricksSystem } from "./application/tricks-system";
export type { AirSession, RotationAccumulator, RotationTotals } from "./domain/air-session";
export type { TrickDefinition } from "./domain/trick-definition";
export { AngleRange } from "./domain/trick-definition";
export type { MotionSample, TrickOutcome, TrickRecognizer } from "./domain/trick-recognizer";
export type { TricksConfig } from "./tricks.config";
export { TRICKS_CONFIG } from "./tricks.config";
