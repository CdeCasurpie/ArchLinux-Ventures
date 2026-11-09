import { describe, expect, it } from 'vitest';
import { SerialAutosave, type SaveStatus } from '../apps/client/src/features/serial-autosave';

describe('serial autosave', () => {
  it('serializes writes and only confirms the latest edit', async () => {
    const writes: number[] = [];
    const states: SaveStatus[] = [];
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const writer = new SerialAutosave<number>(async value => {
      if (value === 1) await gate;
      writes.push(value);
    }, status => states.push(status));
    const first = writer.save(1);
    const second = writer.save(2);
    release();
    await Promise.all([first, second]);
    expect(writes).toEqual([1, 2]);
    expect(states).toEqual(['saving', 'saving', 'saved']);
  });

  it('does not confirm a failed write and retries the latest value', async () => {
    let fail = true;
    let stored = '';
    const states: SaveStatus[] = [];
    const writer = new SerialAutosave<string>(async value => {
      if (fail) throw new Error('disk full');
      stored = value;
    }, status => states.push(status));
    await writer.save('latest');
    await expect(writer.flush()).rejects.toThrow('No se pudo guardar');
    expect(states).toEqual(['saving', 'error']);
    fail = false;
    await writer.retry();
    await writer.flush();
    expect(stored).toBe('latest');
    expect(states.at(-1)).toBe('saved');
  });
});
