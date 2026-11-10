import { describe, expect, it, vi } from 'vitest';
import { SyncCoordinator, type SyncState } from '@archforms/application';

describe('sync coordinator', () => {
  it('does not block new data passes behind a large file transfer',async()=>{
    let finish!:()=>void;
    const gate=new Promise<void>(resolve=>{finish=resolve});
    const data=vi.fn(async()=>{}),files=vi.fn(async()=>gate);
    const coordinator=new SyncCoordinator([{name:'data',run:data},{name:'files',background:true,run:files}],()=>true);
    await coordinator.run();await coordinator.run();
    expect(data).toHaveBeenCalledTimes(2);expect(files).toHaveBeenCalledTimes(1);
    finish();coordinator.stop();
  });
  it('does not lose a reconnection/local-edit request arriving during an active pass',async()=>{
    vi.useFakeTimers();
    let release!:()=>void;
    const gate=new Promise<void>(resolve=>{release=resolve});
    const task=vi.fn(async()=>{await gate});
    const coordinator=new SyncCoordinator([{name:'data',run:task}],()=>true);
    const first=coordinator.run();
    void coordinator.request();
    release();await first;
    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(2);
    coordinator.stop();vi.useRealTimers();
  });
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
