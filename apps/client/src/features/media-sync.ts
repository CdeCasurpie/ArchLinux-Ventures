import { Filesystem, Directory } from '@capacitor/filesystem'
import { supabase, workspaceLocal } from '../platform'
import type { GrupoCapturaPayload } from '@archforms/domain'
import { MediaSyncEngine, exponentialBackoff, planCapturePull, scopeMediaOutbox } from '@archforms/application'
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
import { Capacitor } from '@capacitor/core'
import { captureActivity } from './activity'
import { verifyDownload } from './verify-download'

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

  async pushGrupo(payload:GrupoCapturaPayload):Promise<void>{
    const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)));
    const hex=Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('').slice(0,32);
    const operationId=`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
    const {error}=await supabase.rpc('sync_capture_v1',{operation_id:operationId,payload:payload as unknown as import('@archforms/contracts').Json});
    if(error)throw error;
  }
}

// ── File reader for native Filesystem ────────────────────────────────────────
async function readLocalFile(path: string): Promise<Uint8Array> {
  await captureActivity.whenIdle()                      // pausa entre archivos mientras se captura
  try {
    if (Capacitor.isNativePlatform()) {
      const uri = path.startsWith('file:') ? path
        : (await Filesystem.getUri({ path, directory: Directory.Data })).uri
      const res = await fetch(Capacitor.convertFileSrc(uri))
      if (res.ok) return new Uint8Array(await res.arrayBuffer())
    }
  } catch { /* cae al método anterior */ }
  return readLocalFileLegacy(path)                       // el código anterior, renombrado
}
async function readLocalFileLegacy(path: string): Promise<Uint8Array> {
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
    if (!photo.checksum) throw new Error(`Foto ${photo.id} sin checksum: no se encola.`)
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
  // Freeze the payload here. Retries resolve paths but never reread edited text.
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
// Builds a new snapshot when enqueueing a transcription or recovering a legacy
// marker. It is persisted before dispatch, not rebuilt during retries.
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

/** A completed transcription creates a new frozen snapshot. If its account is
 * inactive, retain a legacy marker for account-scoped recovery on next login. */
export async function notifyTranscriptionReady(
  outbox: MediaOutboxRepository,
  groupId: string,
): Promise<void> {
  await updateCaptureGroupSyncStatus(groupId,'pending');
  if(activeManager)await activeManager.freezeGroup(groupId);
  else{
    const group=await loadCaptureGroup(groupId);
    if(group)await outbox.enqueueEntity({id:groupId,entity_type:'grupo_captura',payload:'{}',depends_on:[...group.photos.map(photo=>photo.id),group.audio.id],created_at:new Date().toISOString()});
  }
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
  signal?: AbortSignal,
): Promise<PullResult> {
  signal?.throwIfAborted();
  const remote = await reader.fetchCapture([visitaId]);
  signal?.throwIfAborted();
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
    const present:string[]=[];
    if(!hasPending)for(const item of [...g.photos,g.audio]){
      try{const bytes=await readLocalFile(item.path);await verifyDownload(bytes,item.sizeBytes,item.checksum||null);present.push(item.id)}catch{/* Missing/corrupt local copies must be repaired. */}
    }
    snapshots.push({ groupId: g.id, mediaIds: hasPending?ids:present, hasPending });
  }

  const plan = planCapturePull(snapshots, remote);
  let downloaded = 0;
  const total = plan.upserts.reduce((n, u) => n + u.archivos.length, 0);
  onProgress?.({ phase: 'binaries', done: 0, total });

  for (const u of plan.upserts) {
    // 1. Descargar binarios faltantes a Filesystem (mismo layout que captura).
    // Sin displayUrl: se hidrata en upsertRemoteGroup (Fase 1, sin base64 en el JSON).
    const known=groups.find(group=>group.id===u.grupo.id);
    const wantedPhotos=new Set(u.fotos.map(photo=>photo.archivo_id));
    const photos: Omit<LabPhoto, 'displayUrl'>[] = (known?.photos??[]).filter(photo=>wantedPhotos.has(photo.id));
    let audio: Omit<AudioClip, 'displayUrl'> | null = known?.audio.id===u.grupo.audio_archivo_id?known.audio:null;
    const fotoByArchivo = new Map(u.fotos.map(f => [f.archivo_id, f]));
    for (const a of u.archivos) {
      signal?.throwIfAborted();
      if (!a.storage_key) continue;
      const path=a.tipo==='AUDIO'?`archforms-lab/audio/${a.id}.${audioExtension(a.mime_type)}`:`archforms-lab/photos/${a.id}.jpg`;
      let bytes:Uint8Array;
      try{bytes=await readLocalFile(path);await verifyDownload(bytes,a.tamanio_bytes,a.checksum_sha256)}
      catch{bytes=await reader.downloadBytes(a.storage_key,signal)}
      signal?.throwIfAborted();
      await verifyDownload(bytes,a.tamanio_bytes,a.checksum_sha256);
      const b64 = bytesToBase64(bytes);
      if (a.tipo === 'AUDIO') {
        const ext = audioExtension(a.mime_type);
        const path = `archforms-lab/audio/${a.id}.${ext}`;
        await Filesystem.writeFile({ path, data: b64, directory: Directory.Data, recursive: true });
        audio = {
          id: a.id, path, mimeType: a.mime_type, durationMs: u.grupo.audio_duracion_ms ?? 0,
          sizeBytes: bytes.length, checksum: a.checksum_sha256 ?? '',
          createdAt: u.grupo.iniciado_at,
        };
      } else {
        const path = `archforms-lab/photos/${a.id}.jpg`;
        await Filesystem.writeFile({ path, data: b64, directory: Directory.Data, recursive: true });
        const f = fotoByArchivo.get(a.id);
        const previous=photos.findIndex(photo=>photo.id===a.id);if(previous>=0)photos.splice(previous,1);
        photos.push({
          id: a.id, path, mimeType: a.mime_type, features: [],
          sizeBytes: bytes.length, checksum: a.checksum_sha256 ?? '',
          createdAt: f?.capturada_at ?? u.grupo.iniciado_at,
        });
      }
      downloaded += 1;
      onProgress?.({ phase: 'binaries', done: downloaded, total });
    }
    if (!audio) throw new Error(`El grupo ${u.grupo.id} no tiene audio disponible; no se marcó como descargado.`);
    signal?.throwIfAborted();

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
  private started = false
  lastRun: { at: string; error: string | null } | null = null

  constructor(outbox: MediaOutboxRepository, ownerId: string) {
    this.outbox = scopeMediaOutbox(outbox,ownerId,async()=>new Set((await workspaceLocal.read(ownerId)).visitas.map(visit=>visit.id)),async id=>{
      const payload=await buildLivePayload(outbox,id,ownerId);return payload?JSON.stringify(payload):null;
    });
    outbox=this.outbox
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
    )
  }

  private initialization:Promise<void>=Promise.resolve();
  private schedule:(()=>Promise<void>)|undefined;
  async freezeGroup(id:string){
    const group=await loadCaptureGroup(id);
    if(!group)return;
    const workspace=await workspaceLocal.read(this.ownerId);
    if(!workspace.visitas.some(visit=>visit.id===group.visitaId))return;
    const payload=await buildLivePayload(this.outbox,id,this.ownerId);
    if(payload)await this.outbox.enqueueEntity({id,entity_type:'grupo_captura',payload:JSON.stringify(payload),depends_on:[...group.photos.map(photo=>photo.id),group.audio.id],created_at:new Date().toISOString()});
  }
  requestSync(){return this.schedule?.()??this.sync()}
  async sync():Promise<void>{
    await this.initialization;
    if(!this.started||!captureActivity.isIdle())return;
    try{await this.engine.run();this.lastRun={at:new Date().toISOString(),error:null}}
    catch(error){this.lastRun={at:new Date().toISOString(),error:String(error)};throw error}
    finally{emitMediaSync()}
  }

  isRunning(): boolean { return this.engine.active(); }
  async pause(){this.stop();await this.engine.whenIdle()}

  start(schedule?:()=>Promise<void>):void{
    if(this.started)return;
    this.started=true;this.schedule=schedule;
    // eslint-disable-next-line no-this-alias -- registry forwards feature events to the account coordinator
    activeManager=this;
    this.initialization=this.outbox.resetStuck();
  }
  stop():void{
    this.started=false;this.schedule=undefined;
    if(activeManager===this)activeManager=null;
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
  return activeManager?.requestSync() ?? Promise.resolve();
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

export { exponentialBackoff }
