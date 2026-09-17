import { Directory, Filesystem } from '@capacitor/filesystem'
import { Preferences } from '@capacitor/preferences'
import { Capacitor } from '@capacitor/core'
import type { LocalFeature } from './local-features'
import type { NativeRecording } from './native-audio'

const PHOTO_KEY = 'archforms-lab-photos-v1'
const AUDIO_KEY = 'archforms-lab-audio-v1'

export type LabPhoto = {
  id: string
  path: string
  mimeType: string
  features: LocalFeature[]
  createdAt: string
  displayUrl: string
}

export type AudioClip = {
  id: string
  path: string
  mimeType: string
  durationMs: number
  sizeBytes: number
  createdAt: string
  displayUrl: string
}

type StoredPhoto = Omit<LabPhoto, 'displayUrl'>
type StoredAudio = Omit<AudioClip, 'displayUrl'>

async function readIndex<T>(key: string): Promise<T[]> {
  const { value } = await Preferences.get({ key })
  if (!value) return []
  try {
    return JSON.parse(value) as T[]
  } catch {
    return []
  }
}

const writeIndex = <T,>(key: string, rows: T[]) =>
  Preferences.set({ key, value: JSON.stringify(rows) })

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

async function readDisplayUrl(path: string, mimeType: string): Promise<string> {
  const { data } = await Filesystem.readFile({ path, directory: Directory.Data })
  return typeof data === 'string'
    ? `data:${mimeType};base64,${data}`
    : URL.createObjectURL(data)
}

export async function loadPhotos(): Promise<LabPhoto[]> {
  const rows = await readIndex<StoredPhoto>(PHOTO_KEY)
  return Promise.all(rows.map(async (row) => ({
    ...row,
    displayUrl: await readDisplayUrl(row.path, row.mimeType),
  })))
}

export async function savePhoto(input: {
  base64: string
  mimeType: string
  features: LocalFeature[]
}): Promise<LabPhoto> {
  const id = crypto.randomUUID()
  const extension = input.mimeType.includes('png') ? 'png' : 'jpg'
  const path = `archforms-lab/photos/${id}.${extension}`
  await Filesystem.writeFile({
    path,
    data: input.base64,
    directory: Directory.Data,
    recursive: true,
  })
  const row: StoredPhoto = {
    id,
    path,
    mimeType: input.mimeType,
    features: input.features,
    createdAt: new Date().toISOString(),
  }
  await writeIndex(PHOTO_KEY, [...await readIndex<StoredPhoto>(PHOTO_KEY), row])
  return { ...row, displayUrl: `data:${input.mimeType};base64,${input.base64}` }
}

export async function loadAudioClips(): Promise<AudioClip[]> {
  const rows = await readIndex<StoredAudio>(AUDIO_KEY)
  return Promise.all(rows.map(async (row) => ({
    ...row,
    displayUrl: row.path.startsWith('file:') ? Capacitor.convertFileSrc(row.path) : await readDisplayUrl(row.path, row.mimeType),
  })))
}

export async function saveAudioClip(blob: Blob, durationMs: number): Promise<AudioClip> {
  const id = crypto.randomUUID()
  const mimeType = blob.type || 'audio/webm'
  const extension = mimeType.includes('mp4') ? 'm4a' : 'webm'
  const path = `archforms-lab/audio/${id}.${extension}`
  const base64 = await blobToBase64(blob)
  await Filesystem.writeFile({ path, data: base64, directory: Directory.Data, recursive: true })
  const row: StoredAudio = {
    id,
    path,
    mimeType,
    durationMs,
    sizeBytes: blob.size,
    createdAt: new Date().toISOString(),
  }
  await writeIndex(AUDIO_KEY, [...await readIndex<StoredAudio>(AUDIO_KEY), row])
  return { ...row, displayUrl: `data:${mimeType};base64,${base64}` }
}

export async function saveNativeAudio(recording: NativeRecording): Promise<AudioClip> {
  const row: StoredAudio = {
    id: crypto.randomUUID(),
    path: recording.uri,
    mimeType: recording.mimeType,
    durationMs: recording.durationMs,
    sizeBytes: recording.sizeBytes,
    createdAt: new Date().toISOString(),
  }
  await writeIndex(AUDIO_KEY, [...await readIndex<StoredAudio>(AUDIO_KEY), row])
  return { ...row, displayUrl: Capacitor.convertFileSrc(recording.uri) }
}

export async function clearLabData(photos: LabPhoto[], clips: AudioClip[]) {
  await Promise.allSettled([
    ...photos.map(({ path }) => Filesystem.deleteFile({ path, directory: Directory.Data })),
    ...clips.filter(({ path }) => !path.startsWith('file:')).map(({ path }) => Filesystem.deleteFile({ path, directory: Directory.Data })),
  ])
  await Promise.all([Preferences.remove({ key: PHOTO_KEY }), Preferences.remove({ key: AUDIO_KEY })])
}
