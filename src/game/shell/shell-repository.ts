/** What the game shell remembers between launches (GAME.md "First launch"). */
export interface ShellRepository {
  loadTutorialDone(): boolean;
  saveTutorialDone(done: boolean): void;
  loadLastMap(): string | null;
  saveLastMap(id: string): void;
  /** Whether the opening cinematic has played (or been skipped) once (GAME.md "Intro"). */
  loadIntroSeen(): boolean;
  saveIntroSeen(seen: boolean): void;
}

/** In memory (tests, and the fallback when storage is missing). */
export class MemoryShellRepository implements ShellRepository {
  constructor(
    private tutorialDone = false,
    private lastMap: string | null = null,
    private introSeen = false,
  ) {}
  loadTutorialDone(): boolean {
    return this.tutorialDone;
  }
  saveTutorialDone(done: boolean): void {
    this.tutorialDone = done;
  }
  loadLastMap(): string | null {
    return this.lastMap;
  }
  saveLastMap(id: string): void {
    this.lastMap = id;
  }
  loadIntroSeen(): boolean {
    return this.introSeen;
  }
  saveIntroSeen(seen: boolean): void {
    this.introSeen = seen;
  }
}
