import { Directory, Filesystem } from '@capacitor/filesystem';
import { Whisper } from 'capacitor-whisper';

// MODELS AVAILABLE:
// ggml-tiny-q5_1.bin -> 31MB (Quantized, faster, recommended)
// ggml-tiny.bin      -> 75MB (FP16, original size)

const USE_QUANTIZED = true; 

const MODEL_FILENAME = USE_QUANTIZED ? 'ggml-tiny-q5_1.bin' : 'ggml-tiny.bin';
const MODEL_URL = `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/${MODEL_FILENAME}`;

export async function ensureWhisperModel(): Promise<string> {
  try {
    const stat = await Filesystem.stat({
      path: MODEL_FILENAME,
      directory: Directory.Data
    });
    // Remove file:// prefix for the plugin if needed, though plugin handles it
    return stat.uri.replace('file://', '');
  } catch (e) {
    console.log(`Downloading whisper model... (${USE_QUANTIZED ? '31MB' : '75MB'})`);
    const result = await Filesystem.downloadFile({
      url: MODEL_URL,
      path: MODEL_FILENAME,
      directory: Directory.Data
    });
    console.log('Model downloaded to:', result.path);
    return result.path?.replace('file://', '') || '';
  }
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
