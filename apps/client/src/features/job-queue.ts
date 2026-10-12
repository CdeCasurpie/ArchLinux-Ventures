import { captureActivity } from './activity';

export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(readonly name: string, private gate?: () => Promise<void>) {}
  enqueue<T>(label: string, job: () => Promise<T>): Promise<T> {
    void label;
    const run = async () => { if (this.gate) await this.gate(); return job(); };
    const p = this.tail.then(run);
    this.tail = p.catch(() => undefined); // un fallo no rompe la cadena
    return p; // el llamador decide cómo manejar el rechazo
  }
}

export const diskQueue = new SerialQueue('disk');
export const idleQueue = new SerialQueue('idle', () => captureActivity.whenIdle());
export const transcribeQueue = new SerialQueue('transcribe', () => captureActivity.whenIdle());
