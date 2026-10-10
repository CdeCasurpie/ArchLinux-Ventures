import { Network } from '@capacitor/network'
import { App } from '@capacitor/app'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { supabase } from '../platform'
import type { GrupoCapturaPayload } from '@archforms/domain'
import { MediaSyncEngine, exponentialBackoff, planCapturePull } from '@archforms/application'
import type { MediaOutboxRepository, MediaRemoteRepository, CaptureRemoteReader, LocalCaptureSnapshot } from '@archforms/application'
import {
  loadCaptureGroups,
  loadCaptureGroup,
  updateCaptureGroupSyncStatus,
  upsertRemoteGroup,
  type CaptureGroup,
  type LabPhoto,
  type AudioClip,
} from './lab-storage'
import { Preferences } from '@capacitor/preferences'

// ── Supabase Media Remote ────────────────────────────────────────────────────
// Usa el bucket congelado en la Iteración 1 (`visita-media`, privado).
// Su RLS exige que la primera carpeta del path sea el auth.uid(),
// de ahí la convención {ownerId}/{visitaId}/{mediaId}.
const MEDIA_BUCKET = 'visita-media';

class SupabaseMediaRemote implements MediaRemoteRepository {
  constructor(private ownerId: string) {}

  /** Reads an archivo row (id + checksum gate for idempotent uploads). */
  private async findArchivo(id: string): Promise<{ storage_key: string | null; checksum_sha256: string | null } | null> {
    const { data, error } = await supabase
      .from('archivo')
      .select('storage_key, checksum_sha256')
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }

  async checkExists(visitaId: string, mediaId: string, checksum: string): Promise<string | null> {
    try {
      // Idempotency gate: an archivo row with the same checksum means this exact
      // file was already uploaded — reuse its key without re-uploading.
      // A different checksum (or missing row) forces a fresh upload + upsert.
      const row = await this.findArchivo(mediaId);
      if (!row || row.checksum_sha256 !== checksum || !row.storage_key) return null;
      // Row matches — verify the object is still in the bucket.
      const { data } = await supabase.storage
        .from(MEDIA_BUCKET)
        .list(`${this.ownerId}/${visitaId}`, { search: mediaId, limit: 1 })
      return data?.length ? row.storage_key : null;
    } catch { return null }
  }

  async upload(
    visitaId: string,
    mediaId: string,
    data: Uint8Array,
    mimeType: string,
  ): Promise<string> {
    const path = `${this.ownerId}/${visitaId}/${mediaId}`
    const blob = new Blob([data as unknown as BlobPart], { type: mimeType })
    const { error } = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(path, blob, { contentType: mimeType, upsert: true })
    if (error) throw new Error(error.message)
    return path
  }

  /** Next orden for a per-visita sequence, reusing the row's own on retry. */
  private async nextOrden(
    table: 'grupo_captura' | 'foto',
    column: 'orden' | 'orden_captura',
    visitaId: string,
    rowId: string,
  ): Promise<number> {
    return (await this.rowOrden(table, column, rowId))
      ?? ((await this.maxOrden(table, column, visitaId)) + 1);
  }

  /** Own orden of an existing row (null when absent). Reused on retry for stability. */
  private async rowOrden(
    table: 'grupo_captura' | 'foto',
    column: 'orden' | 'orden_captura',
    rowId: string,
  ): Promise<number | null> {
    // Dynamic column name: typed structurally instead of via generated types.
    type OrdenResult = { data: { id: string } & Record<string, number | null> | null; error: { message: string } | null };
    const res = (await supabase
      .from(table)
      .select(`id, ${column}`)
      .eq('id', rowId)
      .maybeSingle()) as unknown as OrdenResult;
    if (res.error) throw new Error(res.error.message);
    return res.data ? (res.data[column] as number) : null;
  }

  /** Max orden used in a visita (0 when none). Computed once per batch. */
  private async maxOrden(
    table: 'grupo_captura' | 'foto',
    column: 'orden' | 'orden_captura',
    visitaId: string,
  ): Promise<number> {
    const res = (await supabase
      .from(table)
      .select(column)
      .eq('visita_id', visitaId)
      .order(column, { ascending: false })
      .limit(1)
      .maybeSingle()) as unknown as { data: Record<string, number | null> | null; error: { message: string } | null };
    if (res.error) throw new Error(res.error.message);
    return res.data?.[column] ?? 0;
  }

  async pushGrupo(payload: GrupoCapturaPayload): Promise<void> {
    const now = new Date().toISOString();
    const remoteOrThrow = (remote: string | null, id: string) => {
      if (!remote) throw new Error(`Media ${id} sin subir (gating del outbox violado).`);
      return remote;
    };

    // 1. Archivos primero: las policies owns_archivo de grupo/foto los exigen.
    const archivos = [
      {
        id: payload.audio.id,
        profesional_id: payload.profesional_id,
        tipo: 'AUDIO' as const,
        storage_key: remoteOrThrow(payload.audio.remote_path, payload.audio.id),
        mime_type: payload.audio.mime_type,
        tamanio_bytes: payload.audio.size_bytes,
        checksum_sha256: payload.audio.checksum,
        estado_sincronizacion: 'SINCRONIZADO' as const,
        sincronizado_at: now,
      },
      ...payload.fotos.map(f => ({
        id: f.archivo_id,
        profesional_id: payload.profesional_id,
        tipo: 'IMAGEN' as const,
        storage_key: remoteOrThrow(f.remote_path, f.archivo_id),
        mime_type: f.mime_type,
        tamanio_bytes: f.size_bytes,
        checksum_sha256: f.checksum,
        estado_sincronizacion: 'SINCRONIZADO' as const,
        sincronizado_at: now,
      })),
    ];
    const { error: ae } = await supabase.from('archivo').upsert(archivos);
    if (ae) throw new Error(ae.message);

    // 2. Grupo de captura (hallazgo confirmado con su audio y transcripción).
    const orden = await this.nextOrden('grupo_captura', 'orden', payload.visita_id, payload.id);
    const { error: ge } = await supabase.from('grupo_captura').upsert({
      id: payload.id,
      visita_id: payload.visita_id,
      orden,
      estado: 'CONFIRMADO',
      audio_archivo_id: payload.audio.id,
      transcripcion_original: payload.transcripcion,
      audio_duracion_ms: payload.audio.duration_ms,
      iniciado_at: payload.iniciado_at,
      confirmado_at: payload.confirmado_at,
    });
    if (ge) throw new Error(ge.message);

    // 3. Fotos del grupo con orden de captura por visita.
    // The base is computed ONCE: rows of the same batch are inserted together,
    // so per-row max() queries would all return the same value and collide.
    // Fresh rows take base, base+1, …; rows that already exist (retry) keep
    // their own orden for stability.
    if (payload.fotos.length) {
      let next = (await this.maxOrden('foto', 'orden_captura', payload.visita_id)) + 1;
      const rows = [];
      for (const f of payload.fotos) {
        const own = await this.rowOrden('foto', 'orden_captura', f.id);
        let ordenCaptura: number;
        if (own !== null) ordenCaptura = own;
        else { ordenCaptura = next; next += 1; }
        rows.push({
          id: f.id,
          visita_id: payload.visita_id,
          grupo_captura_id: payload.id,
          archivo_id: f.archivo_id,
          orden_captura: ordenCaptura,
          orden_en_grupo: f.orden_en_grupo,
          capturada_at: f.capturada_at,
          seleccionada_para_informe: true,
        });
      }
      // Optimistic concurrency: if another device took our base meanwhile,
      // Postgres raises 23505 — recompute the base and retry (bounded).
      for (let attempt = 1; ; attempt += 1) {
        const { error: fe } = await supabase.from('foto').upsert(rows);
        if (!fe) break;
        if (!isUniqueViolation(fe) || attempt >= 3) throw new Error(fe.message);
        let rebased = (await this.maxOrden('foto', 'orden_captura', payload.visita_id)) + 1;
        for (const r of rows) {
          if ((await this.rowOrden('foto', 'orden_captura', r.id)) === null) {
            r.orden_captura = rebased; rebased += 1;
          }
        }
      }
    }
  }
}

/** Postgres unique-violation code (PostgREST surfaces it as `code`). */
function isUniqueViolation(error: { code?: string }): boolean {
  return error?.code === '23505';
}

// ── File reader for native Filesystem ────────────────────────────────────────
async function readLocalFile(path: string): Promise<Uint8Array> {
  // Native absolute paths (file:// URIs)
  if (path.startsWith('file:')) {
    const { data } = await Filesystem.readFile({ path })
    if (typeof data === 'string') {
      return Uint8Array.from(atob(data), c => c.charCodeAt(0))
    }
    return new Uint8Array(await (data as Blob).arrayBuffer())
  }
  // Relative paths stored in Directory.Data
  const { data } = await Filesystem.readFile({ path, directory: Directory.Data })
  if (typeof data === 'string') {
    return Uint8Array.from(atob(data), c => c.charCodeAt(0))
  }
  return new Uint8Array(await (data as Blob).arrayBuffer())
}

// ── Sync event emitter ───────────────────────────────────────────────────────
// The outbox (SQLite) is the source of truth. The engine reports domain events,
// the manager mirrors them into lab-storage, and the UI subscribes here
// instead of polling.
type SyncListener = () => void;
const syncListeners = new Set<SyncListener>();
export function subscribeMediaSync(fn: SyncListener): () => void {
  syncListeners.add(fn);
  return () => { syncListeners.delete(fn); };
}
function emitMediaSync(): void {
  syncListeners.forEach(fn => {
    try { fn(); } catch (caught) { console.error(caught); }
  });
}

// ── Instant group events (memory-first) ──────────────────────────────────────
// El grupo recién creado se entrega en memoria al Resumen sin esperar al disco.
// La recarga desde disco que llega después lo reemplaza por id (sin duplicar).
type GroupListener = (group: CaptureGroup) => void;
const groupListeners = new Set<GroupListener>();
export function subscribeGroupCreated(fn: GroupListener): () => void {
  groupListeners.add(fn);
  return () => { groupListeners.delete(fn); };
}
export function notifyGroupCreated(group: CaptureGroup): void {
  groupListeners.forEach(fn => {
    try { fn(group); } catch (caught) { console.error(caught); }
  });
}

// ── Migration: Preferences → Supabase (one-time, groups already in Preferences) ─
const MIGRATION_KEY = 'archforms-sync-migration-v1'

export async function runMigrationIfNeeded(outbox: MediaOutboxRepository, visitaId: string, ownerId: string): Promise<void> {
  const { value } = await Preferences.get({ key: `${MIGRATION_KEY}:${visitaId}` })
  if (value === 'done') return

  const groups = await loadCaptureGroups(visitaId)
  for (const group of groups) {
    if (group.syncStatus === 'synced') continue
    await enqueueGroupToOutbox(outbox, group, ownerId)
  }
  await Preferences.set({ key: `${MIGRATION_KEY}:${visitaId}`, value: 'done' })
}

// ── Enqueue a CaptureGroup into the media outbox ─────────────────────────────
export async function enqueueGroupToOutbox(
  outbox: MediaOutboxRepository,
  group: CaptureGroup,
  ownerId: string,
): Promise<void> {
  const mediaIds: string[] = []

  // Enqueue photos
  for (const photo of group.photos) {
    mediaIds.push(photo.id)
    await outbox.enqueueMedia({
      id:          photo.id,
      entity_type: 'foto',
      entity_id:   photo.id,
      grupo_id:    group.id,
      visita_id:   group.visitaId,
      local_path:  photo.path,
      mime_type:   photo.mimeType,
      size_bytes:  photo.sizeBytes,
      checksum:    photo.checksum,
      bucket_path: null,
      created_at:  photo.createdAt,
    })
  }

  // Enqueue audio
  mediaIds.push(group.audio.id)
  await outbox.enqueueMedia({
    id:          group.audio.id,
    entity_type: 'audio',
    entity_id:   group.audio.id,
    grupo_id:    group.id,
    visita_id:   group.visitaId,
    local_path:  group.audio.path,
    mime_type:   group.audio.mimeType,
    size_bytes:  group.audio.sizeBytes,
    checksum:    group.audio.checksum,
    bucket_path: null,
    created_at:  group.audio.createdAt,
  })

  // Payload for entity_outbox.
  // Foto row ids ARE the archivo/media ids: stable across rebuilds, so a late
  // transcription re-push overwrites the same rows instead of duplicating.
  // The entity payload is only a dirty trigger — the live payload is rebuilt
  // from local state at push time (see buildLivePayload).
  const payload: GrupoCapturaPayload = {
    id:             group.id,
    visita_id:      group.visitaId,
    profesional_id: ownerId,
    iniciado_at:    group.createdAt,
    confirmado_at:  new Date().toISOString(),
    transcripcion:  group.transcripcion ?? null,
    fotos: group.photos.map((p, i) => ({
      id:             p.id,
      archivo_id:     p.id,
      orden_en_grupo: i + 1,
      capturada_at:   p.createdAt,
      local_path:     p.path,
      remote_path:    null,
      mime_type:      p.mimeType,
      size_bytes:     p.sizeBytes,
      checksum:       p.checksum,
    })),
    audio: {
      id:          group.audio.id,
      local_path:  group.audio.path,
      remote_path: null,
      mime_type:   group.audio.mimeType,
      duration_ms: group.audio.durationMs,
      size_bytes:  group.audio.sizeBytes,
      checksum:    group.audio.checksum,
      created_at:  group.audio.createdAt,
    },
  }

  await outbox.enqueueEntity({
    id:          group.id,
    entity_type: 'grupo_captura',
    payload:     JSON.stringify(payload),
    depends_on:  mediaIds,
    created_at:  group.createdAt,
  })
}

// ── Live payload resolver ────────────────────────────────────────────────────
// Rebuilds the entity payload from CURRENT local state at push time.
// Foto row ids are the archivo/media ids (stable), so a re-push after a late
// transcription overwrites the same rows instead of duplicating.
async function buildLivePayload(
  outbox: MediaOutboxRepository,
  entityId: string,
  ownerId: string,
): Promise<GrupoCapturaPayload | null> {
  const group = await loadCaptureGroup(entityId);
  if (!group) return null;
  const fotos: GrupoCapturaPayload['fotos'] = [];
  for (const [i, p] of group.photos.entries()) {
    const m = await outbox.mediaStatus(p.id);
    fotos.push({
      id: p.id, archivo_id: p.id, orden_en_grupo: i + 1, capturada_at: p.createdAt,
      local_path: p.path, remote_path: m?.bucket_path ?? null,
      mime_type: p.mimeType, size_bytes: p.sizeBytes, checksum: p.checksum,
    });
  }
  const am = await outbox.mediaStatus(group.audio.id);
  return {
    id: group.id, visita_id: group.visitaId, profesional_id: ownerId,
    iniciado_at: group.createdAt, confirmado_at: new Date().toISOString(),
    transcripcion: group.transcripcion ?? null,
    audio: {
      id: group.audio.id, local_path: group.audio.path,
      remote_path: am?.bucket_path ?? null, mime_type: group.audio.mimeType,
      duration_ms: group.audio.durationMs, size_bytes: group.audio.sizeBytes,
      checksum: group.audio.checksum, created_at: group.audio.createdAt,
    },
    fotos,
  };
}

/** Called when whisper finishes: requeues the entity (payload is rebuilt live
 *  at push time) and runs the engine so the transcription reaches Supabase. */
export async function notifyTranscriptionReady(
  outbox: MediaOutboxRepository,
  groupId: string,
): Promise<void> {
  await outbox.forceRetry([groupId]);
  emitMediaSync();
  await triggerMediaSync();
}

/** Refreshes subscribers after local-only changes (transcription progress). */
export function notifyLocalChange(): void {
  emitMediaSync();
}

// ── Pull (nube → local) ──────────────────────────────────────────────────────
// Merge por unión: lo solo-local se conserva, lo remoto se espeja como 'synced'
// (sembrando el outbox) para que el motor jamás lo re-suba.
const PULL_KEY = 'archforms-pull-v1'

export async function getLastPull(visitaId: string): Promise<string | null> {
  const { value } = await Preferences.get({ key: `${PULL_KEY}:${visitaId}` });
  return value ?? null;
}

export type PullProgress = { phase: 'meta' | 'binaries'; done: number; total: number };
export type PullResult = { upserted: number; skippedDirty: number; downloaded: number };

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function audioExtension(mime: string): string {
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  return 'webm';
}

export async function pullVisitaFromCloud(
  outbox: MediaOutboxRepository,
  reader: CaptureRemoteReader,
  visitaId: string,
  onProgress?: (p: PullProgress) => void,
): Promise<PullResult> {
  const remote = await reader.fetchCapture([visitaId]);
  onProgress?.({ phase: 'meta', done: 1, total: 1 });

  // Snapshot local: qué grupos tienen filas pendientes (local manda si sí).
  const groups = await loadCaptureGroups(visitaId);
  const snapshots: LocalCaptureSnapshot[] = [];
  for (const g of groups) {
    const ids = [...g.photos.map(p => p.id), g.audio.id];
    let hasPending = false;
    for (const id of ids) {
      const m = await outbox.mediaStatus(id).catch(() => null);
      if (m && m.status !== 'synced') { hasPending = true; break; }
    }
    if (!hasPending) {
      const e = await outbox.entityStatus(g.id).catch(() => null);
      if (e) hasPending = true;
    }
    snapshots.push({ groupId: g.id, mediaIds: ids, hasPending });
  }

  const plan = planCapturePull(snapshots, remote);
  let downloaded = 0;
  const total = plan.upserts.reduce((n, u) => n + u.archivos.length, 0);

  for (const u of plan.upserts) {
    // 1. Descargar binarios faltantes a Filesystem (mismo layout que captura).
    const photos: LabPhoto[] = [];
    let audio: AudioClip | null = null;
    const fotoByArchivo = new Map(u.fotos.map(f => [f.archivo_id, f]));
    for (const a of u.archivos) {
      if (!a.storage_key) continue;
      const bytes = await reader.downloadBytes(a.storage_key);
      const b64 = bytesToBase64(bytes);
      if (a.tipo === 'AUDIO') {
        const ext = audioExtension(a.mime_type);
        const path = `archforms-lab/audio/${a.id}.${ext}`;
        await Filesystem.writeFile({ path, data: b64, directory: Directory.Data, recursive: true });
        audio = {
          id: a.id, path, mimeType: a.mime_type, durationMs: u.grupo.audio_duracion_ms ?? 0,
          sizeBytes: bytes.length, checksum: a.checksum_sha256 ?? '',
          createdAt: u.grupo.iniciado_at, displayUrl: `data:${a.mime_type};base64,${b64}`,
        };
      } else {
        const path = `archforms-lab/photos/${a.id}.jpg`;
        await Filesystem.writeFile({ path, data: b64, directory: Directory.Data, recursive: true });
        const f = fotoByArchivo.get(a.id);
        photos.push({
          id: a.id, path, mimeType: a.mime_type, features: [],
          sizeBytes: bytes.length, checksum: a.checksum_sha256 ?? '',
          createdAt: f?.capturada_at ?? u.grupo.iniciado_at,
          displayUrl: `data:${a.mime_type};base64,${b64}`,
        });
      }
      downloaded += 1;
      onProgress?.({ phase: 'binaries', done: downloaded, total });
    }
    if (!audio) continue; // grupo sin audio descargable: se omite (no se inventa)

    // 2. Espejar el grupo local como 'synced'.
    photos.sort((p1, p2) => {
      const o1 = u.fotos.find(f => f.archivo_id === p1.id)?.orden_en_grupo ?? 0;
      const o2 = u.fotos.find(f => f.archivo_id === p2.id)?.orden_en_grupo ?? 0;
      return o1 - o2;
    });
    await upsertRemoteGroup({
      id: u.grupo.id, visitaId,
      photos, audio,
      transcripcion: u.grupo.transcripcion_original,
      iniciadoAt: u.grupo.iniciado_at,
    });

    // 3. Sembrar el outbox como synced para que el motor lo ignore.
    const seed = async (
      id: string, entity: 'foto' | 'audio', localPath: string,
      mime: string, size: number, checksum: string, remotePath: string, createdAt: string,
    ) => {
      await outbox.enqueueMedia({
        id, entity_type: entity, entity_id: id, grupo_id: u.grupo.id, visita_id: visitaId,
        local_path: localPath, mime_type: mime, size_bytes: size,
        checksum, bucket_path: remotePath, created_at: createdAt,
      }).catch(() => undefined);
      await outbox.markMediaSynced(id, remotePath).catch(() => undefined);
    };
    for (const p of photos) {
      const remotePath = u.archivos.find(a => a.id === p.id)?.storage_key ?? '';
      await seed(p.id, 'foto', p.path, p.mimeType, p.sizeBytes, p.checksum, remotePath, p.createdAt);
    }
    const audioRemote = u.archivos.find(a => a.id === audio.id)?.storage_key ?? '';
    await seed(audio.id, 'audio', audio.path, audio.mimeType, audio.sizeBytes, audio.checksum, audioRemote, audio.createdAt);
  }

  await Preferences.set({ key: `${PULL_KEY}:${visitaId}`, value: new Date().toISOString() });
  emitMediaSync();
  return { upserted: plan.upserts.length, skippedDirty: plan.skippedDirty.length, downloaded };
}

// ── Garbage collector ─────────────────────────────────────────────────────────
async function runGarbageCollection(outbox: MediaOutboxRepository): Promise<void> {
  const paths = await outbox.collectGarbage(new Date().toISOString())
  await Promise.allSettled(
    paths.map(p =>
      p.startsWith('file:')
        ? Filesystem.deleteFile({ path: p })
        : Filesystem.deleteFile({ path: p, directory: Directory.Data })
    )
  )
}

// ── Sync status hook data ────────────────────────────────────────────────────
export type MediaSyncStats = {
  pending:   number
  uploading: number
  synced:    number
  error:     number
}

// ── Media Sync Manager ───────────────────────────────────────────────────────
/** Singleton manager that wires Network/App events to MediaSyncEngine. */
export class MediaSyncManager {
  private engine: MediaSyncEngine
  private outbox: MediaOutboxRepository
  private ownerId: string
  private listeners: Array<() => void> = []
  private started = false
  lastRun: { at: string; error: string | null } | null = null

  constructor(outbox: MediaOutboxRepository, ownerId: string) {
    this.outbox  = outbox
    this.ownerId = ownerId
    this.engine  = new MediaSyncEngine(
      outbox,
      new SupabaseMediaRemote(ownerId),
      readLocalFile,
      {
        onMedia: (item, status) => {
          const groupStatus = status === 'error' ? 'error' : 'uploading';
          void updateCaptureGroupSyncStatus(item.grupo_id, groupStatus)
            .then(emitMediaSync)
            .catch(console.error);
        },
        onEntity: (entityId, status) => {
          const groupStatus = status === 'synced' ? 'synced' : status === 'error' ? 'error' : 'uploading';
          void updateCaptureGroupSyncStatus(entityId, groupStatus)
            .then(emitMediaSync)
            .catch(console.error);
        },
      },
      // Live payload: rebuilt from current local state at push time, so late
      // arrivals (transcription) are included without touching the queue.
      (entityId) => buildLivePayload(outbox, entityId, ownerId),
    )
  }

  sync(): Promise<void> {
    return this.engine.run().then(
      () => {
        this.lastRun = { at: new Date().toISOString(), error: null };
        emitMediaSync();
      },
      (caught: unknown) => {
        this.lastRun = {
          at: new Date().toISOString(),
          error: caught instanceof Error ? caught.message : String(caught),
        };
        emitMediaSync();
      },
    );
  }

  isRunning(): boolean { return this.engine.active(); }

  start(): void {
    if (this.started) return
    this.started = true
    // eslint-disable-next-line no-this-alias -- intentional: module registry lets features trigger a run after enqueue
    activeManager = this

    // Sync on network restore (Capacitor + browser fallback for web)
    void Network.addListener('networkStatusChange', ({ connected }) => {
      if (connected) void this.sync()
    }).then(h => this.listeners.push(() => h.remove()))
    const onOnline = () => { void this.sync() };
    window.addEventListener('online', onOnline);
    this.listeners.push(() => window.removeEventListener('online', onOnline));

    // Sync when app comes to foreground
    void App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void this.sync()
    }).then(h => this.listeners.push(() => h.remove()))

    // Crash recovery + GC + initial sync attempt (fire-and-forget)
    void (async () => {
      try { await this.outbox.resetStuck() } catch (caught) { console.error(caught) }
      await this.gcAndSync()
      emitMediaSync()
    })().catch(console.error)
  }

  stop(): void {
    this.listeners.forEach(fn => fn())
    this.listeners = []
    this.started   = false
    if (activeManager === this) activeManager = null
  }

  async gcAndSync(): Promise<void> {
    await runGarbageCollection(this.outbox)
    await this.sync()
  }
}

// ── Active manager registry ──────────────────────────────────────────────────
// Lets any feature trigger a sync run right after enqueueing, instead of
// waiting for the next network/foreground event.
let activeManager: MediaSyncManager | null = null;
export function triggerMediaSync(): Promise<void> {
  return activeManager?.sync() ?? Promise.resolve();
}

// ── Debug helpers (panel de diagnóstico) ─────────────────────────────────────
export type SyncDebugState = {
  running: boolean;
  lastRun: { at: string; error: string | null } | null;
};

export function getMediaSyncDebugState(): SyncDebugState {
  return activeManager
    ? { running: activeManager.isRunning(), lastRun: activeManager.lastRun }
    : { running: false, lastRun: null };
}

export async function isMigrated(visitaId: string): Promise<boolean> {
  const { value } = await Preferences.get({ key: `${MIGRATION_KEY}:${visitaId}` });
  return value === 'done';
}

export type MediaDebugRow = {
  kind: 'foto' | 'audio';
  id: string;
  /** Outbox status, or 'sin-fila' when the media never entered the outbox. */
  status: string;
  attempts: number;
  /** Verbatim last error (usually Supabase's own message). */
  lastError: string | null;
  nextRetry: string | null;
  localPath: string;
  remotePath: string | null;
};

export type GroupSyncDebug = {
  media: MediaDebugRow[];
  /** Entity row status, 'enviada-ok' when pushed (rows are deleted on success). */
  entity: { status: string; attempts: number; lastError: string | null; nextRetry: string | null };
};

export async function getGroupSyncDebug(
  outbox: MediaOutboxRepository,
  group: CaptureGroup,
): Promise<GroupSyncDebug> {
  const media: MediaDebugRow[] = [];
  for (const [kind, id, localPath] of [
    ...group.photos.map(p => ['foto', p.id, p.path] as const),
    ['audio', group.audio.id, group.audio.path] as const,
  ]) {
    const row = await outbox.mediaStatus(id);
    media.push(row
      ? {
          kind, id, status: row.status, attempts: row.attempts,
          lastError: row.last_error, nextRetry: row.next_retry,
          localPath, remotePath: row.bucket_path,
        }
      : {
          kind, id, status: 'sin-fila', attempts: 0,
          lastError: null, nextRetry: null, localPath, remotePath: null,
        });
  }
  const entityRow = await outbox.entityStatus(group.id);
  const entity = entityRow
    ? {
        status: entityRow.status, attempts: entityRow.attempts,
        lastError: entityRow.last_error, nextRetry: entityRow.next_retry,
      }
    : media.some(m => m.status !== 'sin-fila')
      ? { status: 'enviada-ok', attempts: 0, lastError: null, nextRetry: null }
      : { status: 'nunca-entro', attempts: 0, lastError: null, nextRetry: null };
  return { media, entity };
}

/** Manual retry from the debug panel: skips backoff and runs the engine. */
export async function retryGroup(
  outbox: MediaOutboxRepository,
  group: CaptureGroup,
): Promise<void> {
  await outbox.forceRetry([group.id, ...group.photos.map(p => p.id), group.audio.id]);
  await triggerMediaSync();
}

// ── PDF artifact upload (Iteración 5) ────────────────────────────────────────
// Registers a client-generated PDF as archivo (tipo PDF) for the visita.
// Offline → the caller stores a pending record; nothing is silent.
const PENDING_PDF_KEY = 'archforms-pending-pdf-v1';

export async function getPendingPdf(visitaId: string): Promise<{ pdfId: string; filename: string } | null> {
  const { value } = await Preferences.get({ key: `${PENDING_PDF_KEY}:${visitaId}` });
  if (!value) return null;
  try { return JSON.parse(value) as { pdfId: string; filename: string }; } catch { return null; }
}

export async function setPendingPdf(visitaId: string, info: { pdfId: string; filename: string } | null): Promise<void> {
  if (!info) await Preferences.remove({ key: `${PENDING_PDF_KEY}:${visitaId}` });
  else await Preferences.set({ key: `${PENDING_PDF_KEY}:${visitaId}`, value: JSON.stringify(info) });
}

export async function uploadPdfArtifact(
  client: import('@supabase/supabase-js').SupabaseClient<import('@archforms/contracts').Database>,
  ownerId: string,
  visitaId: string,
  pdfId: string,
  filename: string,
  bytes: Uint8Array,
): Promise<string> {
  const key = `${ownerId}/${visitaId}/${pdfId}.pdf`;
  const { error: upErr } = await client.storage
    .from('visita-media')
    .upload(key, new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' }), {
      contentType: 'application/pdf',
      upsert: true,
    });
  if (upErr) throw new Error(upErr.message);
  const { error: dbErr } = await client.from('archivo').upsert({
    id: pdfId,
    profesional_id: ownerId,
    tipo: 'PDF',
    storage_key: key,
    nombre_original: filename,
    mime_type: 'application/pdf',
    tamanio_bytes: bytes.length,
    estado_sincronizacion: 'SINCRONIZADO',
    sincronizado_at: new Date().toISOString(),
  });
  if (dbErr) throw new Error(dbErr.message);
  return key;
}

export { exponentialBackoff }
