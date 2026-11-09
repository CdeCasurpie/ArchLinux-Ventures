export interface SyncTask { name: string; run(): Promise<void> }
export interface SyncState { running: boolean; error: string | null; lastSuccess: string | null }

/** UI-independent orchestration. Own one instance per signed-in account. */
export class SyncCoordinator {
  private active: Promise<void> | null = null;
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private failures = 0;
  private listeners = new Set<(state: SyncState) => void>();
  private state: SyncState = { running: false, error: null, lastSuccess: null };

  constructor(private readonly tasks: SyncTask[], private readonly connected: () => boolean) {}

  subscribe(listener: (state: SyncState) => void) {
    this.listeners.add(listener);
    listener(this.state);
    return () => { this.listeners.delete(listener); };
  }

  private publish(next: Partial<SyncState>) {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener(this.state);
  }

  start() { this.stopped = false; void this.run(); }
  stop() { this.stopped = true; clearTimeout(this.timer); }

  run(): Promise<void> {
    if (this.stopped || !this.connected()) return Promise.resolve();
    if (this.active) return this.active;
    clearTimeout(this.timer);
    this.publish({ running: true, error: null });
    this.active = this.perform().finally(() => {
      this.active = null;
      if (!this.stopped) {
        this.publish({ running: false });
        const delay = this.failures ? Math.min(60_000, 1000 * 2 ** Math.min(this.failures, 6)) : 30_000;
        this.timer = setTimeout(() => { void this.run(); }, delay);
      }
    });
    return this.active;
  }

  private async perform() {
    const errors: string[] = [];
    // Ordered lanes: workspace parents must exist before uploading media records.
    // A failed lane does not suppress independent tasks.
    for (const task of this.tasks) {
      if (this.stopped) return;
      try { await task.run(); }
      catch (error) { errors.push(`${task.name}: ${error instanceof Error ? error.message : String(error)}`); }
    }
    if (this.stopped) return;
    this.failures = errors.length ? this.failures + 1 : 0;
    this.publish(errors.length ? { error: errors.join('\n') } : { error: null, lastSuccess: new Date().toISOString() });
  }
}
