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
  DeckGeometry,
  FootControl,
  FootForceInput,
  FootForceModel,
  RiderControls,
} from "./domain/foot-force-model";
export type { FeetPressure } from "./domain/foot-placement";
export { feetPressure, targetDeckPosition, toeSideSign } from "./domain/foot-placement";
export { GestureFootForceModel } from "./domain/gesture-foot-force-model";
export type { RiderChange } from "./domain/rider";
export { NEUTRAL_CONTROLS, Rider } from "./domain/rider";
export type { RiderState } from "./domain/rider-state";
export type { RiderConfig } from "./rider.config";
export { RIDER_CONFIG } from "./rider.config";
