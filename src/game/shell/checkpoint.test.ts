import { describe, expect, it } from "vitest";
import type { BoardSnapshot } from "../../contexts/board";
import { NO_CONTACT } from "../../contexts/board";
import { Transform, Vec3 } from "../../shared";
import { checkpointFrom, checkpointRefusal } from "./checkpoint";

function board(over: Partial<BoardSnapshot> = {}): BoardSnapshot {
  return {
    tick: 1,
    timeS: 0.1,
    transform: Transform.create(Vec3.create(1, 0.1, 2), Transform.IDENTITY.rotation),
    linearVelocityMps: Vec3.create(3, 0, 0),
    angularVelocityRadps: Vec3.create(0, 0.2, 0),
    contacts: NO_CONTACT,
    wheelsDown: 4,
    grounded: true,
    airtimeS: 0,
    contactPoints: [],
    ...over,
  };
}
const riding = { bailed: false, grind: null };

describe("checkpoint rules", () => {
  it("grounded on four wheels, not bailed: sets the pose and both velocities", () => {
    const b = board();
    expect(checkpointRefusal(b, riding)).toBeNull();
    expect(checkpointFrom(b, riding)).toEqual({
      transform: b.transform,
      linearVelocityMps: b.linearVelocityMps,
      angularVelocityRadps: b.angularVelocityRadps,
    });
  });

  it("refuses in the air, on fewer than four wheels, bailed, or on a grind", () => {
    expect(checkpointRefusal(board({ grounded: false, wheelsDown: 0 }), riding)).toBe("airborne");
    expect(checkpointRefusal(board({ wheelsDown: 2 }), riding)).toBe("notOnFourWheels");
    expect(checkpointRefusal(board(), { bailed: true, grind: null })).toBe("bailed");
    const grind = { bailed: false, grind: {} as never };
    expect(checkpointRefusal(board(), grind)).toBe("grinding");
    expect(checkpointFrom(board({ grounded: false }), riding)).toBeNull();
  });
});
