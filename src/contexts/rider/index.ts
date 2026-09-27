/** Public API of the `rider` context. */
export type { DefaultRiderSystemDeps } from "./application/default-rider-system";
export { DefaultRiderSystem } from "./application/default-rider-system";
export type { RiderSystem } from "./application/rider-system";
export { DeckPosition } from "./domain/deck-position";
export {
  deckTopPointLocal,
  flatHalfLengthM,
  isOverTail,
  tailTipLocal,
} from "./domain/deck-surface";
export type { FootContact, FootState } from "./domain/foot";
export type { FootForce, FootForceLabel } from "./domain/foot-force";
export type {
  BoardKinematics,
  BoardMassProperties,
  DeckGeometry,
  FootControl,
  FootForceInput,
  FootForceModel,
  FootForceOutput,
  GrindEdgeView,
  GrindReport,
  RiderControls,
} from "./domain/foot-force-model";
export type { FeetPressure } from "./domain/foot-placement";
export { feetPressure, targetDeckPosition, toeSideSign } from "./domain/foot-placement";
export type { AirStart } from "./domain/grind-controller";
export { GrindController } from "./domain/grind-controller";
export type { RiderChange } from "./domain/rider";
export { NEUTRAL_CONTROLS, Rider } from "./domain/rider";
export type { RiderGrind, RiderState } from "./domain/rider-state";
export { TrickController } from "./domain/trick-controller";
export type { AssistLevel, AssistTuning, RiderConfig } from "./rider.config";
export { ASSIST_LEVELS, isAssistLevel, nextAssistLevel, RIDER_CONFIG } from "./rider.config";
