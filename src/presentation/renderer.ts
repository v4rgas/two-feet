import type { RenderFrame, SceneSetup } from "./render-frame";

/**
 * Presentation entry point used by the game loop. The Three.js implementation
 * (renderer + camera + HUD + debug overlay) lives in this folder.
 */
export interface Renderer {
  /** Builds meshes for the board and level. Called once, and again after a level change. */
  setup(scene: SceneSetup): void;
  /** Draws one frame. Must not allocate per frame in hot paths (REQUIREMENTS §2.5). */
  render(frame: RenderFrame): void;
  dispose(): void;
}
