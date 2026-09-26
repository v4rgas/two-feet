import type { FootId, Stance } from "../../../shared";
import type { ControlCluster } from "./input-source";

/**
 * Which foot a control cluster drives (REQUIREMENTS §1.2):
 * regular → left cluster (WASD) = front foot; goofy → left cluster = back foot.
 */
export function footForCluster(stance: Stance, cluster: ControlCluster): FootId {
  const leftIsFront = stance === "regular";
  if (cluster === "left") return leftIsFront ? "front" : "back";
  return leftIsFront ? "back" : "front";
}

/** Inverse of `footForCluster`. */
export function clusterForFoot(stance: Stance, foot: FootId): ControlCluster {
  return footForCluster(stance, "left") === foot ? "left" : "right";
}
