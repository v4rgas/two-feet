import { afterEach, describe, expect, it } from "vitest";
import { BOARD_CONFIG } from "../../contexts/board";
import { RapierPhysicsWorld } from "../../contexts/board/infrastructure/rapier-physics-world";
import type { StanceRepository } from "../../contexts/input";
import { INPUT_CONFIG } from "../../contexts/input";
import { RIDER_CONFIG } from "../../contexts/rider";
import { TRICKS_CONFIG } from "../../contexts/tricks";
import type { MenuViewModel } from "../../presentation/menu/menu-view-model";
import type { SceneSetup } from "../../presentation/render-frame";
import type { Stance } from "../../shared";
import { ManualClock, Quat, Transform, Vec3 } from "../../shared";
import { GAME_CONFIG } from "../game.config";
import { MAPS } from "../maps/maps";
import type { ShellView } from "./game-shell";
import { GameShell } from "./game-shell";
import { MemoryShellRepository } from "./shell-repository";

/*
 * THE GAME SHELL, full loop (real Rapier, the real keyboard adapter behind the shell's key
 * routing): R / C checkpoints, the pause, the Esc menu, map switching without leaks
 * (GAME.md "Acceptance").
 */

const STEP_S = GAME_CONFIG.loop.fixedStepS;
const T = 30_000;

class FakeView implements ShellView {
  readonly setups: SceneSetup[] = [];
  readonly toasts: string[] = [];
  menu: MenuViewModel = { open: false, title: "", items: [] };
  frames = 0;
  setup(scene: SceneSetup): void {
    this.setups.push(scene);
  }
  render(): void {
    this.frames += 1;
  }
  showToast(text: string): void {
    this.toasts.push(text);
  }
  renderMenu(view: MenuViewModel): void {
    this.menu = view;
  }
}

class MemoryStance implements StanceRepository {
  constructor(private stance: Stance = "regular") {}
  load(): Stance {
    return this.stance;
  }
  save(stance: Stance): void {
    this.stance = stance;
  }
}

interface Rig {
  readonly shell: GameShell;
  readonly view: FakeView;
  readonly keys: EventTarget;
  readonly tuning: { toggles: number };
  press(code: string): void;
  down(code: string): void;
  up(code: string): void;
  run(seconds: number): void;
}

const open: GameShell[] = [];
afterEach(() => {
  for (const s of open.splice(0)) s.dispose();
});

async function rig(mapId = "flat"): Promise<Rig> {
  const view = new FakeView();
  const keys = new EventTarget();
  const tuning = { toggles: 0 };
  const shell = await GameShell.create(
    {
      maps: MAPS,
      configs: {
        board: BOARD_CONFIG,
        rider: RIDER_CONFIG,
        input: INPUT_CONFIG,
        game: GAME_CONFIG,
        tricks: TRICKS_CONFIG,
      },
      keys,
      stanceRepository: new MemoryStance(),
      storage: new MemoryShellRepository(true),
      clock: new ManualClock(),
      view,
      onToggleTuning: () => {
        tuning.toggles += 1;
      },
      checkpointToast: "checkpoint",
    },
    { mapId },
  );
  open.push(shell);
  const key = (type: string, code: string) =>
    keys.dispatchEvent(Object.assign(new Event(type, { cancelable: true }), { code }));
  return {
    shell,
    view,
    keys,
    tuning,
    down: (code) => key("keydown", code),
    up: (code) => key("keyup", code),
    press: (code) => {
      key("keydown", code);
      key("keyup", code);
    },
    run: (seconds) => {
      for (let i = 0; i < Math.round(seconds / STEP_S); i += 1) shell.advance(STEP_S);
    },
  };
}

function sim(r: Rig) {
  const s = r.shell.simulation;
  if (s === null) throw new Error("no simulation");
  return s;
}

/** Sets the board rolling along its nose at `speedMps` (a run-up). */
function launch(r: Rig, speedMps: number): void {
  const body = sim(r).board.body;
  const t = body.getTransform();
  body.resetTo(t, Transform.toWorldDirection(t, Vec3.create(speedMps, 0, 0)));
}

/** Drops the board upside down from 0.6 m: it lands on its grip and the rider bails. */
function dropUpsideDown(r: Rig): void {
  const p = sim(r).loop.board.transform.positionM;
  sim(r).board.body.resetTo(
    Transform.create(Vec3.create(p.x + 2, 0.6, p.z), Quat.fromAxisAngle(Vec3.UNIT_X, Math.PI)),
  );
}

describe("game shell: R and C (checkpoints)", () => {
  it(
    "C while rolling on four wheels, ride on, R: back at the checkpoint's pose and velocity within 1 mm, feet on, no bail",
    async () => {
      const r = await rig("street");
      r.run(0.3);
      launch(r, 3);
      r.run(0.5);
      r.press("KeyC");
      const cp = r.shell.checkpoint;
      expect(cp).not.toBeNull();
      expect(r.view.toasts).toEqual(["checkpoint"]);
      const at = sim(r).loop.board;
      r.run(1.2);
      expect(
        Vec3.distance(sim(r).loop.board.transform.positionM, at.transform.positionM),
      ).toBeGreaterThan(1);
      r.press("KeyR");
      const back = sim(r).loop.board;
      expect(Vec3.distance(back.transform.positionM, at.transform.positionM)).toBeLessThan(1e-3);
      expect(Math.abs(Quat.dot(back.transform.rotation, at.transform.rotation))).toBeGreaterThan(
        1 - 1e-6,
      );
      expect(Vec3.distance(back.linearVelocityMps, at.linearVelocityMps)).toBeLessThan(1e-3);
      const rider = sim(r).loop.rider;
      expect(rider.bailed).toBe(false);
      expect(rider.front.contact).toBe("attached");
      expect(rider.back.contact).toBe("attached");
      expect(sim(r).tricks.air).toBeNull();
      // And it rides on from there at the saved speed.
      r.run(0.3);
      expect(Vec3.length(sim(r).loop.board.linearVelocityMps)).toBeGreaterThan(2.5);
    },
    T,
  );

  it(
    "R without a checkpoint restarts at the map's spawn, at rest",
    async () => {
      const r = await rig("street");
      r.run(0.3);
      launch(r, 3);
      r.run(1);
      r.press("KeyR");
      const b = sim(r).loop.board;
      expect(Vec3.distance(b.transform.positionM, sim(r).spawn.positionM)).toBeLessThan(1e-6);
      expect(Vec3.length(b.linearVelocityMps)).toBeLessThan(1e-9);
    },
    T,
  );

  it(
    "C in the air or while bailed does nothing",
    async () => {
      const r = await rig();
      r.run(0.3);
      const p = sim(r).loop.board.transform;
      sim(r).board.body.resetTo(
        Transform.create(Vec3.add(p.positionM, Vec3.create(0, 1, 0)), p.rotation),
      );
      r.run(0.05);
      expect(sim(r).loop.board.grounded).toBe(false);
      r.press("KeyC");
      expect(r.shell.checkpoint).toBeNull();
      r.run(1);
      dropUpsideDown(r);
      for (let i = 0; i < 240 && !sim(r).loop.rider.bailed; i += 1) r.run(STEP_S);
      expect(sim(r).loop.rider.bailed).toBe(true);
      r.press("KeyC");
      expect(r.shell.checkpoint).toBeNull();
      expect(r.view.toasts).toEqual([]);
    },
    T,
  );

  it(
    "a bail auto-resets to the checkpoint (not the spawn)",
    async () => {
      const r = await rig();
      r.run(0.3);
      launch(r, 2);
      r.run(1);
      r.press("KeyC");
      const cp = r.shell.checkpoint;
      if (cp === null) throw new Error("no checkpoint");
      dropUpsideDown(r);
      let reset = false;
      for (let i = 0; i < 6 * 120 && !reset; i += 1) {
        r.run(STEP_S);
        const b = sim(r).loop.board;
        reset = Vec3.distance(b.transform.positionM, cp.transform.positionM) < 1e-3;
      }
      expect(reset).toBe(true);
      expect(sim(r).loop.rider.bailed).toBe(false);
      expect(Vec3.distance(sim(r).loop.board.linearVelocityMps, cp.linearVelocityMps)).toBeLessThan(
        1e-3,
      );
    },
    T,
  );

  it(
    "a map change clears the checkpoint",
    async () => {
      const r = await rig();
      r.run(0.3);
      r.press("KeyC");
      expect(r.shell.checkpoint).not.toBeNull();
      await r.shell.loadMap("street");
      expect(r.shell.checkpoint).toBeNull();
      r.press("KeyR");
      expect(
        Vec3.distance(sim(r).loop.board.transform.positionM, sim(r).spawn.positionM),
      ).toBeLessThan(1e-6);
    },
    T,
  );
});

describe("game shell: Esc pauses exactly", () => {
  it(
    "while the menu is open the tick does not advance and no key reaches the input",
    async () => {
      const r = await rig();
      r.run(0.3);
      r.down("KeyW"); // held into the pause
      r.run(0.1);
      expect(sim(r).input.lastIntents.front.held?.y).toBe(1);
      r.press("Escape");
      expect(r.shell.paused).toBe(true);
      expect(r.view.menu.open).toBe(true);
      const tick = sim(r).loop.tick;
      const pose = sim(r).loop.board.transform;
      r.down("ArrowLeft");
      r.down("Space");
      r.press("KeyR");
      r.press("KeyC");
      r.run(1);
      expect(sim(r).loop.tick).toBe(tick);
      expect(sim(r).loop.board.transform).toBe(pose);
      expect(r.shell.checkpoint).toBeNull();
      r.up("KeyW");
      r.up("ArrowLeft");
      r.up("Space");
      r.press("Escape");
      expect(r.shell.paused).toBe(false);
      r.run(STEP_S);
      expect(sim(r).loop.tick).toBe(tick + 1);
      const intents = sim(r).input.lastIntents;
      expect(intents.front.held?.x ?? 0).toBe(0);
      expect(intents.front.held?.y ?? 0).toBe(0);
      expect(intents.back.held?.x ?? 0).toBe(0);
      expect(intents.feetDown).toBe(false);
    },
    T,
  );

  it(
    "keys pressed during the pause do not leak after it (a W pressed and held in the menu)",
    async () => {
      const r = await rig();
      r.run(0.3);
      r.press("Escape");
      r.down("KeyD");
      r.press("Escape");
      r.run(0.2);
      expect(sim(r).input.lastIntents.front.held?.x ?? 0).toBe(0);
      r.up("KeyD");
    },
    T,
  );
});

describe("game shell: the Esc menu and maps", () => {
  it(
    "keyboard: Esc → Maps → Flat ground loads it; the list has every registered map",
    async () => {
      const r = await rig("street");
      r.press("Escape");
      r.press("ArrowDown");
      r.press("Enter");
      expect(r.view.menu.title).toBe("Maps");
      expect(r.view.menu.items.map((i) => i.label)).toEqual([
        ...MAPS.all.map((m) => m.name),
        "Back",
      ]);
      const flat = MAPS.all.findIndex((m) => m.id === "flat");
      for (let i = 0; i < flat; i += 1) r.press("ArrowDown");
      r.press("Enter");
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(r.shell.currentMap?.id).toBe("flat");
      expect(r.shell.paused).toBe(false);
    },
    T,
  );

  it(
    "switching street ↔ flat rebuilds the world with no leaks: one live physics world, the same bodies and colliders, a new scene each time",
    async () => {
      const r = await rig("street");
      const live = RapierPhysicsWorld.liveWorlds;
      const streetStats = sim(r).physics.stats();
      const oldPhysics = sim(r).physics;
      await r.shell.loadMap("flat");
      expect(() => oldPhysics.stats()).toThrow(/dispose/);
      const flatStats = sim(r).physics.stats();
      expect(flatStats.colliders).toBeLessThan(streetStats.colliders);
      for (let i = 0; i < 3; i += 1) {
        await r.shell.loadMap("street");
        expect(sim(r).physics.stats()).toEqual(streetStats);
        await r.shell.loadMap("flat");
        expect(sim(r).physics.stats()).toEqual(flatStats);
      }
      expect(RapierPhysicsWorld.liveWorlds).toBe(live);
      expect(r.view.setups.map((s) => s.level.id)).toEqual([
        "street",
        "flat",
        "street",
        "flat",
        "street",
        "flat",
        "street",
        "flat",
      ]);
      r.run(0.5);
      expect(sim(r).loop.board.grounded).toBe(true);
    },
    T,
  );

  it(
    "stance from the menu toggles and persists into the next map's simulation",
    async () => {
      const r = await rig();
      r.press("Escape");
      const stanceRow = r.view.menu.items.findIndex((i) => i.label === "Stance");
      r.shell.onMenuIntent({ type: "activate", index: stanceRow });
      expect(sim(r).input.stance).toBe("goofy");
      expect(r.view.menu.items[stanceRow]?.detail).toBe("goofy");
      await r.shell.loadMap("street");
      expect(sim(r).input.stance).toBe("goofy");
    },
    T,
  );

  it(
    "F3 toggles the tuning panel (and never reaches the game)",
    async () => {
      const r = await rig();
      expect(r.tuning.toggles).toBe(0);
      r.press("F3");
      r.press("F3");
      expect(r.tuning.toggles).toBe(2);
    },
    T,
  );
});
