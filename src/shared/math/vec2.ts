/** Immutable 2D vector value object (plain data). Used for stick values and deck-plane positions. */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/** Creates a validated Vec2. Throws `RangeError` on NaN / Infinity. */
function create(x: number, y: number): Vec2 {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new RangeError(`Vec2 components must be finite, got (${x}, ${y})`);
  }
  return Object.freeze({ x, y });
}

const ZERO: Vec2 = create(0, 0);

function add(a: Vec2, b: Vec2): Vec2 {
  return create(a.x + b.x, a.y + b.y);
}

function sub(a: Vec2, b: Vec2): Vec2 {
  return create(a.x - b.x, a.y - b.y);
}

function scale(v: Vec2, s: number): Vec2 {
  return create(v.x * s, v.y * s);
}

function length(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

function equals(a: Vec2, b: Vec2, epsilon = 1e-9): boolean {
  return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon;
}

/** Namespace of Vec2 factory + pure operations. */
export const Vec2 = Object.freeze({ create, ZERO, add, sub, scale, length, equals });
