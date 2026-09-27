import type { Stance } from "../../contexts/input";
import { clusterForFoot, INPUT_CONFIG } from "../../contexts/input";
import type { KeyPart } from "../../presentation/ui/key-parts";
import type { FootId } from "../../shared";

/** A stick direction of one foot, by role. */
export type FootDirection = "up" | "down" | "left" | "right";

const LABELS: Readonly<Record<string, string>> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Space: "Space",
  Escape: "Esc",
};

/** What a key cap shows for a `KeyboardEvent.code`: `KeyW` → "W", `ArrowDown` → "↓". */
export function keyLabel(code: string): string {
  return LABELS[code] ?? code.replace(/^Key|^Digit/, "");
}

/** The key cap of a foot's direction in a stance (regular: front = WASD, back = arrows). */
export function footCap(stance: Stance, foot: FootId, direction: FootDirection): string {
  return keyLabel(INPUT_CONFIG.keys[clusterForFoot(stance, foot)][direction]);
}

/** The heel-edge direction of a stance (screen left in regular, right in goofy). */
export function heelDirection(stance: Stance): FootDirection {
  return stance === "regular" ? "left" : "right";
}

/** The toe-edge direction of a stance. */
export function toeDirection(stance: Stance): FootDirection {
  return stance === "regular" ? "right" : "left";
}

export const cap = (label: string): KeyPart => ({ kind: "cap", label });
export const text = (t: string): KeyPart => ({ kind: "text", text: t });

/** The key parts of an ollie in a stance: hold ↓ + S, release ↓, then W (regular). */
export function olliePartsFor(stance: Stance): KeyPart[] {
  const pop = footCap(stance, "back", "down");
  return [
    text("hold"),
    cap(pop),
    text("+"),
    cap(footCap(stance, "front", "down")),
    text(", let go of"),
    cap(pop),
    text(", then"),
    cap(footCap(stance, "front", "up")),
  ];
}

/** The controls reference (GAME.md "Menu" → Controls), in the current stance. */
export function controlRows(stance: Stance): { label: string; keys: KeyPart[] }[] {
  const f = (d: FootDirection) => cap(footCap(stance, "front", d));
  const b = (d: FootDirection) => cap(footCap(stance, "back", d));
  const heel = heelDirection(stance);
  const toe = toeDirection(stance);
  const space = cap("Space");
  return [
    { label: "Push", keys: [space, text("on the ground")] },
    { label: "Ollie", keys: olliePartsFor(stance) },
    { label: "Kickflip / heelflip", keys: [f(heel), text("/"), f(toe), text("after the pop")] },
    { label: "Shove-it (BS / FS)", keys: [b(heel), text("/"), b(toe), text("after the pop")] },
    { label: "Catch", keys: [space, text("in the air")] },
    { label: "Spin · steer", keys: [cap("Q"), text("/"), cap("E")] },
    { label: "Carve", keys: [f(heel), text("+"), b(heel), text("/"), f(toe), text("+"), b(toe)] },
    {
      label: "Grinds",
      keys: [text("land on an edge;"), b("down"), text("tail ·"), f("up"), text("nose")],
    },
    { label: "Restart · checkpoint", keys: [cap("R"), text("·"), cap("C")] },
    { label: "Menu", keys: [cap("Esc")] },
  ];
}
