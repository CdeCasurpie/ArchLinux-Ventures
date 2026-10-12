import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { CaptureGroup, LabPhoto, AudioClip } from '../apps/client/src/features/lab-storage';

const mocks = vi.hoisted(() => ({
  fs: new Map<string, string>(),
  prefs: new Map<string, string>(),
  writes: [] as string[],
  native: true,
  renameFailsOnExisting: false,
  fetchBytes: new Map<string, Uint8Array>(),
}));

vi.mock('@capacitor/filesystem', () => ({
  Directory: { Data: 'DATA', Documents: 'DOCS' },
  Encoding: { UTF8: 'utf8' },
  Filesystem: {
    writeFile: async ({ path, data, directory }: any) => {
      mocks.writes.push(`${directory}|${path}`);
      mocks.fs.set(`${directory}|${path}`, data);
    },
    readFile: async ({ path, directory }: any) => {
      const v = mocks.fs.get(`${directory}|${path}`);
      if (v === undefined) throw new Error(`ENOENT ${path}`);
      return { data: v };
    },
    stat: async ({ path, directory }: any) => {
      if (!mocks.fs.has(`${directory}|${path}`)) throw new Error('ENOENT');
      return { uri: `file:///mock/${path}`, size: 1 };
    },
    mkdir: async () => undefined,
    readdir: async ({ path, directory }: any) => {
      const prefix = `${directory}|${path}/`;
      const names = new Map<string, 'file' | 'directory'>();
      for (const k of mocks.fs.keys()) {
        if (!k.startsWith(prefix)) continue;
        const rest = k.slice(prefix.length);
        const slash = rest.indexOf('/');
        if (slash < 0) names.set(rest, 'file');
        else if (!names.has(rest.slice(0, slash))) names.set(rest.slice(0, slash), 'directory');
      }
      return { files: [...names].map(([name, type]) => ({ name, type })) };
    },
    rename: async ({ from, to, directory }: any) => {
      const fk = `${directory}|${from}`, tk = `${directory}|${to}`;
      if (!mocks.fs.has(fk)) throw new Error('ENOENT from');
      if (mocks.renameFailsOnExisting && mocks.fs.has(tk)) throw new Error('EEXIST');
      mocks.fs.set(tk, mocks.fs.get(fk)!);
      mocks.fs.delete(fk);
    },
    deleteFile: async ({ path, directory }: any) => {
      mocks.fs.delete(`${directory}|${path}`);
    },
    copy: async ({ from, to, toDirectory }: any) => {
      const src = String(from).replace(/^file:\/\//, '');
      const hit = [...mocks.fs.entries()].find(([k]) => k.endsWith(src));
      if (!hit) throw new Error(`ENOENT copy ${from}`);
      mocks.fs.set(`${toDirectory}|${to}`, hit[1]);
    },
    getUri: async ({ path }: any) => ({ uri: `file:///mock/${path}` }),
  },
}));

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }: any) => ({ value: mocks.prefs.has(key) ? mocks.prefs.get(key)! : null }),
    set: async ({ key, value }: any) => { mocks.prefs.set(key, value); },
    remove: async ({ key }: any) => { mocks.prefs.delete(key); },
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => mocks.native,
    convertFileSrc: (u: string) => `cap://${u}`,
  },
}));

async function freshLab() {
  vi.resetModules();
  return import('../apps/client/src/features/lab-storage');
}

beforeEach(() => {
  mocks.fs.clear();
  mocks.prefs.clear();
  mocks.writes.length = 0;
  mocks.native = true;
  mocks.renameFailsOnExisting = false;
  mocks.fetchBytes.clear();
  vi.stubGlobal('fetch', async (url: string) => ({
    arrayBuffer: async () => {
      const b = mocks.fetchBytes.get(String(url)) ?? new Uint8Array(0);
      return new Uint8Array(b).buffer;
    },
  }) as any);
});
afterEach(() => { vi.unstubAllGlobals(); });

const photo = (id: string, displayUrl = `data:image/jpeg;base64,${'A'.repeat(100)}`): LabPhoto => ({
  id, path: `archforms-lab/photos/${id}.jpg`, mimeType: 'image/jpeg', features: [],
  sizeBytes: 75, checksum: `sha-${id}`, createdAt: '2026-10-11T00:00:00.000Z', displayUrl,
});
const audio = (id = 'a-1'): AudioClip => ({
  id, path: `file:///rec/${id}.wav`, mimeType: 'audio/wav', durationMs: 1000,
  sizeBytes: 32000, checksum: `sha-${id}`, createdAt: '2026-10-11T00:00:00.000Z',
  displayUrl: `cap://file:///rec/${id}.wav`,
});
const groupFile = (visita: string, id: string) => `DATA|archforms-lab/groups/${visita}/${id}.json`;

describe('lab-storage Fase 1', () => {
  it('persiste JSON de KB sin base64 y lo hidrata con URLs de archivo', async () => {
    const lab = await freshLab();
    const g = lab.createCaptureGroup('v-1', [photo('p-1'), photo('p-2')], audio());
    await lab.persistCaptureGroup(g);
    const raw = mocks.fs.get(groupFile('v-1', g.id))!;
    expect(raw).toBeDefined();
    expect(raw).not.toContain('data:');
    expect(raw.length).toBeLessThan(2000);
    expect(JSON.parse(raw).schemaVersion).toBe(2);
    const [loadedMem] = await lab.loadCaptureGroups('v-1');
    expect(loadedMem.id).toBe(g.id);
    // En memoria se devuelve el objeto tal cual se registró.
    expect(loadedMem.photos[0].displayUrl).toContain('data:image/jpeg;base64,');
    // Desde disco se hidrata con URLs de archivo.
    const labDisk = await freshLab();
    const [loaded] = await labDisk.loadCaptureGroups('v-1');
    expect(loaded.id).toBe(g.id);
    expect(loaded.photos[0].displayUrl).toBe('cap://file:///mock/archforms-lab/photos/p-1.jpg');
    expect(loaded.audio.displayUrl).toBe('cap://file:///rec/a-1.wav');
  });

  it('coalesce: 10 mutaciones seguidas producen pocas escrituras y el estado final', async () => {
    const lab = await freshLab();
    const g = lab.createCaptureGroup('v-1', [photo('p-1')], audio());
    await lab.persistCaptureGroup(g);
    mocks.writes.length = 0;
    const states: Array<CaptureGroup['syncStatus']> = ['uploading', 'pending', 'uploading', 'pending', 'uploading', 'pending', 'uploading', 'pending', 'uploading', 'synced'];
    await Promise.all(states.map(s => lab.updateCaptureGroupSyncStatus(g.id, s)));
    const groupWrites = mocks.writes.filter(w => w === groupFile('v-1', g.id));
    expect(groupWrites.length).toBeLessThanOrEqual(2);
    expect((await lab.loadCaptureGroup(g.id))?.syncStatus).toBe('synced');
  });

  it('mismo valor no escribe', async () => {
    const lab = await freshLab();
    const g = lab.createCaptureGroup('v-1', [], audio());
    await lab.persistCaptureGroup(g);
    mocks.writes.length = 0;
    await lab.updateCaptureGroupSyncStatus(g.id, 'pending');
    expect(mocks.writes.filter(w => w === groupFile('v-1', g.id))).toEqual([]);
  });

  it('writeJsonAtomic con rename que falla usa delete+rename', async () => {
    const lab = await freshLab();
    const g = lab.createCaptureGroup('v-1', [], audio());
    await lab.persistCaptureGroup(g);
    mocks.renameFailsOnExisting = true;
    await lab.updateCaptureGroupSyncStatus(g.id, 'synced');
    // persist es en background: esperar a que el contenido llegue al archivo final.
    let raw = '';
    for (let i = 0; i < 100; i++) {
      raw = mocks.fs.get(groupFile('v-1', g.id)) ?? '';
      if (raw.includes('"synced"')) break;
      await new Promise(r => setTimeout(r, 10));
    }
    expect(raw).toContain('"synced"');
    expect([...mocks.fs.keys()].some(k => k.endsWith('.tmp'))).toBe(false);
    const lab2 = await freshLab();
    expect((await lab2.loadCaptureGroup(g.id))?.syncStatus).toBe('synced');
  });

  it('readJson lee el .tmp si falta el principal', async () => {
    const lab = await freshLab();
    const g = lab.createCaptureGroup('v-9', [], audio());
    await lab.persistCaptureGroup(g);
    // Simula corte entre tmp y rename: solo queda el .tmp.
    const key = groupFile('v-9', g.id);
    mocks.fs.set(`${key}.tmp`, mocks.fs.get(key)!);
    mocks.fs.delete(key);
    const lab2 = await freshLab();
    // El módulo fresco no tiene nada en memoria: debe leer el .tmp del FS.
    expect((await lab2.loadCaptureGroup(g.id))?.id).toBe(g.id);
  });

  it('migración: recupera archivos, escribe KB, verifica, limpia y es idempotente', async () => {
    const b64 = Buffer.from('hola-foto').toString('base64');
    const legacy = [
      {
        id: 'g-old', visitaId: 'v-1', createdAt: '2026-09-01T00:00:00.000Z',
        photos: [{ id: 'p-old', path: 'archforms-lab/photos/p-old.jpg', mimeType: 'image/jpeg', features: [{ x: 1, y: 2, descriptor: 'ab' }], sizeBytes: 9, checksum: 'sha', createdAt: '2026-09-01T00:00:00.000Z', displayUrl: `data:image/jpeg;base64,${b64}` }],
        audio: { id: 'a-old', path: 'archforms-lab/audio/a-old.wav', mimeType: 'audio/wav', durationMs: 500, sizeBytes: 9, checksum: 'sha', createdAt: '2026-09-01T00:00:00.000Z', displayUrl: `data:audio/wav;base64,${b64}` },
        transcripcion: 'texto viejo', transcripcionStatus: 'done',
      },
      {
        id: 'g-nosync', visitaId: 'v-1', createdAt: '2026-09-02T00:00:00.000Z',
        photos: [], audio: { id: 'a-2', path: 'archforms-lab/audio/a-2.wav', mimeType: 'audio/wav', durationMs: 100, sizeBytes: 1, checksum: '', createdAt: '2026-09-02T00:00:00.000Z', displayUrl: '' },
      },
    ];
    mocks.prefs.set('archforms-lab-groups-v1', JSON.stringify(legacy));
    const lab = await freshLab();
    const groups = await lab.loadCaptureGroups('v-1');
    expect(groups.map(g => g.id).sort()).toEqual(['g-nosync', 'g-old']);
    // Archivo recuperado desde el data URL.
    expect(mocks.fs.get('DATA|archforms-lab/photos/p-old.jpg')).toBe(b64);
    // Sin syncStatus legacy → pending por defecto.
    expect(groups.find(g => g.id === 'g-nosync')?.syncStatus).toBe('pending');
    // Limpieza y marca.
    expect(mocks.prefs.has('archforms-lab-groups-v1')).toBe(false);
    expect(mocks.prefs.get('archforms-lab-groups-migrated-v2')).toBe('done');
    expect(mocks.fs.has('DATA|archforms-lab/backup/groups-v1.json')).toBe(true);
    expect(mocks.fs.get('DATA|archforms-lab/features/p-old.json')).toContain('ab');
    // Idempotente: segundo arranque no reescribe nada.
    mocks.writes.length = 0;
    const lab2 = await freshLab();
    expect((await lab2.loadCaptureGroups('v-1')).length).toBe(2);
    expect(mocks.writes.filter(w => w.includes('/groups/')).length).toBe(0);
  });

  it('GROUP_KEY corrupto: no borra nada ni marca migración', async () => {
    mocks.prefs.set('archforms-lab-groups-v1', '[[[no-json');
    const lab = await freshLab();
    expect(await lab.loadCaptureGroups('v-1')).toEqual([]);
    expect(mocks.prefs.has('archforms-lab-groups-v1')).toBe(true);
    expect(mocks.prefs.has('archforms-lab-groups-migrated-v2')).toBe(false);
  });

  it('drafts con orden reciente-primero y filtro de ya-agrupadas', async () => {
    const lab = await freshLab();
    lab.addDraftPhoto('v-1', { id: 'p-1', path: 'archforms-lab/photos/p-1.jpg', mimeType: 'image/jpeg', sizeBytes: 1, checksum: 'a', createdAt: '2026-10-11T00:00:01.000Z' });
    lab.addDraftPhoto('v-1', { id: 'p-2', path: 'archforms-lab/photos/p-2.jpg', mimeType: 'image/jpeg', sizeBytes: 1, checksum: 'b', createdAt: '2026-10-11T00:00:02.000Z' });
    let draft = await lab.loadDraftPhotos('v-1');
    expect(draft.map(p => p.id)).toEqual(['p-2', 'p-1']);
    const g = lab.createCaptureGroup('v-1', [photo('p-2')], audio());
    await lab.persistCaptureGroup(g);
    lab.removeDraftPhotos('v-1', ['p-2']);
    draft = await lab.loadDraftPhotos('v-1');
    expect(draft.map(p => p.id)).toEqual(['p-1']);
  });

  it('overlay de transcripción no se persiste', async () => {
    const lab = await freshLab();
    const g = lab.createCaptureGroup('v-1', [], audio());
    await lab.persistCaptureGroup(g);
    lab.setRuntimeTranscriptionStatus(g.id, 'transcribing');
    expect((await lab.loadCaptureGroup(g.id))?.transcripcionStatus).toBe('transcribing');
    const raw = JSON.parse(mocks.fs.get(groupFile('v-1', g.id))!);
    expect(raw.transcripcionStatus).toBe('pending');
    lab.setRuntimeTranscriptionStatus(g.id, null);
    expect((await lab.loadCaptureGroup(g.id))?.transcripcionStatus).toBe('pending');
  });

  it('checksum de audio parchea memoria y disco + commit espera a disco', async () => {
    const lab = await freshLab();
    const g = lab.createCaptureGroup('v-1', [photo('p-1')], audio());
    lab.registerGroupInMemory(g);
    expect((await lab.loadCaptureGroup(g.id))?.id).toBe(g.id);
    expect(mocks.fs.has(groupFile('v-1', g.id))).toBe(false);
    await lab.updateAudioClipChecksum(g.audio.id, { checksum: 'sha-real', sizeBytes: 99 });
    await lab.commitGroupPhotos(g.id, [photo('p-1')]);
    const loaded = (await lab.loadCaptureGroup(g.id))!;
    expect(loaded.audio.checksum).toBe('sha-real');
    expect(loaded.audio.sizeBytes).toBe(99);
    expect(JSON.parse(mocks.fs.get(groupFile('v-1', g.id))!).audio.checksum).toBe('sha-real');
  });

  it('upsert remoto hidrata URLs sin displayUrl persistido', async () => {
    const lab = await freshLab();
    const g = await lab.upsertRemoteGroup({
      id: 'g-rem', visitaId: 'v-1',
      photos: [{ id: 'p-r', path: 'archforms-lab/photos/p-r.jpg', mimeType: 'image/jpeg', features: [], sizeBytes: 10, checksum: 's', createdAt: '2026-10-01T00:00:00.000Z' }],
      audio: { id: 'a-r', path: 'archforms-lab/audio/a-r.wav', mimeType: 'audio/wav', durationMs: 100, sizeBytes: 10, checksum: 's', createdAt: '2026-10-01T00:00:00.000Z' },
      transcripcion: 'hola', iniciadoAt: '2026-10-01T00:00:00.000Z',
    });
    expect(g.syncStatus).toBe('synced');
    expect(g.photos[0].displayUrl).toContain('cap://');
    expect(mocks.fs.get(groupFile('v-1', 'g-rem'))!).not.toContain('cap://');
  });

  it('photoDataUrl resuelve dataURL desde el archivo', async () => {
    const lab = await freshLab();
    mocks.fs.set('DATA|archforms-lab/photos/p-x.jpg', Buffer.from('bytes-foto').toString('base64'));
    expect(await lab.photoDataUrl('archforms-lab/photos/p-x.jpg', 'image/jpeg'))
      .toBe(`data:image/jpeg;base64,${Buffer.from('bytes-foto').toString('base64')}`);
  });

  it('miniatura: escribe thumb, lo anota y lo hidrata; sin soporte no hace nada', async () => {
    const lab = await freshLab();
    mocks.fs.set('DATA|archforms-lab/photos/p-t.jpg', Buffer.from('foto-grande').toString('base64'));
    (globalThis as any).createImageBitmap = async () => ({ width: 320, height: 200, close: () => undefined });
    (globalThis as any).OffscreenCanvas = class {
      width: number; height: number;
      constructor(w: number, h: number) { this.width = w; this.height = h; }
      getContext() { return { drawImage: () => undefined }; }
      async convertToBlob() { return new Blob(['thumb-bytes']); }
    };
    try {
      const g = lab.createCaptureGroup('v-1', [], audio());
      await lab.persistCaptureGroup(g);
      const t = await lab.writePhotoThumbnail('p-t', 'image/jpeg');
      expect(t).toBe('archforms-lab/photos/p-t.thumb.jpg');
      expect(mocks.fs.has('DATA|archforms-lab/photos/p-t.thumb.jpg')).toBe(true);
      await lab.setPhotoThumbUrl('p-t', t!);
      // En memoria se guarda la ruta; hidratada es URL de archivo.
      const g2 = lab.createCaptureGroup('v-1', [{
        id: 'p-t', path: 'archforms-lab/photos/p-t.jpg', mimeType: 'image/jpeg', features: [],
        sizeBytes: 1, checksum: 's', createdAt: '2026-10-11T00:00:00.000Z', displayUrl: '',
      }], audio());
      await lab.persistCaptureGroup(g2);
      await lab.setPhotoThumbUrl('p-t', t!);
      for (let i = 0; i < 100; i++) {
        if ((mocks.fs.get(`DATA|archforms-lab/groups/v-1/${g2.id}.json`) ?? '').includes('thumb')) break;
        await new Promise(r => setTimeout(r, 10));
      }
      const lab2 = await freshLab();
      const found = (await lab2.loadCaptureGroups('v-1')).find(x => x.id === g2.id)!;
      expect(found.photos[0].thumbUrl).toContain('cap://');
    } finally {
      delete (globalThis as any).createImageBitmap;
      delete (globalThis as any).OffscreenCanvas;
    }
    const lab3 = await freshLab();
    expect(await lab3.writePhotoThumbnail('p-t', 'image/jpeg')).toBeNull();
  });

  it('extractPhotoFeatures apagado no escribe nada', async () => {
    const lab = await freshLab();
    await lab.extractPhotoFeatures('p-x', 'cap://whatever');
    expect(mocks.fs.has('DATA|archforms-lab/features/p-x.json')).toBe(false);
  });

  it('ingest mueve, mide y anota en el draft', async () => {
    const lab = await freshLab();
    mocks.fs.set('DATA|/cache/tmp.jpg', Buffer.from('hello').toString('base64'));
    mocks.fetchBytes.set('cap://file:///cache/tmp.jpg', new Uint8Array([104, 101, 108, 108, 111]));
    const r = await lab.ingestCapturedPhoto({ id: 'p-n', tmpUri: 'file:///cache/tmp.jpg', visitaId: 'v-1', createdAt: '2026-10-11T00:00:00.000Z' });
    expect(r.sizeBytes).toBe(5);
    expect(r.checksum).toMatch(/^[0-9a-f]{64}$/);
    expect(mocks.fs.get('DATA|archforms-lab/photos/p-n.jpg')).toBe(Buffer.from('hello').toString('base64'));
    const draft = await lab.loadDraftPhotos('v-1');
    expect(draft.map(p => p.id)).toEqual(['p-n']);
    expect(draft[0].checksum).toBe(r.checksum);
  });

  it('loadCaptureGroups ordena ascendente y el miss carga todo', async () => {
    const lab = await freshLab();
    const g1 = { ...lab.createCaptureGroup('v-1', [], audio()), createdAt: '2026-10-11T00:00:02.000Z' };
    const g2 = { ...lab.createCaptureGroup('v-1', [], audio()), createdAt: '2026-10-11T00:00:01.000Z' };
    await lab.persistCaptureGroup(g1);
    await lab.persistCaptureGroup(g2);
    expect((await lab.loadCaptureGroups('v-1')).map(g => g.id)).toEqual([g2.id, g1.id]);
    const lab2 = await freshLab();
    expect((await lab2.loadCaptureGroup(g1.id))?.id).toBe(g1.id);
  });

  it('transcripción fija done y limpia el error', async () => {
    const lab = await freshLab();
    const g = lab.createCaptureGroup('v-1', [], audio());
    await lab.persistCaptureGroup(g);
    await lab.updateCaptureGroupTranscriptionStatus(g.id, 'error', 'boom');
    await lab.updateCaptureGroupTranscription(g.id, 'texto');
    const loaded = (await lab.loadCaptureGroup(g.id))!;
    expect(loaded.transcripcion).toBe('texto');
    expect(loaded.transcripcionStatus).toBe('done');
    expect(loaded.transcripcionError).toBeUndefined();
  });
});
