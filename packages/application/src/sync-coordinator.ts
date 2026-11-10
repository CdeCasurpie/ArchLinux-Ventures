export interface SyncTask { name: string; run(): Promise<void>; background?:boolean }
export interface SyncState { running: boolean; error: string | null; lastSuccess: string | null }

/** UI-independent orchestration. Own one instance per signed-in account. */
export class SyncCoordinator {
  private active: Promise<void> | null = null;
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private failures = 0;
  private requested=false;
  private background=new Map<string,Promise<void>>();
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
  /** A local edit/reconnection during a pass must not wait for the polling timer. */
  request():Promise<void>{if(this.active)this.requested=true;return this.run()}

  run(): Promise<void> {
    if (this.stopped || !this.connected()) return Promise.resolve();
    if (this.active) return this.active;
    clearTimeout(this.timer);
    this.publish({ running: true, error: null });
    this.active = this.perform().finally(() => {
      this.active = null;
      if (!this.stopped) {
        this.publish({ running: false });
        const delay = this.requested?0:this.failures ? Math.min(60_000, 1000 * 2 ** Math.min(this.failures, 6)) : 30_000;
        this.requested=false;
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
      if(task.background){
        if(!this.background.has(task.name)){
          const work=Promise.resolve().then(()=>{if(!this.stopped)return task.run()}).catch(error=>{
            if(!this.stopped)this.publish({error:`${task.name}: ${error instanceof Error?error.message:String(error)}`});
          }).finally(()=>this.background.delete(task.name));
          this.background.set(task.name,work);
        }
        continue;
      }
      try { await task.run(); }
      catch (error) { errors.push(`${task.name}: ${error instanceof Error ? error.message : String(error)}`); }
    }
    if (this.stopped) return;
    this.failures = errors.length ? this.failures + 1 : 0;
    this.publish(errors.length ? { error: errors.join('\n') } : { error: null, lastSuccess: new Date().toISOString() });
  }
}
