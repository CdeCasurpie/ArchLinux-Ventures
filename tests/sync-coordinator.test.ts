import { describe, expect, it, vi } from 'vitest';
import { SyncCoordinator, type SyncState } from '@archforms/application';

describe('sync coordinator', () => {
  it('does not run offline and retries while active', async () => {
    vi.useFakeTimers();
    let online = false;
    const run = vi.fn().mockRejectedValueOnce(new Error('unreachable')).mockResolvedValue(undefined);
    const coordinator = new SyncCoordinator([{ name: 'data', run }], () => online);
    const states: SyncState[] = [];
    coordinator.subscribe(state => states.push(state));
    await coordinator.run();
    expect(run).not.toHaveBeenCalled();
    online = true;
    await coordinator.run();
    expect(states.at(-1)?.error).toContain('unreachable');
    await vi.advanceTimersByTimeAsync(2000);
    expect(run).toHaveBeenCalledTimes(2);
    expect(states.at(-1)?.lastSuccess).not.toBeNull();
    coordinator.stop();
    await vi.advanceTimersByTimeAsync(60000);
    expect(run).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
  it('coalesces concurrent requests and continues independent lanes after errors', async () => {
    const run = vi.fn(async () => { throw new Error('blocked'); });
    const independent = vi.fn(async () => {});
    const coordinator = new SyncCoordinator([{ name:'workspace',run }, { name:'profile',run:independent }],()=>true);
    await Promise.all([coordinator.run(),coordinator.run()]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(independent).toHaveBeenCalledTimes(1);
    coordinator.stop();
  });
});
