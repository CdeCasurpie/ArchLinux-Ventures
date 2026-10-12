import { Capacitor } from '@capacitor/core';
import { CameraPreview } from '@capacitor-community/camera-preview';

// Spike temporal (Fase 0.2): validar storeToFile + resolución + EXIF en dispositivo.
// Se expone en window para correrlo desde chrome://inspect. NO es parte del flujo.
export async function spikeCapture() {
  const t0 = performance.now();
  const r = await CameraPreview.capture({ quality: 82, width: 1920, height: 1440 });
  const t1 = performance.now();
  const uri = r.value.startsWith('file:') ? r.value : `file://${r.value}`;
  const blob = await (await fetch(Capacitor.convertFileSrc(uri))).blob();
  const bmp = await createImageBitmap(blob);
  const out = {
    value: r.value.slice(0, 80), nativeMs: Math.round(t1 - t0),
    kb: Math.round(blob.size / 1024), w: bmp.width, h: bmp.height,
  };
  console.log('[spike]', out);
  return out;
}

try {
  (window as unknown as { __spikeCapture?: unknown }).__spikeCapture = spikeCapture;
} catch { /* fuera del WebView */ }
