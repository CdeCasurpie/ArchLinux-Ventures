import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Preferences } from '@capacitor/preferences'
import { Capacitor } from '@capacitor/core'
import type { LocalFeature } from './local-features'
import type { NativeRecording } from './native-audio'
import { diskQueue } from './job-queue'

// ── Constants ───────────────────────────────────────────────────────────────
// legacy: solo para migrar / limpiar
const PHOTO_KEY  = 'archforms-lab-photos-v1'
const AUDIO_KEY  = 'archforms-lab-audio-v1'
const GROUP_KEY  = 'archforms-lab-groups-v1'
const MIGRATED_KEY = 'archforms-lab-groups-migrated-v2'

const ROOT = 'archforms-lab'
const SCHEMA = 2
export const photoPath = (id: string) => `${ROOT}/photos/${id}.jpg`
export const thumbPath = (id: string) => `${ROOT}/photos/${id}.thumb.jpg`
/** Apagado: los descriptores aún no se usan en ningún flujo (ver Fase 5). */
export const RUN_FEATURE_EXTRACTION = false
const groupDir  = (v: string) => `${ROOT}/groups/${v}`
const groupFile = (v: string, id: string) => `${groupDir(v)}/${id}.json`
const draftFile = (v: string) => `${ROOT}/drafts/${v}.json`

// Max dimensions for photo compression before persisting locally (web path)
const MAX_PHOTO_DIMENSION = 1920
const PHOTO_QUALITY       = 0.82

// ── SHA-256 via SubtleCrypto ─────────────────────────────────────────────────
async function sha256(data: Uint8Array): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', data as unknown as BufferSource)
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// ── Image compression (solo rama web) ────────────────────────────────────────
/** Resizes and compresses a base64 JPEG to MAX_PHOTO_DIMENSION on the longest side.
 *  Returns { base64, sizeBytes, checksum }. */
async function compressPhoto(base64: string): Promise<{
  base64: string
  sizeBytes: number
  checksum: string
}> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = async () => {
      const canvas = document.createElement('canvas')
      let { naturalWidth: w, naturalHeight: h } = img
      if (w > MAX_PHOTO_DIMENSION || h > MAX_PHOTO_DIMENSION) {
        if (w >= h) { h = Math.round((h * MAX_PHOTO_DIMENSION) / w); w = MAX_PHOTO_DIMENSION }
        else { w = Math.round((w * MAX_PHOTO_DIMENSION) / h); h = MAX_PHOTO_DIMENSION }
      }
      canvas.width = w; canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      const dataUrl = canvas.toDataURL('image/jpeg', PHOTO_QUALITY)
      const b64 = dataUrl.split(',')[1]
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
      const checksum = await sha256(bytes)
      resolve({ base64: b64, sizeBytes: bytes.length, checksum })
    }
    img.onerror = reject
    img.src = `data:image/jpeg;base64,${base64}`
  })
}

// ── Storage types (exportados sin cambios) ───────────────────────────────────
export type LabPhoto = {
  id:         string
  path:       string
  mimeType:   string
  features:   LocalFeature[]
  sizeBytes:  number
  checksum:   string
  createdAt:  string
  displayUrl: string
  /** Ruta del archivo de miniatura (~320px, Fase 5). Opcional. */
  thumbUrl?:  string
}

export type AudioClip = {
  id:         string
  path:       string
  mimeType:   string
  durationMs: number
  sizeBytes:  number
  checksum:   string
  createdAt:  string
  displayUrl: string
}

export type CaptureGroup = {
  id:                    string
  visitaId:              string
  photos:                LabPhoto[]
  audio:                 AudioClip
  transcripcion?:        string
  transcripcionStatus?:  string
  transcripcionError?:   string
  createdAt:             string
  syncStatus:            'pending' | 'uploading' | 'synced' | 'error'
}

type StoredPhoto = Omit<LabPhoto, 'displayUrl' | 'features'> & { thumbUrl?: string }
type StoredAudio = Omit<AudioClip, 'displayUrl'>
type StoredGroup = Omit<CaptureGroup, 'photos' | 'audio'> &
  { schemaVersion: number; photos: StoredPhoto[]; audio: StoredAudio }

// Lista explícita de campos: nunca se cuela un displayUrl ni nada pesado.
const photoRow = (p: StoredPhoto): StoredPhoto => ({
  id: p.id, path: p.path, mimeType: p.mimeType,
  sizeBytes: p.sizeBytes, checksum: p.checksum, createdAt: p.createdAt,
  ...(p.thumbUrl ? { thumbUrl: p.thumbUrl } : {}),
})
const audioRow = (a: StoredAudio): StoredAudio => ({
  id: a.id, path: a.path, mimeType: a.mimeType, durationMs: a.durationMs,
  sizeBytes: a.sizeBytes, checksum: a.checksum, createdAt: a.createdAt,
})
function toStored(g: Omit<CaptureGroup, 'photos' | 'audio'> & { photos: StoredPhoto[]; audio: StoredAudio }): StoredGroup {
  return {
    schemaVersion: SCHEMA,
    id: g.id, visitaId: g.visitaId, createdAt: g.createdAt,
    syncStatus: g.syncStatus ?? 'pending',
    transcripcion: g.transcripcion, transcripcionStatus: g.transcripcionStatus,
    transcripcionError: g.transcripcionError,
    photos: g.photos.map(photoRow), audio: audioRow(g.audio),
  }
}

// ── I/O atómico ──────────────────────────────────────────────────────────────
async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const tmp = `${path}.tmp`
  await Filesystem.writeFile({ path: tmp, data: JSON.stringify(value),
    directory: Directory.Data, encoding: Encoding.UTF8, recursive: true })
  const mv = () => Filesystem.rename({ from: tmp, to: path,
    directory: Directory.Data, toDirectory: Directory.Data })
  try { await mv() }
  catch {   // si el rename no sobrescribe (ver spike 0.2.4)
    await Filesystem.deleteFile({ path, directory: Directory.Data }).catch(() => undefined)
    await mv()
  }
}
async function readJson<T>(path: string): Promise<T | null> {
  for (const p of [path, `${path}.tmp`]) {        // .tmp solo si falta el principal
    try {
      const { data } = await Filesystem.readFile({ path: p, directory: Directory.Data, encoding: Encoding.UTF8 })
      return JSON.parse(typeof data === 'string' ? data : await (data as unknown as Blob).text()) as T
    } catch { /* siguiente */ }
  }
  return null
}
const deleteQuiet = (path: string) =>
  Filesystem.deleteFile({ path, directory: Directory.Data }).catch(() => undefined)
export async function deleteVisitCapture(visitaId:string){
 const captured=await loadCaptureGroups(visitaId);
 for(const group of captured){for(const photo of group.photos){await deleteQuiet(photo.path);await deleteQuiet(thumbPath(photo.id));thumbCache.delete(thumbPath(photo.id))}await deleteQuiet(group.audio.path);groups.delete(group.id);runtimeStatus.delete(group.id)}
 const draft=await loadDraftPhotos(visitaId);
 for(const photo of draft){await deleteQuiet(photo.path);await deleteQuiet(thumbPath(photo.id))}
 await Filesystem.rmdir({path:groupDir(visitaId),directory:Directory.Data,recursive:true}).catch(()=>undefined);
 await deleteQuiet(draftFile(visitaId));
 drafts.delete(visitaId);loadedVisitas.delete(visitaId);
}
async function listDir(path: string): Promise<string[]> {
  try {
    const { files } = await Filesystem.readdir({ path, directory: Directory.Data })
    return files.map((f: any) => (typeof f === 'string' ? f : f.name))
  } catch { return [] }
}

// ── URLs de visualización (sin base64 en nativo) ─────────────────────────────
export async function fileUrl(path: string, mimeType: string): Promise<string> {
  if (!Capacitor.isNativePlatform()) {            // web: comportamiento actual
    const { data } = await Filesystem.readFile({ path, directory: Directory.Data })
    return typeof data === 'string' ? `data:${mimeType};base64,${data}` : URL.createObjectURL(data)
  }
  // Nativo: las file:// del plugin van directo; las rutas de Data se resuelven
  // por archivo (sin cirugía de strings sobre el directorio: daba URLs rotas).
  if (path.startsWith('file:')) return Capacitor.convertFileSrc(path)
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Data })
  return Capacitor.convertFileSrc(uri)
}

/** dataURL lista para incrustar (PDF): lee el archivo local en ambas plataformas. */
export async function photoDataUrl(path: string, mimeType: string): Promise<string> {
  const { data } = await Filesystem.readFile(
    path.startsWith('file:') ? { path } : { path, directory: Directory.Data })
  if (typeof data === 'string') return `data:${mimeType};base64,${data}`
  const buf = new Uint8Array(await (data as unknown as Blob).arrayBuffer())
  let bin = ''
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return `data:${mimeType};base64,${btoa(bin)}`
}

// ── Estado en memoria y coalescencia ─────────────────────────────────────────
const groups = new Map<string, CaptureGroup>()
const drafts = new Map<string, StoredPhoto[]>()
const runtimeStatus = new Map<string, string>()      // overlay de transcripción
const loadedVisitas = new Map<string, Promise<void>>()
let allLoaded: Promise<void> | null = null

function coalesced(write: (key: string) => Promise<void>) {
  const scheduled = new Map<string, Promise<void>>()
  return (key: string): Promise<void> => {
    const hit = scheduled.get(key)
    if (hit) return hit                     // ya hay una escritura pendiente: leerá el estado más nuevo
    const p = diskQueue.enqueue(`write:${key}`, async () => { scheduled.delete(key); await write(key) })
    scheduled.set(key, p)
    return p
  }
}
const persistGroup = coalesced(async id => {
  const g = groups.get(id); if (!g) return
  await writeJsonAtomic(groupFile(g.visitaId, id), toStored(g))
})
const persistDraft = coalesced(async visitaId => {
  const rows = drafts.get(visitaId) ?? []
  if (rows.length) await writeJsonAtomic(draftFile(visitaId), { schemaVersion: SCHEMA, photos: rows })
  else await deleteQuiet(draftFile(visitaId))
})

// ── Carga e hidratación ──────────────────────────────────────────────────────
async function hydrate(s: StoredGroup): Promise<CaptureGroup> {
  const { schemaVersion, photos, audio, ...rest } = s; void schemaVersion
  return {
    ...rest,
    photos: await Promise.all(photos.map(async p =>
      ({ ...p, features: [],
         thumbUrl: p.thumbUrl ? await fileUrl(thumbPath(p.id), p.mimeType) : undefined,
         displayUrl: await fileUrl(p.path, p.mimeType) }))),
    audio: { ...audio, displayUrl: await fileUrl(audio.path, audio.mimeType) },
  }
}
function ensureVisita(visitaId: string): Promise<void> {
  let p = loadedVisitas.get(visitaId)
  if (!p) {
    p = (async () => {
      const names = new Set((await listDir(groupDir(visitaId)))
        .map(n => n.replace(/\.tmp$/, '')).filter(n => n.endsWith('.json')))
      await Promise.all([...names].map(async n => {
        const id = n.slice(0, -5)
        if (groups.has(id)) return                        // lo que está en memoria manda
        const s = await readJson<StoredGroup>(`${groupDir(visitaId)}/${n}`)
        if (s && !groups.has(id)) groups.set(id, await hydrate(s))
      }))
    })().catch(e => console.error('load visita', visitaId, e))
    loadedVisitas.set(visitaId, p)
  }
  return p
}
const ensureAll = () => (allLoaded ??= (async () => {
  const dirs = await listDir(`${ROOT}/groups`)
  await Promise.all(dirs.map(ensureVisita))
})())

let init: Promise<void> | null = null
const ready = () => (init ??= (async () => {
  await Promise.all(['photos', 'audio', 'groups', 'drafts', 'features'].map(d =>
    Filesystem.mkdir({ path: `${ROOT}/${d}`, directory: Directory.Data, recursive: true }).catch(() => undefined)))
  await migrateLegacyGroups()
})())

const withOverlay = (g: CaptureGroup): CaptureGroup => {
  const s = runtimeStatus.get(g.id)
  return s ? { ...g, transcripcionStatus: s } : g
}
// En el store thumbUrl es una RUTA; hacia afuera siempre es URL lista para <img>.
const thumbCache = new Map<string, string>()
async function resolveThumbUrl(thumb: string | undefined, mime: string): Promise<string | undefined> {
  if (!thumb) return undefined
  if (/^(cap|https?|data|blob|file):/.test(thumb)) return thumb
  const hit = thumbCache.get(thumb)
  if (hit) return hit
  try {
    const url = await fileUrl(thumb, mime)
    thumbCache.set(thumb, url)
    return url
  } catch { return undefined }
}
async function withThumbs(g: CaptureGroup): Promise<CaptureGroup> {
  if (!g.photos.some(p => p.thumbUrl)) return g
  return { ...g, photos: await Promise.all(g.photos.map(async p =>
    ({ ...p, thumbUrl: await resolveThumbUrl(p.thumbUrl, p.mimeType) }))) }
}
const byCreated = (a: CaptureGroup, b: CaptureGroup) => a.createdAt.localeCompare(b.createdAt)

// ── API pública ──────────────────────────────────────────────────────────────
export async function loadCaptureGroups(visitaId: string) {
  await ready(); await ensureVisita(visitaId)
  const found = [...groups.values()].filter(g => g.visitaId === visitaId).sort(byCreated).map(withOverlay)
  return Promise.all(found.map(withThumbs))
}
export async function loadCaptureGroup(groupId: string) {
  await ready()
  const g = groups.get(groupId) ?? (await ensureAll(), groups.get(groupId))
  return g ? withThumbs(withOverlay(g)) : null
}
export async function loadAllGroups() {
  await ready(); await ensureAll()
  return Promise.all([...groups.values()].sort(byCreated).map(withOverlay).map(withThumbs))
}

export function createCaptureGroup(
  visitaId:    string,
  photos:      LabPhoto[],
  audio:       AudioClip,
): CaptureGroup {
  return {
    id:                  crypto.randomUUID(),
    visitaId,
    photos,
    audio,
    transcripcionStatus: 'pending',
    createdAt:           new Date().toISOString(),
    syncStatus:          'pending',
  }
}

/** Registra el grupo en RAM sin I/O: Resumen lo ve al instante. */
export function registerGroupInMemory(group: CaptureGroup): void { groups.set(group.id, group) }

export async function persistCaptureGroup(group: CaptureGroup): Promise<void> {
  await ready(); groups.set(group.id, group); await persistGroup(group.id)
}
/** Fija las fotos definitivas y ESPERA a disco (invariante: persistido antes de encolar al outbox). */
export async function commitGroupPhotos(groupId: string, photos: LabPhoto[]): Promise<void> {
  await ready()
  const g = groups.get(groupId); if (!g) return
  groups.set(groupId, { ...g, photos })
  await persistGroup(groupId)
}
/** Compat: crea + persiste (los llamadores nuevos separan ambas fases). */
export async function saveCaptureGroup(
  visitaId:    string,
  photos:      LabPhoto[],
  audio:       AudioClip,
): Promise<CaptureGroup> {
  const group = createCaptureGroup(visitaId, photos, audio)
  await persistCaptureGroup(group)
  return group
}

async function mutate(groupId: string, fn: (g: CaptureGroup) => CaptureGroup): Promise<void> {
  await ready()
  const cur = groups.get(groupId) ?? (await ensureAll(), groups.get(groupId))
  if (!cur) return
  const next = fn(cur)
  if (next === cur) return                                   // dedupe: sin cambios, sin escritura
  groups.set(groupId, next)                                  // el llamador sigue tras actualizar RAM
  void persistGroup(groupId).catch(e => console.error('persist group', groupId, e))
}
export const updateCaptureGroupSyncStatus = (id: string, syncStatus: CaptureGroup['syncStatus']) =>
  mutate(id, g => (g.syncStatus === syncStatus ? g : { ...g, syncStatus }))
export const updateCaptureGroupTranscription = (id: string, text: string) =>
  mutate(id, g => ({ ...g, transcripcion: text, transcripcionStatus: 'done', transcripcionError: undefined }))
export const updateCaptureGroupTranscriptionStatus = (id: string, status: string, error?: string) =>
  mutate(id, g => (g.transcripcionStatus === status && g.transcripcionError === error
    ? g : { ...g, transcripcionStatus: status, transcripcionError: error }))
export async function updateAudioClipChecksum(id: string, patch: { checksum: string; sizeBytes: number }): Promise<void> {
  await ready()
  const g = [...groups.values()].find(x => x.audio.id === id)
  if (g) await mutate(g.id, cur => ({ ...cur, audio: { ...cur.audio, ...patch } }))
}
export function setRuntimeTranscriptionStatus(groupId: string, s: string | null) {
  if (s) runtimeStatus.set(groupId, s); else runtimeStatus.delete(groupId)
}

// upsert remoto: input.photos/audio SIN displayUrl (se hidrata aquí)
export async function upsertRemoteGroup(input: {
  id:             string
  visitaId:       string
  photos:         Omit<LabPhoto, 'displayUrl'>[]
  audio:          Omit<AudioClip, 'displayUrl'>
  transcripcion:  string | null
  iniciadoAt:     string
}): Promise<CaptureGroup> {
  await ready()
  const stored = toStored({
    id: input.id, visitaId: input.visitaId, createdAt: input.iniciadoAt, syncStatus: 'synced',
    transcripcion: input.transcripcion ?? undefined,
    transcripcionStatus: input.transcripcion ? 'done' : 'remote',
    photos: input.photos, audio: input.audio,
  })
  const group = await hydrate(stored)
  groups.set(group.id, group)
  await persistGroup(group.id)
  return group
}

// ── Drafts y alta de fotos ───────────────────────────────────────────────────
export function addDraftPhoto(visitaId: string, row: StoredPhoto) {
  drafts.set(visitaId, [photoRow(row), ...(drafts.get(visitaId) ?? [])])   // más reciente primero
  void persistDraft(visitaId).catch(console.error)
}
export function removeDraftPhotos(visitaId: string, ids: string[]) {
  const drop = new Set(ids)
  drafts.set(visitaId, (drafts.get(visitaId) ?? []).filter(r => !drop.has(r.id)))
  void persistDraft(visitaId).catch(console.error)
}
export async function loadDraftPhotos(visitaId: string): Promise<LabPhoto[]> {
  await ready()
  if (!drafts.has(visitaId)) {
    const d = await readJson<{ photos: StoredPhoto[] }>(draftFile(visitaId))
    drafts.set(visitaId, d?.photos ?? [])
  }
  await ensureVisita(visitaId)
  const inGroups = new Set([...groups.values()].filter(g => g.visitaId === visitaId).flatMap(g => g.photos.map(p => p.id)))
  const rows = drafts.get(visitaId)!.filter(r => !inGroups.has(r.id))   // evita duplicar si murió entre persistir y limpiar
  return Promise.all(rows.map(async r => ({ ...r, features: [], displayUrl: await fileUrl(r.path, r.mimeType) })))
}

export type IngestResult = { sizeBytes: number; checksum: string }
/** Mueve el JPEG del cache del plugin a Data, calcula checksum y lo anota en el draft. */
export function ingestCapturedPhoto(i: { id: string; tmpUri: string; visitaId: string; createdAt: string }): Promise<IngestResult> {
  return diskQueue.enqueue(`photo:${i.id}`, async () => {
    await ready()
    const path = photoPath(i.id)
    await Filesystem.copy({ from: i.tmpUri, to: path, toDirectory: Directory.Data })
    const bytes = new Uint8Array(await (await fetch(Capacitor.convertFileSrc(i.tmpUri))).arrayBuffer())
    const checksum = await sha256(bytes)
    addDraftPhoto(i.visitaId, { id: i.id, path, mimeType: 'image/jpeg', sizeBytes: bytes.length, checksum, createdAt: i.createdAt })
    return { sizeBytes: bytes.length, checksum }
  })
}

// ── Fotos web ────────────────────────────────────────────────────────────────
export async function savePhoto(input: {
  base64:   string
  mimeType: string
  features: LocalFeature[]
}): Promise<LabPhoto> {
  // Compress + checksum before writing to disk (sin índice: la web no usa drafts)
  const compressed = await compressPhoto(input.base64)
  const id        = crypto.randomUUID()
  const path      = photoPath(id)
  await Filesystem.writeFile({
    path,
    data: compressed.base64,
    directory: Directory.Data,
    recursive: true,
  })
  return {
    id,
    path,
    mimeType:  'image/jpeg',
    features:  input.features,
    sizeBytes: compressed.sizeBytes,
    checksum:  compressed.checksum,
    createdAt: new Date().toISOString(),
    displayUrl: `data:image/jpeg;base64,${compressed.base64}`,
  }
}

// ── Audio ────────────────────────────────────────────────────────────────────
export async function saveAudioClip(blob: Blob, durationMs: number): Promise<AudioClip> {
  const id        = crypto.randomUUID()
  const mimeType  = blob.type || 'audio/webm'
  const extension = mimeType.includes('mp4') ? 'm4a' : 'webm'
  const path      = `archforms-lab/audio/${id}.${extension}`
  const bytes     = new Uint8Array(await blob.arrayBuffer())
  const checksum  = await sha256(bytes)
  const base64    = btoa(Array.from(bytes).map(b => String.fromCharCode(b)).join(''))
  await Filesystem.writeFile({ path, data: base64, directory: Directory.Data, recursive: true })
  return {
    id, path, mimeType, durationMs,
    sizeBytes: bytes.length,
    checksum,
    createdAt: new Date().toISOString(),
    displayUrl: `data:${mimeType};base64,${base64}`,
  }
}

export async function saveNativeAudio(recording: NativeRecording): Promise<AudioClip> {
  // Read bytes for checksum calculation
  let checksum = ''
  let sizeBytes = recording.sizeBytes
  try {
    const { data } = await Filesystem.readFile({ path: recording.uri })
    const bytes = typeof data === 'string'
      ? Uint8Array.from(atob(data), c => c.charCodeAt(0))
      : new Uint8Array(await (data as Blob).arrayBuffer())
    checksum  = await sha256(bytes)
    sizeBytes = bytes.length
  } catch { /* checksum best-effort */ }

  return {
    id:        crypto.randomUUID(),
    path:      recording.uri,
    mimeType:  recording.mimeType,
    durationMs: recording.durationMs,
    sizeBytes,
    checksum,
    createdAt: new Date().toISOString(),
    displayUrl: Capacitor.convertFileSrc(recording.uri),
  }
}

// Guarda solo el caparazón del audio (sin leer el archivo): rápido, para que el
// grupo exista al instante. El checksum se completa después en background.
export async function saveNativeAudioShell(recording: NativeRecording): Promise<AudioClip> {
  return {
    id:        crypto.randomUUID(),
    path:      recording.uri,
    mimeType:  recording.mimeType,
    durationMs: recording.durationMs,
    sizeBytes: recording.sizeBytes,
    checksum:  '',
    createdAt: new Date().toISOString(),
    displayUrl: Capacitor.convertFileSrc(recording.uri),
  }
}

// Lee los bytes del archivo ya grabado y devuelve checksum + tamaño real.
export async function computeRecordingChecksum(uri: string): Promise<{ checksum: string; sizeBytes: number }> {
  const { data } = await Filesystem.readFile({ path: uri })
  const bytes = typeof data === 'string'
    ? Uint8Array.from(atob(data), c => c.charCodeAt(0))
    : new Uint8Array(await (data as Blob).arrayBuffer())
  return { checksum: await sha256(bytes), sizeBytes: bytes.length }
}

// ── Miniaturas (~320px, no se suben) + descriptores opcionales ───────────────
export async function writePhotoThumbnail(photoId: string, mimeType: string): Promise<string | null> {
  if (typeof createImageBitmap === 'undefined' || typeof OffscreenCanvas === 'undefined') return null
  try {
    const { data } = await Filesystem.readFile({ path: photoPath(photoId), directory: Directory.Data })
    const bytes = typeof data === 'string'
      ? Uint8Array.from(atob(data), c => c.charCodeAt(0))
      : new Uint8Array(await (data as unknown as Blob).arrayBuffer())
    const bmp = await createImageBitmap(
      new Blob([bytes as unknown as BlobPart], { type: mimeType }), { resizeWidth: 320 })
    const canvas = new OffscreenCanvas(bmp.width, bmp.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(bmp, 0, 0)
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 })
    const tb = new Uint8Array(await blob.arrayBuffer())
    let bin = ''
    for (let i = 0; i < tb.length; i += 0x8000) bin += String.fromCharCode(...tb.subarray(i, i + 0x8000))
    await Filesystem.writeFile({ path: thumbPath(photoId), data: btoa(bin), directory: Directory.Data, recursive: true })
    return thumbPath(photoId)
  } catch (e) { console.error('thumbnail:', e); return null }
}

export async function setPhotoThumbUrl(photoId: string, thumb: string): Promise<void> {
  await ready()
  const g = [...groups.values()].find(x => x.photos.some(p => p.id === photoId))
  if (g) await mutate(g.id, cur => ({ ...cur, photos: cur.photos.map(p => (p.id === photoId ? { ...p, thumbUrl: thumb } : p)) }))
}

/** Extrae descriptores al sidecar features/<id>.json (apagado por flag). */
export async function extractPhotoFeatures(photoId: string, fileUri: string): Promise<void> {
  if (!RUN_FEATURE_EXTRACTION) return
  try {
    const { extractLocalFeatures } = await import('./local-features')
    await writeJsonAtomic(`${ROOT}/features/${photoId}.json`, await extractLocalFeatures(fileUri))
  } catch (e) { console.error('features:', e) }
}

// ── Migración única de GROUP_KEY ─────────────────────────────────────────────
async function migrateLegacyGroups(): Promise<void> {
  if ((await Preferences.get({ key: MIGRATED_KEY })).value === 'done') return
  const { value } = await Preferences.get({ key: GROUP_KEY })
  if (!value) { await Preferences.set({ key: MIGRATED_KEY, value: 'done' }); return }

  let legacy: any[]
  try { legacy = JSON.parse(value) }
  catch (e) { console.error('grupos legacy corruptos; migración omitida (no se borra nada)', e); return }

  await Filesystem.writeFile({ path: `${ROOT}/backup/groups-v1.json`, data: value,
    directory: Directory.Data, encoding: Encoding.UTF8, recursive: true })

  for (const g of legacy) {
    for (const m of [...g.photos, g.audio]) await recoverFromDataUrl(m)
    for (const p of g.photos)
      if (p.features?.length) await writeJsonAtomic(`${ROOT}/features/${p.id}.json`, p.features)
    await writeJsonAtomic(groupFile(g.visitaId, g.id), toStored(g))
  }
  // verificar antes de borrar nada
  for (const g of legacy)
    if (!(await readJson(groupFile(g.visitaId, g.id)))) throw new Error(`migración incompleta: ${g.id}`)

  await Preferences.set({ key: MIGRATED_KEY, value: 'done' })
  await Preferences.remove({ key: GROUP_KEY })     // libera el string de MBs de SharedPreferences
}

async function recoverFromDataUrl(m: { path: string; displayUrl?: string }) {
  if (!m.displayUrl?.startsWith('data:') || m.path.startsWith('file:')) return
  try { await Filesystem.stat({ path: m.path, directory: Directory.Data }); return } catch { /* falta */ }
  await Filesystem.writeFile({ path: m.path, data: m.displayUrl.slice(m.displayUrl.indexOf(',') + 1),
    directory: Directory.Data, recursive: true })
}

// ── Clear all lab data (debug / reset) ───────────────────────────────────────
export async function clearLabData(): Promise<void> {
  await Filesystem.rmdir({ path: ROOT, directory: Directory.Data, recursive: true }).catch(() => undefined)
  groups.clear(); drafts.clear(); runtimeStatus.clear(); thumbCache.clear()
  loadedVisitas.clear(); allLoaded = null; init = null
  await Promise.all([PHOTO_KEY, AUDIO_KEY, GROUP_KEY, MIGRATED_KEY].map(key => Preferences.remove({ key })))
}
