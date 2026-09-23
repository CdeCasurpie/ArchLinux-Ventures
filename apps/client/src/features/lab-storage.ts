import { Directory, Filesystem } from '@capacitor/filesystem'
import { Preferences } from '@capacitor/preferences'
import { Capacitor } from '@capacitor/core'
import type { LocalFeature } from './local-features'
import type { NativeRecording } from './native-audio'

// ── Constants ───────────────────────────────────────────────────────────────
const PHOTO_KEY  = 'archforms-lab-photos-v1'
const AUDIO_KEY  = 'archforms-lab-audio-v1'
const GROUP_KEY  = 'archforms-lab-groups-v1'

// Max dimensions for photo compression before persisting locally
const MAX_PHOTO_DIMENSION = 1920
const PHOTO_QUALITY       = 0.82

// ── SHA-256 via SubtleCrypto ─────────────────────────────────────────────────
async function sha256(data: Uint8Array): Promise<string> {
  const buffer = await crypto.subtle.digest('SHA-256', data as unknown as BufferSource)
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// ── Image compression ────────────────────────────────────────────────────────
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

// ── Storage types ────────────────────────────────────────────────────────────
export type LabPhoto = {
  id:         string
  path:       string
  mimeType:   string
  features:   LocalFeature[]
  sizeBytes:  number
  checksum:   string
  createdAt:  string
  displayUrl: string
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

type StoredPhoto = Omit<LabPhoto,  'displayUrl'>
type StoredAudio = Omit<AudioClip, 'displayUrl'>

// ── Write serialization ──────────────────────────────────────────────────────
// All index writes go through a single promise chain. Without this, concurrent
// writers (capture, whisper pipeline, sync-engine events) interleave their
// read-modify-write cycles and the last writer wins with stale data
// (e.g. a finished transcription wiped by an in-flight sync-status update).
let writeLock: Promise<unknown> = Promise.resolve();
function locked<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeLock.then(fn);
  writeLock = next.catch(() => undefined);
  return next;
}

// ── Index helpers ────────────────────────────────────────────────────────────
async function readIndex<T>(key: string): Promise<T[]> {
  const { value } = await Preferences.get({ key })
  if (!value) return []
  try { return JSON.parse(value) as T[] } catch { return [] }
}

const writeIndex = <T,>(key: string, rows: T[]) =>
  Preferences.set({ key, value: JSON.stringify(rows) })

// ── Display URL helpers ──────────────────────────────────────────────────────
async function readDisplayUrl(path: string, mimeType: string): Promise<string> {
  const { data } = await Filesystem.readFile({ path, directory: Directory.Data })
  return typeof data === 'string'
    ? `data:${mimeType};base64,${data}`
    : URL.createObjectURL(data)
}

// ── Photos ───────────────────────────────────────────────────────────────────
export async function loadPhotos(): Promise<LabPhoto[]> {
  const rows = await readIndex<StoredPhoto>(PHOTO_KEY)
  return Promise.all(rows.map(async row => ({
    ...row,
    displayUrl: await readDisplayUrl(row.path, row.mimeType),
  })))
}

export async function savePhoto(input: {
  base64:   string
  mimeType: string
  features: LocalFeature[]
}): Promise<LabPhoto> {
  // Compress + checksum before writing to disk
  const compressed = await compressPhoto(input.base64)
  const id        = crypto.randomUUID()
  const extension = 'jpg'
  const path      = `archforms-lab/photos/${id}.${extension}`
  await Filesystem.writeFile({
    path,
    data: compressed.base64,
    directory: Directory.Data,
    recursive: true,
  })
  const row: StoredPhoto = {
    id,
    path,
    mimeType:  'image/jpeg',
    features:  input.features,
    sizeBytes: compressed.sizeBytes,
    checksum:  compressed.checksum,
    createdAt: new Date().toISOString(),
  }
  await writeIndex(PHOTO_KEY, [...await readIndex<StoredPhoto>(PHOTO_KEY), row])
  return { ...row, displayUrl: `data:image/jpeg;base64,${compressed.base64}` }
}

// ── Audio ────────────────────────────────────────────────────────────────────
async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer())
}

export async function loadAudioClips(): Promise<AudioClip[]> {
  const rows = await readIndex<StoredAudio>(AUDIO_KEY)
  return Promise.all(rows.map(async row => ({
    ...row,
    displayUrl: row.path.startsWith('file:')
      ? Capacitor.convertFileSrc(row.path)
      : await readDisplayUrl(row.path, row.mimeType),
  })))
}

export async function saveAudioClip(blob: Blob, durationMs: number): Promise<AudioClip> {
  const id        = crypto.randomUUID()
  const mimeType  = blob.type || 'audio/webm'
  const extension = mimeType.includes('mp4') ? 'm4a' : 'webm'
  const path      = `archforms-lab/audio/${id}.${extension}`
  const bytes     = await blobToBytes(blob)
  const checksum  = await sha256(bytes)
  const base64    = btoa(Array.from(bytes).map(b => String.fromCharCode(b)).join(''))
  await Filesystem.writeFile({ path, data: base64, directory: Directory.Data, recursive: true })
  const row: StoredAudio = {
    id, path, mimeType, durationMs,
    sizeBytes: bytes.length,
    checksum,
    createdAt: new Date().toISOString(),
  }
  await writeIndex(AUDIO_KEY, [...await readIndex<StoredAudio>(AUDIO_KEY), row])
  return { ...row, displayUrl: `data:${mimeType};base64,${base64}` }
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

  const row: StoredAudio = {
    id:        crypto.randomUUID(),
    path:      recording.uri,
    mimeType:  recording.mimeType,
    durationMs: recording.durationMs,
    sizeBytes,
    checksum,
    createdAt: new Date().toISOString(),
  }
  await writeIndex(AUDIO_KEY, [...await readIndex<StoredAudio>(AUDIO_KEY), row])
  return { ...row, displayUrl: Capacitor.convertFileSrc(recording.uri) }
}

// ── Capture Groups ────────────────────────────────────────────────────────────
export async function loadCaptureGroups(visitaId: string): Promise<CaptureGroup[]> {
  const rows = await readIndex<CaptureGroup>(GROUP_KEY)
  return rows.filter(g => g.visitaId === visitaId)
}

/** Single group by id (used by the sync payload resolver). */
export async function loadCaptureGroup(groupId: string): Promise<CaptureGroup | null> {
  const rows = await readIndex<CaptureGroup>(GROUP_KEY)
  return rows.find(g => g.id === groupId) ?? null
}

export async function saveCaptureGroup(
  visitaId:    string,
  photos:      LabPhoto[],
  audio:       AudioClip,
): Promise<CaptureGroup> {
  return locked(async () => {
    const id    = crypto.randomUUID()
    const group: CaptureGroup = {
      id,
      visitaId,
      photos,
      audio,
      transcripcionStatus: 'pending',
      createdAt:           new Date().toISOString(),
      syncStatus:          'pending',
    }
    await writeIndex(GROUP_KEY, [...await readIndex<CaptureGroup>(GROUP_KEY), group])
    return group
  })
}

export async function updateCaptureGroupSyncStatus(
  groupId:    string,
  syncStatus: CaptureGroup['syncStatus'],
): Promise<void> {
  return locked(async () => {
    const groups  = await readIndex<CaptureGroup>(GROUP_KEY)
    const updated = groups.map(g => g.id === groupId ? { ...g, syncStatus } : g)
    await writeIndex(GROUP_KEY, updated)
  })
}

export async function updateCaptureGroupTranscription(groupId: string, text: string): Promise<void> {
  return locked(async () => {
    const groups  = await readIndex<CaptureGroup>(GROUP_KEY)
    const updated = groups.map(g =>
      g.id === groupId ? { ...g, transcripcion: text, transcripcionStatus: 'done' } : g
    )
    await writeIndex(GROUP_KEY, updated)
  })
}

export async function updateCaptureGroupTranscriptionStatus(
  groupId: string,
  status:  string,
  error?:  string,
): Promise<void> {
  return locked(async () => {
    const groups  = await readIndex<CaptureGroup>(GROUP_KEY)
    const updated = groups.map(g =>
      g.id === groupId ? { ...g, transcripcionStatus: status, transcripcionError: error } : g
    )
    await writeIndex(GROUP_KEY, updated)
  })
}

// ── Remote mirror (pull nube → local) ────────────────────────────────────────
// Upserts a group hydrated from Supabase. Only called for groups WITHOUT local
// pending rows (the planner skips dirty ones: local wins while dirty).
// transcripcionStatus 'remote' = traída de la nube; nada la transcribirá local.
export async function upsertRemoteGroup(input: {
  id:             string
  visitaId:       string
  photos:         LabPhoto[]
  audio:          AudioClip
  transcripcion:  string | null
  iniciadoAt:     string
}): Promise<CaptureGroup> {
  return locked(async () => {
    const group: CaptureGroup = {
      id:                  input.id,
      visitaId:            input.visitaId,
      photos:              input.photos,
      audio:               input.audio,
      transcripcion:       input.transcripcion ?? undefined,
      transcripcionStatus: input.transcripcion ? 'done' : 'remote',
      createdAt:           input.iniciadoAt,
      syncStatus:          'synced',
    }
    const rows = await readIndex<CaptureGroup>(GROUP_KEY)
    const idx  = rows.findIndex(g => g.id === input.id)
    await writeIndex(
      GROUP_KEY,
      idx >= 0 ? rows.map((g, i) => (i === idx ? group : g)) : [...rows, group],
    )
    return group
  })
}

// ── Clear all lab data (debug / reset) ──────────────────────────────────────
export async function clearLabData(photos: LabPhoto[], clips: AudioClip[]) {
  await Promise.allSettled([
    ...photos.map(({ path }) => Filesystem.deleteFile({ path, directory: Directory.Data })),
    ...clips
      .filter(({ path }) => !path.startsWith('file:'))
      .map(({ path }) => Filesystem.deleteFile({ path, directory: Directory.Data })),
  ])
  await Promise.all([
    Preferences.remove({ key: PHOTO_KEY }),
    Preferences.remove({ key: AUDIO_KEY }),
    Preferences.remove({ key: GROUP_KEY }),
  ])
}
