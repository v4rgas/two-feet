# input

Turns raw device input into per-foot intent. Knows about stance.

## Ubiquitous language

- **Control cluster** — `left` (WASD, later the left gamepad stick) or `right` (arrows).
- **Stance** — `regular`: left cluster drives the **front** foot. `goofy`: left cluster drives the **back** foot.
- **Foot** — `front` / `back`, by role, never by key cluster.
- **Stick value** — smoothed analog position in `[-1, 1]²`, in **board axes**: `y` +1 = toward the nose, `x` +1 = toward the board's +Z side (screen right with the follow camera). Toe/heel meaning is resolved by `rider`.
- **Virtual stick** — spring-damper that turns digital keys into a stick value (tuning in `input.config.ts`). One per cluster (the smoothing belongs to the keys); changing stance resets both.
- **Foot intent** — what one foot wants this step: stick value + stick velocity (for flicks).
- **Intent frame** — both feet's intents + `push`.

## Smoothing (`SpringVirtualStick`)

Per axis `a = ω²(target − x) − 2ζω·v`, semi-implicit Euler at the fixed step.
ω = `pressOmegaRadps` (28) toward a held key, `releaseOmegaRadps` (22) back to 0,
ζ = `dampingRatio` (0.9). A key press reaches 0.9 in ~0.1 s and peaks at ≈ 10 /s stick
velocity (the flick threshold in rider is 8 /s). `value` has a rescaled deadzone
(|x| ≤ 0.05 → 0, 1 stays 1); `velocityPerS` is the raw spring velocity.

## Public API (`index.ts`)

- Types: `FootId`, `Stance`, `StickValue` (VO), `StickVelocity`, `FootIntent`, `IntentFrame`, `VirtualStick`, `ControlCluster`, `RawInputSample`, `InputConfig`, `StickTuning`, `VirtualStickFactory`.
- Ports: `InputSource` (`sample(): RawInputSample`), `StanceRepository` (`load`/`save`).
- Domain: `SpringVirtualStick` (the `VirtualStick` implementation), `footForCluster`, `clusterForFoot`.
- Application: `InputSystem` (interface: `step(dtS): IntentFrame`, `lastIntents`, `stance`, `setStance`, `reset`) and its implementation `DefaultInputSystem(source, stanceRepository, config, createStick?)`.
- Config: `INPUT_CONFIG`.

Infrastructure (imported only by `src/game`):

- `KeyboardInputSource(target, INPUT_CONFIG.keys)` — listens for `keydown`/`keyup`/`blur` on `window`, matches `KeyboardEvent.code`. The most recent of two opposite keys wins. `blur` releases everything. `preventDefault` on arrows and Space. `dispose()` removes the listeners.
- `LocalStorageStanceRepository(storageKey)` — every storage access is in try/catch; bad values load as `null`.

## Events

Emits none. Consumes none.
