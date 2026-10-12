import 'fake-indexeddb/auto';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const net = vi.hoisted(() => ({
  connected: true,
  listener: null as null | ((s: { connected: boolean }) => void),
}));
vi.mock('@capacitor/network', () => ({
  Network: {
    getStatus: async () => ({ connected: net.connected }),
    addListener: async (_event: string, fn: (s: { connected: boolean }) => void) => {
      net.listener = fn;
      return { remove: () => undefined };
    },
  },
}));
vi.mock('@capacitor/app', () => ({ App: { addListener: async () => ({ remove: () => undefined }) } }));
vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {},
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
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false, convertFileSrc: (u: string) => `cap://${u}` },
}));

const store = vi.hoisted(() => ({
  groups: new Map<string, any>(),
  updated: [] as Array<[string, string]>,
  updatedStatus: [] as Array<[string, string, string?]>,
  runtime: new Map<string, string | null>(),
  notified: [] as string[],
  localChanges: 0,
}));
vi.mock('../apps/client/src/features/lab-storage', async importOriginal => ({
  ...(await importOriginal<typeof import('../apps/client/src/features/lab-storage')>()),
  loadAllGroups: async () => [...store.groups.values()],
  loadCaptureGroup: async (id: string) => store.groups.get(id) ?? null,
  updateCaptureGroupTranscription: async (id: string, text: string) => { store.updated.push([id, text]); },
  updateCaptureGroupTranscriptionStatus: async (id: string, s: string, e?: string) => { store.updatedStatus.push([id, s, e]); },
  setRuntimeTranscriptionStatus: (id: string, s: string | null) => { store.runtime.set(id, s); },
}));
vi.mock('../apps/client/src/features/media-sync', async importOriginal => ({
  ...(await importOriginal<typeof import('../apps/client/src/features/media-sync')>()),
  notifyLocalChange: () => { store.localChanges++; },
  notifyTranscriptionReady: async (outbox: unknown, id: string) => { store.notified.push(id); },
}));
const whisper = vi.hoisted(() => ({
  model: null as string | null,
  failEnsure: false,
  texts: new Map<string, string>(),
  calls: 0,
}));
vi.mock('../apps/client/src/features/whisper-service', () => ({
  getCachedWhisperModel: async () => whisper.model,
  ensureWhisperModel: async () => {
    if (whisper.failEnsure) throw new Error('sin red');
    whisper.model = '/mock/model.bin';
    return { path: whisper.model, cached: false };
  },
  transcribeAudio: async (path: string) => {
    whisper.calls++;
    await new Promise(r => setTimeout(r, 5)); // ocupa la cola serial
    if (!whisper.texts.has(path)) throw new Error('decode fail');
    return whisper.texts.get(path)!;
  },
}));

import { transcriptionService } from '../apps/client/src/features/transcription-service';

const g = (id: string, patch: any = {}) => ({
  id, transcripcion: undefined, transcripcionStatus: 'pending',
  audio: { id: `a-${id}`, path: `/audio/${id}.wav`, durationMs: 1000 },
  ...patch,
});
const flush = async (ms = 50) => { await new Promise(r => setTimeout(r, ms)); };

beforeEach(() => {
  store.groups.clear();
  store.updated.length = 0;
  store.updatedStatus.length = 0;
  store.runtime.clear();
  store.notified.length = 0;
  store.localChanges = 0;
  whisper.model = '/mock/model.bin';
  whisper.failEnsure = false;
  whisper.texts.clear();
  whisper.calls = 0;
  net.connected = true;
});

describe('transcription-service', () => {
  it('transcribe con modelo cacheado y notifica al terminar', async () => {
    store.groups.set('g-1', g('g-1'));
    whisper.texts.set('/audio/g-1.wav', 'hola obra');
    transcriptionService.enqueue('g-1');
    await flush();
    expect(store.updated).toEqual([['g-1', 'hola obra']]);
    expect(store.notified).toEqual(['g-1']);
    expect(store.runtime.get('g-1')).toBeNull();
  });

  it('omite lo ya transcripto, remoto o inexistente', async () => {
    store.groups.set('g-done', g('g-done', { transcripcion: 'x', transcripcionStatus: 'done' }));
    store.groups.set('g-rem', g('g-rem', { transcripcionStatus: 'remote' }));
    transcriptionService.enqueue('g-done');
    transcriptionService.enqueue('g-rem');
    transcriptionService.enqueue('g-missing');
    await flush();
    expect(whisper.calls).toBe(0);
    expect(store.updated).toEqual([]);
  });

  it('audio de más de 600 s termina en error sin llamar al plugin', async () => {
    store.groups.set('g-long', g('g-long', { audio: { id: 'a', path: '/a.wav', durationMs: 600_001 } }));
    transcriptionService.enqueue('g-long');
    await flush();
    expect(whisper.calls).toBe(0);
    expect(store.updatedStatus[0][0]).toBe('g-long');
    expect(store.updatedStatus[0][1]).toBe('error');
  });

  it('sin modelo y sin red espera, y reanuda al conectar', async () => {
    vi.useFakeTimers();
    try {
      transcriptionService.start();
      whisper.model = null;
      net.connected = false;
      store.groups.set('g-1', g('g-1'));
      transcriptionService.enqueue('g-1');
      await vi.advanceTimersByTimeAsync(100);
      expect(store.runtime.get('g-1')).toBe('waiting_model');
      expect(whisper.calls).toBe(0);
      net.connected = true;
      whisper.texts.set('/audio/g-1.wav', 'volvió la red');
      net.listener!({ connected: true });
      await vi.advanceTimersByTimeAsync(200);
      expect(store.updated).toEqual([['g-1', 'volvió la red']]);
      store.groups.clear(); // que el recover de start() (5s) no vea nada
      await vi.advanceTimersByTimeAsync(6000);
    } finally {
      vi.useRealTimers();
    }
  });

  it('recover reencola pendientes y transitorios, no done/remote/error', async () => {
    store.groups.set('g-p', g('g-p', { transcripcionStatus: 'pending' }));
    store.groups.set('g-t', g('g-t', { transcripcionStatus: 'transcribing' }));
    store.groups.set('g-d', g('g-d', { transcripcion: 'x', transcripcionStatus: 'done' }));
    store.groups.set('g-r', g('g-r', { transcripcionStatus: 'remote' }));
    store.groups.set('g-e', g('g-e', { transcripcionStatus: 'error' }));
    whisper.texts.set('/audio/g-p.wav', 'p');
    whisper.texts.set('/audio/g-t.wav', 't');
    await transcriptionService.recover();
    await flush(100);
    expect(store.updated.map(u => u[0]).sort()).toEqual(['g-p', 'g-t']);
  });

  it('doble enqueue del mismo grupo corre una sola vez', async () => {
    store.groups.set('g-1', g('g-1'));
    whisper.texts.set('/audio/g-1.wav', 'una vez');
    transcriptionService.enqueue('g-1');
    transcriptionService.enqueue('g-1');
    await flush(100);
    expect(whisper.calls).toBe(1);
  });
});
