# input

Turns raw device input into per-foot intent. Knows about stance.

## Ubiquitous language

- **Control cluster** — `left` (WASD, later the left gamepad stick) or `right` (arrows).
- **Stance** — `regular`: left cluster drives the **front** foot. `goofy`: left cluster drives the **back** foot.
- **Foot** — `front` / `back`, by role, never by key cluster.
- **Stick value** — smoothed analog position in `[-1, 1]²`, in **board axes**: `y` +1 = toward the nose, `x` +1 = toward the board's +Z side (screen right with the follow camera). Toe/heel meaning is resolved by `rider`.
- **Virtual stick** — spring-damper that turns digital keys into a stick value (tuning in `input.config.ts`).
- **Foot intent** — what one foot wants this step: stick value + stick velocity (for flicks).
- **Intent frame** — both feet's intents + `push`.

## Public API (`index.ts`)

- Types: `FootId`, `Stance`, `StickValue` (VO), `StickVelocity`, `FootIntent`, `IntentFrame`, `VirtualStick`, `ControlCluster`, `RawInputSample`, `InputConfig`.
- Ports: `InputSource` (`sample(): RawInputSample`), `StanceRepository` (`load`/`save`).
- Application: `InputSystem` (`step(dtS): IntentFrame`, `lastIntents`, `stance`, `setStance`, `reset`).
- Functions: `footForCluster`, `clusterForFoot`. Config: `INPUT_CONFIG`.

Infrastructure (imported only by `src/game`): keyboard `InputSource`, localStorage `StanceRepository`.

## Events

Emits none. Consumes none.
