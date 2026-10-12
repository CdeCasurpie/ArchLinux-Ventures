// Puerta de idle para trabajos pesados: solo arrancan sin captura activa.
const IDLE_MS = 4000;

class CaptureActivity {
  private recording = false;
  private tabActive = true;
  private lastTouch = 0;
  private waiters = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  setRecording(v: boolean) { this.recording = v; this.touch(); }
  setTabActive(v: boolean) { this.tabActive = v; }
  touch() { this.lastTouch = Date.now(); }

  isIdle(): boolean {
    if (!this.tabActive) return true;
    return !this.recording && Date.now() - this.lastTouch >= IDLE_MS;
  }

  whenIdle(): Promise<void> {
    if (this.isIdle()) return Promise.resolve();
    return new Promise(resolve => {
      this.waiters.add(resolve);
      if (!this.timer) this.timer = setTimeout(this.tick, 500);
    });
  }

  private tick = () => {
    this.timer = null;
    if (this.isIdle()) {
      const ws = [...this.waiters]; this.waiters.clear(); ws.forEach(r => r()); return;
    }
    this.timer = setTimeout(this.tick, 500);
  };
}

export const captureActivity = new CaptureActivity();
