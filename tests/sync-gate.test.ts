import 'fake-indexeddb/auto';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { captureActivity } from '../apps/client/src/features/activity';
import { SerialQueue } from '../apps/client/src/features/job-queue';

vi.mock('@capacitor/network', () => ({ Network: { addListener: async () => ({ remove: () => undefined }) } }));
vi.mock('@capacitor/app', () => ({ App: { addListener: async () => ({ remove: () => undefined }) } }));
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {
    getUri: async ({ path }: any) => ({ uri: `file:///mock/${path}` }),
    readFile: async () => { throw new Error('ENOENT'); },
  },
  Directory: { Data: 'DATA', Documents: 'DOCS' },
  Encoding: { UTF8: 'utf8' },
}));
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async () => ({ value: null }),
    set: async () => undefined,
    remove: async () => undefined,
  },
}));

import { MediaSyncManager, enqueueGroupToOutbox } from '../apps/client/src/features/media-sync';
import type { MediaOutboxRepository } from '@archforms/application';

const noopOutbox = (): MediaOutboxRepository => ({
  pendingMedia: async () => [], pendingEntities: async () => [],
  markMediaUploading: async () => undefined, markMediaSynced: async () => undefined,
  markMediaError: async () => undefined, markEntitySyncing: async () => undefined,
  markEntitySynced: async () => undefined, markEntityError: async () => undefined,
  mediaStatus: async () => null, entityStatus: async () => null,
  forceRetry: async () => undefined, enqueueMedia: async () => undefined,
  enqueueEntity: async () => undefined, collectGarbage: async () => [],
  resetStuck: async () => undefined,
});

describe('activity gate (Fase 2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    captureActivity.setRecording(false);
    captureActivity.setTabActive(true);
    vi.advanceTimersByTime(5000);
  });
  afterEach(() => {
    vi.useRealTimers();
    captureActivity.setRecording(false);
    captureActivity.setTabActive(true);
  });

  it('idle por defecto, ocupado grabando o tocando', () => {
    expect(captureActivity.isIdle()).toBe(true);
    captureActivity.setRecording(true);
    expect(captureActivity.isIdle()).toBe(false);
    captureActivity.setRecording(false);
    captureActivity.touch();
    expect(captureActivity.isIdle()).toBe(false);
  });

  it('pestaña oculta siempre es idle', () => {
    captureActivity.setRecording(true);
    captureActivity.setTabActive(false);
    expect(captureActivity.isIdle()).toBe(true);
  });

  it('whenIdle espera hasta los 4s sin actividad', async () => {
    captureActivity.touch();
    let done = false;
    const p = captureActivity.whenIdle().then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(3999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    await p;
    expect(done).toBe(true);
  });

  it('SerialQueue respeta orden y un fallo no rompe la cadena', async () => {
    const q = new SerialQueue('t');
    const order: number[] = [];
    const p1 = q.enqueue('a', async () => { order.push(1); });
    const p2 = q.enqueue('b', async () => { order.push(2); throw new Error('x'); }).catch(() => 'caught');
    const p3 = q.enqueue('c', async () => { order.push(3); });
    await Promise.all([p1, p2, p3]);
    expect(order).toEqual([1, 2, 3]);
  });

  it('SerialQueue con gate espera al idle', async () => {
    const q = new SerialQueue('g', () => captureActivity.whenIdle());
    captureActivity.touch();
    let ran = false;
    const p = q.enqueue('j', async () => { ran = true; });
    await vi.advanceTimersByTimeAsync(1000);
    expect(ran).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    await p;
    expect(ran).toBe(true);
  });
});

describe('sync con gate (Fase 2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    captureActivity.setRecording(false);
    captureActivity.setTabActive(true);
    vi.advanceTimersByTime(5000);
  });
  afterEach(() => {
    vi.useRealTimers();
    captureActivity.setRecording(false);
    captureActivity.setTabActive(true);
  });

  it('manager.sync espera al idle mientras se graba', async () => {
    const manager = new MediaSyncManager(noopOutbox(), 'owner-1');
    captureActivity.setRecording(true);
    let done = false;
    const p = manager.sync().then(() => { done = true; });
    await vi.advanceTimersByTimeAsync(2000);
    expect(done).toBe(false);
    captureActivity.setRecording(false);
    await vi.advanceTimersByTimeAsync(5000);
    await p;
    expect(done).toBe(true);
    expect(manager.lastRun?.error).toBeNull();
  });

  it('enqueueGroupToOutbox rechaza foto sin checksum', async () => {
    const group: any = {
      id: 'g-1', visitaId: 'v-1', createdAt: '2026-10-11T00:00:00.000Z',
      photos: [{ id: 'p-1', path: 'x', mimeType: 'image/jpeg', features: [], sizeBytes: 0, checksum: '', createdAt: '2026-10-11T00:00:00.000Z', displayUrl: '' }],
      audio: { id: 'a-1', path: 'y', mimeType: 'audio/wav', durationMs: 1, sizeBytes: 1, checksum: 's', createdAt: '2026-10-11T00:00:00.000Z', displayUrl: '' },
    };
    await expect(enqueueGroupToOutbox(noopOutbox(), group, 'owner-1')).rejects.toThrow(/sin checksum/);
  });
});
