import type { CinematicConfig } from "../../presentation/cinematic/cinematic.config";
import { CinematicDirector } from "../../presentation/cinematic/cinematic-director";
import { VideoHud } from "../../presentation/cinematic/video-hud";
import type { PresentationConfig } from "../../presentation/presentation.config";
import type { RenderFrame } from "../../presentation/render-frame";
import type { ThreeRenderer } from "../../presentation/three-renderer";
import type { MontageClip } from "../montage/clip";
import { timeScaleAt } from "../montage/clip";
import { ClipRun } from "../montage/clip-run";
import { StepClock } from "../montage/step-clock";
import type { IntroPlayer } from "../shell/game-shell";
import type { IntroConfig } from "./intro.config";

export interface CinematicIntroDeps {
  readonly renderer: ThreeRenderer;
  /** The game canvas (the HUD overlay is sized to it). */
  readonly canvas: HTMLCanvasElement;
  /** Where the HUD overlay goes. */
  readonly parent: HTMLElement;
  readonly clip: MontageClip;
  readonly config: IntroConfig;
  readonly presentation: PresentationConfig;
  readonly cinematic: CinematicConfig;
  /** Base URL of `public/` (Vite's `BASE_URL`). */
  readonly baseUrl: string;
}

interface Playing {
  readonly run: ClipRun;
  readonly hud: VideoHud;
  readonly clock: StepClock;
  videoS: number;
  first: boolean;
  landed: boolean;
}

/**
 * THE OPENING CINEMATIC, in the browser (GAME.md "Intro"): the production-safe cut of the
 * montage player. It plays ONE real-input clip (`ClipRun`: the key timeline → input →
 * rider → Rapier → tricks, the same steps `montage:verify` checks) live on the game's
 * renderer, filmed by the `CinematicDirector`, with the video HUD's lower-third, the
 * TWO FEET title card after the landing and a quiet skip hint. No recorder, no clip
 * list, no URL options: those stay in the dev-only montage player.
 */
export class CinematicIntro implements IntroPlayer {
  private readonly director: CinematicDirector;
  private playing: Playing | null = null;
  /** Bumped by `start` and `stop`: a start that was overtaken frees what it built. */
  private token = 0;
  private icon: HTMLImageElement | null = null;

  constructor(private readonly deps: CinematicIntroDeps) {
    this.director = new CinematicDirector(deps.presentation.camera, deps.cinematic);
  }

  async start(): Promise<void> {
    this.stop();
    const token = ++this.token;
    const { clip, config } = this.deps;
    const [run, icon] = await Promise.all([
      ClipRun.create(clip),
      this.loadIcon(),
      waitForFonts(config.fontTimeoutMs),
    ]);
    if (token !== this.token) {
      run.dispose(); // skipped (or stopped) while loading
      return;
    }
    this.deps.renderer.setup({ boardSpec: run.sim.spec, level: run.level });
    this.director.start(clip.shots);
    const card = config.titleCard;
    const hud = new VideoHud(this.deps.parent, this.deps.presentation, this.deps.cinematic, {
      pads: false,
      hint: config.skipHint,
      titleCard: { title: card.title, tagline: card.tagline, credit: card.credit, icon },
    });
    hud.startClip("", 0, 1);
    hud.model.trickCaption = config.trickCaption;
    this.playing = {
      run,
      hud,
      clock: new StepClock(run.stepS),
      videoS: 0,
      first: true,
      landed: false,
    };
  }

  advance(elapsedS: number): boolean {
    const p = this.playing;
    if (p === null) return false;
    const { clip, config, renderer, canvas } = this.deps;
    const dtS = p.first ? 0 : Math.min(config.maxFrameS, Math.max(0, elapsedS));
    p.first = false;
    p.videoS += dtS;
    const steps = p.clock.advance(dtS, timeScaleAt(clip, p.run.timeS));
    for (let i = 0; i < steps && !p.run.done; i += 1) p.run.step();
    const frame: RenderFrame = { ...p.run.sim.loop.buildFrame(), alpha: p.clock.alpha };
    const clipTimeS = p.run.timeS + p.clock.remainderS;
    const aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    const pose = this.director.update(frame, clipTimeS, dtS, aspect);
    renderer.setMontageOverrides(pose, dtS);
    renderer.render(frame);
    if (!p.landed && frame.recentEvents.some((e) => e.type === "TrickLanded")) {
      p.landed = true;
      p.hud.model.cueTitleCard(config.titleCard.delayS, config.titleCard.fadeInS);
    }
    p.hud.update(frame, dtS, fade(p.videoS, clipTimeS, clip.durationS, config));
    p.hud.drawOverlay(canvas);
    return p.run.done;
  }

  stop(): void {
    this.token += 1;
    const p = this.playing;
    this.playing = null;
    if (p === null) return;
    p.run.dispose();
    p.hud.dispose();
    this.deps.renderer.setMontageOverrides(null, null);
  }

  private async loadIcon(): Promise<HTMLImageElement | null> {
    if (this.icon !== null) return this.icon;
    const img = new Image();
    img.src = `${this.deps.baseUrl}${this.deps.config.titleCard.iconPath}`;
    try {
      await img.decode();
      this.icon = img;
      return img;
    } catch {
      return null; // the card just has no penguin
    }
  }
}

/** Black at the start (fading in) and at the end (fading out), 0–1. */
export function fade(
  videoS: number,
  clipS: number,
  durationS: number,
  config: IntroConfig,
): number {
  const fadeIn = config.fadeInS <= 0 ? 0 : 1 - videoS / config.fadeInS;
  const fadeOut = config.fadeOutS <= 0 ? 0 : 1 - (durationS - clipS) / config.fadeOutS;
  return Math.min(1, Math.max(0, fadeIn, fadeOut));
}

/** Waits for the title card's faces (they come from index.html's font link), or times out. */
async function waitForFonts(timeoutMs: number): Promise<void> {
  const faces = ["800 96px Inter", "600 14px Inter", "400 20px 'Space Mono'"];
  const loads = faces.map((f) => document.fonts.load(f).catch(() => []));
  await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, timeoutMs))]);
}
