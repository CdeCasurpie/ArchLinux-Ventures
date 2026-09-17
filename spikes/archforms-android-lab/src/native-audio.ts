import { registerPlugin } from '@capacitor/core'

export type NativeRecording = { uri: string; durationMs: number; sizeBytes: number; mimeType: string }
interface ArchFormsAudioPlugin {
  startRecording(): Promise<void>
  stopRecording(): Promise<NativeRecording>
  deleteRecording(options: { uri: string }): Promise<void>
}
export const ArchFormsAudio = registerPlugin<ArchFormsAudioPlugin>('ArchFormsAudio')
