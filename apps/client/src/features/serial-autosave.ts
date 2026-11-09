export type SaveStatus = 'saved' | 'saving' | 'error';

/** One writer per form. A late acknowledgement cannot mark a newer edit saved. */
export class SerialAutosave<T> {
  private tail: Promise<void> = Promise.resolve();
  private revision = 0;
  private latest: T | undefined;
  private failed = false;

  constructor(
    private readonly persist: (value: T) => Promise<void>,
    private readonly notify: (status: SaveStatus) => void,
  ) {}

  save(value: T): Promise<void> {
    this.latest = value;
    const revision = ++this.revision;
    this.notify('saving');
    const task = this.tail.then(() => this.persist(value));
    this.tail = task.then(() => {
      if (revision !== this.revision) return;
      this.failed = false;
      this.notify('saved');
    }, () => {
      if (revision !== this.revision) return;
      this.failed = true;
      this.notify('error');
    });
    return this.tail;
  }

  retry(): Promise<void> {
    return this.latest === undefined ? Promise.resolve() : this.save(this.latest);
  }

  async flush(): Promise<void> {
    await this.tail;
    if (this.failed) throw new Error('No se pudo guardar. Reintenta antes de salir.');
  }
}
