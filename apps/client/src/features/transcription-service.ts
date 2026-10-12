import { Network } from '@capacitor/network';
import { mediaOutbox } from '../platform';
import { transcribeQueue } from './job-queue';
import {
  loadAllGroups, loadCaptureGroup, setRuntimeTranscriptionStatus,
  updateCaptureGroupTranscription, updateCaptureGroupTranscriptionStatus,
} from './lab-storage';
import { notifyLocalChange, notifyTranscriptionReady } from './media-sync';

const MAX_AUDIO_MS = 600_000; // límite de capacitor-whisper
const active = new Set<string>();
const waitingModel = new Set<string>();
const setRuntime = (id: string, s: string | null) => { setRuntimeTranscriptionStatus(id, s); notifyLocalChange(); };

async function run(groupId: string) {
  const g = await loadCaptureGroup(groupId);
  if (!g || g.transcripcion || g.transcripcionStatus === 'remote') { setRuntime(groupId, null); return; }
  if (g.audio.durationMs > MAX_AUDIO_MS) {
    await updateCaptureGroupTranscriptionStatus(groupId, 'error', 'Audio de más de 600 s: supera el límite del plugin de transcripción');
    setRuntime(groupId, null); return;
  }
  const whisper = await import('./whisper-service');

  setRuntime(groupId, 'checking_model');
  let model = await whisper.getCachedWhisperModel();
  if (!model) {
    if (!(await Network.getStatus()).connected) { waitingModel.add(groupId); setRuntime(groupId, 'waiting_model'); return; }
    setRuntime(groupId, 'downloading_model');
    try { model = (await whisper.ensureWhisperModel()).path; }
    catch (e) { console.error(e); waitingModel.add(groupId); setRuntime(groupId, 'waiting_model'); return; }
  }
  setRuntime(groupId, 'transcribing');
  try {
    const text = await whisper.transcribeAudio(g.audio.path, model);
    if (!text) { await updateCaptureGroupTranscriptionStatus(groupId, 'error', 'No text returned'); setRuntime(groupId, null); return; }
    await updateCaptureGroupTranscription(groupId, text);
    setRuntime(groupId, null);
    await notifyTranscriptionReady(mediaOutbox, groupId);
  } catch (e) {
    await updateCaptureGroupTranscriptionStatus(groupId, 'error', e instanceof Error ? e.message : String(e));
    setRuntime(groupId, null);
  }
}

export const transcriptionService = {
  enqueue(groupId: string) {
    if (active.has(groupId)) return;
    active.add(groupId);
    setRuntime(groupId, 'pending');
    void transcribeQueue.enqueue(`whisper:${groupId}`, () => run(groupId))
      .catch(e => console.error('transcription', e))
      .finally(() => active.delete(groupId));
  },
  /** Al arrancar: reencola lo que quedó sin transcribir (incluye estados transitorios legacy). */
  async recover() {
    for (const g of await loadAllGroups()) {
      const s = g.transcripcionStatus;
      if (g.transcripcion || s === 'remote' || s === 'done' || s === 'error') continue;
      this.enqueue(g.id);
    }
  },
  start() {
    void Network.addListener('networkStatusChange', ({ connected }) => {
      if (!connected) return;
      waitingModel.forEach(id => { waitingModel.delete(id); this.enqueue(id); });
    });
    setTimeout(() => void this.recover().catch(console.error), 5000);
  },
};
