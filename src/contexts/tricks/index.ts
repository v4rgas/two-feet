/** Public API of the `tricks` context. */
export type { DefaultTricksSystemDeps } from "./application/default-tricks-system";
export { DefaultTricksSystem } from "./application/default-tricks-system";
export type { TricksSystem } from "./application/tricks-system";
export type { AirSession, RotationAccumulator, RotationTotals } from "./domain/air-session";
export { DefaultTrickRecognizer } from "./domain/default-trick-recognizer";
export type { NormalisedRotation, RawAirRotation, RiderPose } from "./domain/rider-frame";
export { normaliseRotation, toeSign } from "./domain/rider-frame";
export { LocalRotationAccumulator } from "./domain/rotation-accumulator";
export type {
  ChannelMatch,
  ChannelTolerances,
  TrickClassification,
  TrickInput,
} from "./domain/trick-classifier";
export { classifyTrick } from "./domain/trick-classifier";
export type {
  RotationStep,
  TrickDefinition,
  TrickPrefix,
  TrickTable,
} from "./domain/trick-definition";
export type { MotionSample, TrickOutcome, TrickRecognizer } from "./domain/trick-recognizer";
export type { TricksConfig } from "./tricks.config";
export { TRICK_TABLE, TRICKS_CONFIG } from "./tricks.config";
