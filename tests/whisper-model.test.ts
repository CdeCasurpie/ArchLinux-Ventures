import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  files: new Map<string, { uri: string; size: number }>(),
  downloadSize: 31_000_000,
  downloads: 0,
  renameFails: false,
}));

vi.mock('@capacitor/filesystem', () => ({
  Directory: { Data: 'DATA' },
  Filesystem: {
    stat: async ({ path, directory }: any) => {
      const f = mocks.files.get(`${directory}|${path}`);
      if (!f) throw new Error('ENOENT');
      return { uri: f.uri, size: f.size };
    },
    downloadFile: async ({ path, directory }: any) => {
      mocks.downloads++;
      mocks.files.set(`${directory}|${path}`, { uri: `file:///mock/${path}`, size: mocks.downloadSize });
      return { path };
    },
    deleteFile: async ({ path, directory }: any) => {
      mocks.files.delete(`${directory}|${path}`);
    },
    rename: async ({ from, to, directory, toDirectory }: any) => {
      const fk = `${directory}|${from}`;
      const f = mocks.files.get(fk);
      if (!f) throw new Error('ENOENT');
      if (mocks.renameFails) throw new Error('EEXIST');
      mocks.files.delete(fk);
      mocks.files.set(`${toDirectory}|${to}`, { uri: `file:///mock/${to}`, size: f.size });
    },
  },
}));

vi.mock('capacitor-whisper', () => ({
  Whisper: {
    transcribe: async ({ path }: any) => {
      if (String(path).includes('fail')) throw new Error('decode fail');
      return { segments: [{ start: 0, end: 1, text: 'hola' }, { start: 1, end: 2, text: 'obra' }] };
    },
  },
}));

async function freshWhisper() {
  vi.resetModules();
  return import('../apps/client/src/features/whisper-service');
}

beforeEach(() => {
  mocks.files.clear();
  mocks.downloadSize = 31_000_000;
  mocks.downloads = 0;
  mocks.renameFails = false;
});

describe('whisper-service Fase 4', () => {
  it('modelo completo en disco se usa sin descargar', async () => {
    mocks.files.set('DATA|ggml-tiny-q5_1.bin', { uri: 'file:///mock/ggml-tiny-q5_1.bin', size: 31_000_000 });
    const w = await freshWhisper();
    expect(await w.getCachedWhisperModel()).toBe('/mock/ggml-tiny-q5_1.bin');
    expect(await w.ensureWhisperModel()).toEqual({ path: '/mock/ggml-tiny-q5_1.bin', cached: true });
    expect(mocks.downloads).toBe(0);
  });

  it('modelo truncado se trata como ausente', async () => {
    mocks.files.set('DATA|ggml-tiny-q5_1.bin', { uri: 'file:///mock/ggml-tiny-q5_1.bin', size: 5_000_000 });
    const w = await freshWhisper();
    expect(await w.getCachedWhisperModel()).toBeNull();
  });

  it('si se borran los pesos después de usarlos, comprueba el disco y los descarga de nuevo', async () => {
    const w=await freshWhisper();
    await w.ensureWhisperModel();
    mocks.files.delete('DATA|ggml-tiny-q5_1.bin');
    expect(await w.getCachedWhisperModel()).toBeNull();
    expect((await w.ensureWhisperModel()).cached).toBe(false);
    expect(mocks.downloads).toBe(2);
  });

  it('detecta pesos truncados después de un acierto previo y los recupera', async () => {
    const w=await freshWhisper();
    await w.ensureWhisperModel();
    mocks.files.set('DATA|ggml-tiny-q5_1.bin',{uri:'file:///mock/ggml-tiny-q5_1.bin',size:1000});
    expect((await w.ensureWhisperModel()).cached).toBe(false);
    expect(mocks.files.get('DATA|ggml-tiny-q5_1.bin')?.size).toBe(31_000_000);
    expect(mocks.downloads).toBe(2);
  });

  it('ausente devuelve null', async () => {
    const w = await freshWhisper();
    expect(await w.getCachedWhisperModel()).toBeNull();
  });

  it('descarga a .part, valida y publica; la segunda usa caché', async () => {
    const w = await freshWhisper();
    const r = await w.ensureWhisperModel();
    expect(r).toEqual({ path: '/mock/ggml-tiny-q5_1.bin', cached: false });
    expect(mocks.downloads).toBe(1);
    expect(mocks.files.has('DATA|ggml-tiny-q5_1.bin.part')).toBe(false);
    expect(mocks.files.get('DATA|ggml-tiny-q5_1.bin')?.size).toBe(31_000_000);
    expect(await w.ensureWhisperModel()).toEqual({ path: '/mock/ggml-tiny-q5_1.bin', cached: true });
    expect(mocks.downloads).toBe(1);
  });

  it('descarga truncada no se publica', async () => {
    mocks.downloadSize = 1_000_000;
    const w = await freshWhisper();
    await expect(w.ensureWhisperModel()).rejects.toThrow(/incompleto/);
    expect(mocks.files.has('DATA|ggml-tiny-q5_1.bin')).toBe(false);
  });

  it('llamadas concurrentes comparten una descarga', async () => {
    const w = await freshWhisper();
    const [a, b] = await Promise.all([w.ensureWhisperModel(), w.ensureWhisperModel()]);
    expect(mocks.downloads).toBe(1);
    expect(a.path).toBe(b.path);
  });

  it('si el rename falla se reintenta limpio en la siguiente llamada', async () => {
    mocks.renameFails = true;
    const w = await freshWhisper();
    await expect(w.ensureWhisperModel()).rejects.toThrow();
    mocks.renameFails = false;
    const r = await w.ensureWhisperModel();
    expect(r.cached).toBe(false);
    expect(mocks.files.has('DATA|ggml-tiny-q5_1.bin')).toBe(true);
  });

  it('transcribeAudio une segmentos y propaga errores', async () => {
    const w = await freshWhisper();
    expect(await w.transcribeAudio('/a.wav', '/mock/model.bin')).toBe('hola obra');
    await expect(w.transcribeAudio('/fail.wav', '/mock/model.bin')).rejects.toThrow(/decode fail/);
  });
});
