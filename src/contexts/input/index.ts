/** Public API of the `input` context. */
export type { FootId, Stance } from "../../shared";
export { FOOT_IDS } from "../../shared";
export type { InputSystem } from "./application/input-system";
export type { FootIntent, IntentFrame } from "./domain/foot-intent";
export type {
  ControlCluster,
  InputSource,
  RawInputSample,
  StanceRepository,
} from "./domain/input-source";
export { clusterForFoot, footForCluster } from "./domain/stance";
export type { StickVelocity } from "./domain/stick-value";
export { StickValue } from "./domain/stick-value";
export type { VirtualStick } from "./domain/virtual-stick";
export type { InputConfig } from "./input.config";
export { INPUT_CONFIG } from "./input.config";
