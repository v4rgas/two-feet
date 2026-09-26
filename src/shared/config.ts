/** Recursively readonly view of a config object. */
export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

/** Recursively mutable copy type — used ONLY by the dev tuning panel on a cloned config. */
export type Tunable<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends object
    ? { -readonly [K in keyof T]: Tunable<T[K]> }
    : T;

/**
 * Deep-freezes a config object and returns it typed as deeply readonly.
 * Every `<ctx>.config.ts` exports its constants through this (REQUIREMENTS §2.5).
 * The lil-gui tuning panel must work on `structuredClone(config)` (typed `Tunable<…>`),
 * never on the frozen default: systems receive their config object by injection.
 */
export function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    for (const key of Reflect.ownKeys(value)) {
      deepFreeze((value as Record<PropertyKey, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}
