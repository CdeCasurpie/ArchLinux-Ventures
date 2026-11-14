import { Directory, Filesystem } from '@capacitor/filesystem';
import { Whisper } from 'capacitor-whisper';

// MODELS AVAILABLE:
// ggml-tiny-q5_1.bin -> 31MB (Quantized, faster, recommended)
// ggml-tiny.bin      -> 75MB (FP16, original size)

const USE_QUANTIZED = true;

const MODEL_FILENAME = USE_QUANTIZED ? 'ggml-tiny-q5_1.bin' : 'ggml-tiny.bin';
const MODEL_URL = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${MODEL_FILENAME}`;
// Piso para dar por válido un modelo en disco (una descarga cortada queda muy por debajo).
const MIN_BYTES = USE_QUANTIZED ? 30_000_000 : 70_000_000;
const PART = `${MODEL_FILENAME}.part`;

let inflight: Promise<{ path: string; cached: boolean }> | null = null;

/** Ruta del modelo si está completo en Directory.Data, null si hay que descargarlo. */
export async function getCachedWhisperModel(): Promise<string | null> {
  // stat es barato: verificar en cada intento, incluso si ya se usó el modelo.
  // Una ruta recordada en memoria no garantiza que los pesos sigan en disco.
  try {
    const stat = await Filesystem.stat({
      path: MODEL_FILENAME,
      directory: Directory.Data,
    });
    if (stat.size < MIN_BYTES) return null; // modelo truncado: tratar como ausente
    // Ruta absoluta: el parche Android abre el archivo descargado directamente.
    return stat.uri.replace('file://', '') || null;
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
      // Descarga a .part y solo se publica si está completa: un corte nunca
      // deja un modelo "cacheado" truncado.
      await Filesystem.deleteFile({ path: PART, directory: Directory.Data }).catch(() => undefined);
      await Filesystem.downloadFile({
        url: MODEL_URL,
        path: PART,
        directory: Directory.Data,
      });
      const st = await Filesystem.stat({ path: PART, directory: Directory.Data });
      if (st.size < MIN_BYTES) throw new Error(`Modelo incompleto (${st.size} bytes)`);
      await Filesystem.deleteFile({ path: MODEL_FILENAME, directory: Directory.Data }).catch(() => undefined);
      await Filesystem.rename({ from: PART, to: MODEL_FILENAME, directory: Directory.Data, toDirectory: Directory.Data });
      const final = await Filesystem.stat({ path: MODEL_FILENAME, directory: Directory.Data });
      const p = final.uri.replace('file://', '');
      if (!p) throw new Error('Model path is empty');
      console.log('Model downloaded to:', p);
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
      language: 'es',
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
