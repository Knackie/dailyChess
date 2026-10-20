/** Chronomètre simple basé sur performance.now(), avec pénalités de temps possibles. */
export class Timer {
  private startedAt: number | null = null;
  private stoppedAt: number | null = null;
  private penaltyMs = 0;
  private onTick: (elapsedMs: number) => void;
  private rafId: number | null = null;

  constructor(onTick: (elapsedMs: number) => void) {
    this.onTick = onTick;
  }

  start(): void {
    this.startedAt = performance.now();
    this.tick();
  }

  private tick = (): void => {
    if (this.startedAt === null || this.stoppedAt !== null) return;
    this.onTick(performance.now() - this.startedAt + this.penaltyMs);
    this.rafId = requestAnimationFrame(this.tick);
  };

  addPenalty(ms: number): void {
    this.penaltyMs += ms;
  }

  stop(): number {
    if (this.startedAt === null) return 0;
    this.stoppedAt = performance.now();
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    return this.stoppedAt - this.startedAt + this.penaltyMs;
  }
}

export function formatMs(ms: number): string {
  return (ms / 1000).toFixed(2) + "s";
}
