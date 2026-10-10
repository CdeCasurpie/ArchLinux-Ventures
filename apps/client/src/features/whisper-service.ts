import { Directory, Filesystem } from '@capacitor/filesystem';
import { Whisper } from 'capacitor-whisper';

// MODELS AVAILABLE:
// ggml-tiny-q5_1.bin -> 31MB (Quantized, faster, recommended)
// ggml-tiny.bin      -> 75MB (FP16, original size)

const USE_QUANTIZED = true; 

const MODEL_FILENAME = USE_QUANTIZED ? 'ggml-tiny-q5_1.bin' : 'ggml-tiny.bin';
const MODEL_URL = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${MODEL_FILENAME}`;

let cachedModelPath: string | null = null;
let inflight: Promise<{ path: string; cached: boolean }> | null = null;

/** Ruta del modelo si ya está en Directory.Data, null si hay que descargarlo. */
export async function getCachedWhisperModel(): Promise<string | null> {
  if (cachedModelPath) return cachedModelPath;
  try {
    const stat = await Filesystem.stat({
      path: MODEL_FILENAME,
      directory: Directory.Data
    });
    // Remove file:// prefix for the plugin if needed, though plugin handles it
    cachedModelPath = stat.uri.replace('file://', '');
    return cachedModelPath;
  } catch {
    return null;
  }
}

export async function ensureWhisperModel(): Promise<{ path: string; cached: boolean }> {
  const hit = await getCachedWhisperModel();
  if (hit) return { path: hit, cached: true };
  // Dedup: varios hallazgos seguidos comparten la misma descarga.
  if (inflight) return inflight;
  console.log(`Downloading whisper model... (${USE_QUANTIZED ? '31MB' : '75MB'})`);
  inflight = (async () => {
    try {
      const result = await Filesystem.downloadFile({
        url: MODEL_URL,
        path: MODEL_FILENAME,
        directory: Directory.Data
      });
      console.log('Model downloaded to:', result.path);
      const p = result.path?.replace('file://', '') || '';
      if (!p) throw new Error('Model path is empty');
      cachedModelPath = p;
      return { path: p, cached: false };
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export async function transcribeAudio(audioUri: string, modelPath: string): Promise<string> {
  try {
    const result = await Whisper.transcribe({
      path: audioUri,
      model: modelPath,
      language: 'es'
    });
    
    if (result && result.segments) {
      return result.segments.map((s: any) => s.text).join(' ').trim();
    }
    return '';
  } catch (err) {
    console.error('Transcription error:', err);
    throw err;
  }
}
