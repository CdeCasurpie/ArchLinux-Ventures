import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { CameraPreview } from '@capacitor-community/camera-preview';
import { ArchFormsAudio } from './native-audio';
import { extractLocalFeatures } from './local-features';
import { savePhoto, saveNativeAudioShell, computeRecordingChecksum, updateAudioClipChecksum, loadCaptureGroup, createCaptureGroup, persistCaptureGroup, type LabPhoto } from './lab-storage';
import { enqueueGroupToOutbox, runMigrationIfNeeded, triggerMediaSync, notifyTranscriptionReady, notifyLocalChange, notifyGroupCreated } from './media-sync';
import { mediaOutbox } from '../platform';
import type { Visita } from '@archforms/domain';

const MicIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
  </svg>
);

const StopIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 6h12v12H6z"/>
  </svg>
);

export function VisitCapture({
  visita,
  ownerId,
  onGroupSaved,
  active = true,
}: {
  visita: Visita
  ownerId: string
  onGroupSaved: () => void
  /** false cuando el tab está oculto (se mantiene montado para no perder estado). */
  active?: boolean
}) {
  const [photos, setPhotos]             = useState<LabPhoto[]>([]);
  const [cameraOn, setCameraOn]         = useState(false);
  const [flash, setFlash]               = useState(false);
  const [recorderState, setRecorderState] = useState<'idle'|'recording'|'saving'|'saved'>('idle');
  const [elapsed, setElapsed]           = useState(0);
  const viewportRef                     = useRef<HTMLDivElement>(null);
  // TikTok-style fullscreen capture, solo nativo. Web conserva el layout actual.
  const tiktok = Capacitor.isNativePlatform();

  // Altura real del mobile-nav (incluye safe-area): la capa fija termina justo encima.
  const [navH, setNavH] = useState(0);
  useLayoutEffect(() => {
    if (!tiktok) return;
    const measure = () => {
      const el = document.querySelector('.mobile-nav');
      setNavH(el ? Math.ceil(el.getBoundingClientRect().height) : 0);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [tiktok, active]);

  // One-time migration: groups captured before the outbox existed enter the queue.
  useEffect(() => {
    runMigrationIfNeeded(mediaOutbox, visita.id, ownerId)
      .then(() => triggerMediaSync())
      .catch(console.error);
  }, [visita.id, ownerId]);

  useEffect(() => {
    return () => {
      document.body.classList.remove('camera-active');
      document.documentElement.classList.remove('camera-active');
      CameraPreview.stop().catch(() => {});
    };
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (recorderState === 'recording') {
      interval = setInterval(() => setElapsed(e => e + 1000), 1000);
    }
    return () => clearInterval(interval);
  }, [recorderState]);

  useEffect(() => {
    if (!tiktok || active || !cameraOn) return;
    // Al salir del tab con la cámara prendida: apagar el preview para que los
    // otros tabs no hereden el fondo transparente (antes lo hacía el unmount).
    document.body.classList.remove('camera-active');
    document.documentElement.classList.remove('camera-active');
    CameraPreview.stop().catch(() => {});
    setCameraOn(false);
  }, [tiktok, active, cameraOn]);

  // El rect del preview nativo es el de la capa fija completa (viewportRef),
  // el mismo que ocupa el visor web: cámara y UI coinciden.
  const synchronizeCamera = () => {
    requestAnimationFrame(() => {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) return;
      void ArchFormsAudio.updateCameraRect({
        x: Math.round(rect.x), y: Math.round(rect.y),
        width: Math.round(rect.width), height: Math.round(rect.height),
      }).catch(() => undefined);
    });
  };

  useEffect(() => {
    if (!cameraOn) return;
    document.body.classList.add('camera-active');
    document.documentElement.classList.add('camera-active');

    synchronizeCamera();
    window.addEventListener('resize', synchronizeCamera);
    return () => {
      document.body.classList.remove('camera-active');
      document.documentElement.classList.remove('camera-active');
      window.removeEventListener('resize', synchronizeCamera);
    };
  }, [cameraOn]);

  // Con display:none el rect mide 0: recalcular al activarse la tab y al cambiar el nav.
  useLayoutEffect(() => {
    if (!tiktok || !active || !cameraOn) return;
    const id = requestAnimationFrame(() => synchronizeCamera());
    return () => cancelAnimationFrame(id);
  }, [tiktok, active, cameraOn, navH]);

  const startCamera = async () => {
    try {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) throw new Error('No se encontró el visor.');
      await CameraPreview.start({
        position: 'rear',
        x: Math.round(rect.x), y: Math.round(rect.y),
        width: Math.round(rect.width), height: Math.round(rect.height),
        toBack: true, storeToFile: false, enableZoom: true, lockAndroidOrientation: true,
      });
      setCameraOn(true);
    } catch (caught) { console.error(caught); }
  };

  const stopCamera = async () => {
    await CameraPreview.stop();
    setCameraOn(false);
    document.body.classList.remove('camera-active');
    document.documentElement.classList.remove('camera-active');
  };

  const takePhoto = async () => {
    try {
      setFlash(true);
      setTimeout(() => setFlash(false), 150);
      const result   = await CameraPreview.capture({ quality: 88 });
      const displayUrl = `data:image/jpeg;base64,${result.value}`;
      const features = await extractLocalFeatures(displayUrl);
      // savePhoto now compresses + computes checksum internally
      const saved    = await savePhoto({ base64: result.value, mimeType: 'image/jpeg', features });
      setPhotos(current => [saved, ...current]);
    } catch (caught) { console.error(caught); }
  };

  const startRecording = async () => {
    try { await ArchFormsAudio.startRecording(); setElapsed(0); setRecorderState('recording'); }
    catch (caught) { console.error(caught); }
  };

  const stopRecording = async () => {
    setRecorderState('saving');
    try {
      const recording = await ArchFormsAudio.stopRecording();
      // 1. Grupo en memoria al instante: Resumen lo muestra ya, sin esperar al disco.
      const audioShell = await saveNativeAudioShell(recording);
      const group = createCaptureGroup(visita.id, photos, audioShell);
      notifyGroupCreated(group);

      setPhotos([]);        // reset for next hallazgo
      onGroupSaved();
      setRecorderState('saved');

      // 2. Por detrás: persistir, checksum → outbox/sync, y transcripción en paralelo.
      // El outbox espera al checksum real (la subida lo necesita); la transcripción
      // solo necesita el archivo, así que arranca de una vez.
      void persistCaptureGroup(group).then(() => notifyLocalChange()).catch(console.error);
      void (async () => {
        try {
          const cc = await computeRecordingChecksum(recording.uri);
          await updateAudioClipChecksum(audioShell.id, cc);
        } catch (caught) { console.error('checksum:', caught); }
        try {
          const fresh = await loadCaptureGroup(group.id);
          if (fresh) await enqueueGroupToOutbox(mediaOutbox, fresh, ownerId);
          await triggerMediaSync();
        } catch (caught) { console.error(caught); }
      })();

      // Background transcription (optional; audio survives if this fails).
      // Every local write notifies subscribers; the finished text additionally
      // requeues the entity so the live payload (rebuilt at push time) carries it.
      import('./whisper-service').then(({ getCachedWhisperModel, ensureWhisperModel, transcribeAudio }) => {
        import('./lab-storage').then(({ updateCaptureGroupTranscription, updateCaptureGroupTranscriptionStatus }) => {
          const runTranscription = (modelPath: string) => {
            updateCaptureGroupTranscriptionStatus(group.id, 'transcribing').then(notifyLocalChange).catch(console.error);
            transcribeAudio(audioShell.path, modelPath).then(text => {
              if (text) {
                updateCaptureGroupTranscription(group.id, text)
                  .then(() => notifyTranscriptionReady(mediaOutbox, group.id))
                  .catch(console.error);
              } else {
                updateCaptureGroupTranscriptionStatus(group.id, 'error', 'No text returned').then(notifyLocalChange).catch(console.error);
              }
            }).catch(err => {
              updateCaptureGroupTranscriptionStatus(group.id, 'error', err.message || String(err)).then(notifyLocalChange).catch(console.error);
            });
          };
          // Solo se muestra "descargando" si el modelo NO está en disco.
          updateCaptureGroupTranscriptionStatus(group.id, 'checking_model').then(notifyLocalChange).catch(console.error);
          getCachedWhisperModel().then(cachedPath => {
            if (cachedPath) {
              runTranscription(cachedPath);
            } else {
              updateCaptureGroupTranscriptionStatus(group.id, 'downloading_model').then(notifyLocalChange).catch(console.error);
              ensureWhisperModel().then(({ path }) => {
                if (path) runTranscription(path);
                else updateCaptureGroupTranscriptionStatus(group.id, 'error', 'Model path is empty').then(notifyLocalChange).catch(console.error);
              }).catch(err => {
                updateCaptureGroupTranscriptionStatus(group.id, 'error', 'Model DL Error: ' + (err.message || String(err))).then(notifyLocalChange).catch(console.error);
              });
            }
          }).catch(console.error);
        });
      }).catch(console.error);

      setTimeout(() => setRecorderState('idle'), 3000);
      setElapsed(0);
    }
    catch (caught) { console.error(caught); setRecorderState('idle'); setElapsed(0); }
  };

  const formatDuration = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  // (tiktok se declara arriba, junto a los estados).

  // Bloquea el scroll de la página solo mientras la captura está visible
  // (el componente queda montado entre tabs para no perder estado).
  useEffect(() => {
    if (!tiktok || !active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [tiktok, active]);
  const pile = photos.slice(0, 5);
  const pileOverflow = photos.length > 5 ? photos.length - 4 : 0;

  // Web conserva su layout actual (sin cambios de comportamiento).
  if (!tiktok) {
    return (
      <article className="capture-layout" style={{ paddingBottom: '40px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ position: 'sticky', top: '70px', zIndex: 10, padding: '15px' }}>
          <div ref={viewportRef} className={`camera-viewport ${cameraOn ? 'live' : ''}`} style={{ width: '100%', height: '48vh', background: cameraOn ? 'transparent' : '#e7eef4', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', borderRadius: '16px' }}>
            {!cameraOn && <span style={{color: '#81909d', fontWeight: 800, textTransform: 'uppercase', fontSize: 11, letterSpacing: 1}}>Visor apagado</span>}
            {flash && <div style={{ position: 'absolute', inset: 0, border: '6px solid white', background: 'rgba(255,255,255,0.6)', borderRadius: 16, zIndex: 100, transition: '0.1s' }}></div>}
          </div>
        </div>

        <div style={{ padding: '20px 15px', background: '#f2f5f9', flex: 1, zIndex: 11, position: 'relative' }}>
          <div className="actions" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 25 }}>
            <button className="btn btn-secondary" style={{ padding: '16px 0', fontSize: 13, background: 'white' }} onClick={cameraOn ? stopCamera : startCamera}>
              {cameraOn ? 'Apagar cámara' : 'Encender cámara'}
            </button>
            <button className="btn btn-primary" style={{ padding: '16px 0', fontSize: 13 }} onClick={takePhoto} disabled={!cameraOn}>
              Tomar foto
            </button>
          </div>

          <div className="audio-section" style={{ marginBottom: 25 }}>
            <button
              className={`btn ${recorderState === 'recording' ? 'btn-danger' : 'btn-secondary'}`}
              style={{ width: '100%', minHeight: 65, fontSize: 16, display: 'flex', alignItems: 'center', justifyItems: 'center', gap: 12, justifyContent: 'center', borderRadius: 16, background: recorderState === 'recording' ? '' : 'white' }}
              onClick={recorderState === 'recording' ? stopRecording : startRecording}
              disabled={recorderState === 'saving' || recorderState === 'saved' || (!cameraOn && photos.length === 0 && recorderState === 'idle')}
            >
              <span style={{ display: 'flex', opacity: 0.8 }}>
                {recorderState === 'recording' ? <StopIcon /> : <MicIcon />}
              </span>
              {recorderState === 'recording'
                ? `Detener y agrupar (${formatDuration(elapsed)})`
                : recorderState === 'saving' ? 'Guardando...'
                : recorderState === 'saved'  ? '¡Hallazgo guardado!'
                : 'Grabar audio y agrupar'}
            </button>
            {photos.length === 0 && recorderState === 'idle' && (
              <p style={{ fontSize: 11, textAlign: 'center', marginTop: 10, color: '#81909d' }}>
                Toma al menos una foto para iniciar un hallazgo.
              </p>
            )}
          </div>

          {photos.length > 0 && (
            <div className="photos-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 25 }}>
              {photos.map((photo) => (
                <div key={photo.id} style={{ borderRadius: 12, overflow: 'hidden', background: 'white', border: '1px solid var(--line)', animation: 'pop 0.3s ease both' }}>
                  <img src={photo.displayUrl} alt="Foto actual" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
                </div>
              ))}
            </div>
          )}
        </div>
      </article>
    );
  }

  // Nativo: capa fija a pantalla completa, detrás de la cabecera única y encima
  // del mobile-nav. El visor ocupa toda la capa: este mismo rect se envía a la
  // cámara nativa, así preview y UI coinciden. Sin box-shadow de 9999px.
  return (
    <div style={{ display: active ? '' : 'none' }}>
      <div ref={viewportRef} className={`capture-native-layer camera-viewport ${cameraOn ? 'live' : ''}`} style={{ bottom: navH > 0 ? `${navH}px` : undefined, background: cameraOn ? 'transparent' : undefined }}>
        {!cameraOn && (
          <div className="capture-native-empty">
            <span>Visor apagado</span>
            <small>Enciende la cámara para iniciar la inspección</small>
          </div>
        )}
        {flash && <div className="capture-flash" />}

        {pile.length > 0 && (
          <div className="capture-pile">
            {pile.map((photo, i) => (
              <div key={photo.id} className="capture-pile-thumb">
                <img src={photo.displayUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                {i === 4 && pileOverflow > 0 && (
                  <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', color: 'white', fontWeight: 800, fontSize: 13 }}>
                    +{pileOverflow}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="capture-controls">
          <div className="actions" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <button className="btn btn-secondary" style={{ padding: '16px 0', fontSize: 13, background: 'white' }} onClick={cameraOn ? stopCamera : startCamera}>
              {cameraOn ? 'Apagar cámara' : 'Encender cámara'}
            </button>
            <button className="btn btn-primary" style={{ padding: '16px 0', fontSize: 13 }} onClick={takePhoto} disabled={!cameraOn}>
              Tomar foto
            </button>
          </div>

          <div className="audio-section">
            <button
              className={`btn ${recorderState === 'recording' ? 'btn-danger' : 'btn-secondary'}`}
              style={{ width: '100%', minHeight: 65, fontSize: 16, display: 'flex', alignItems: 'center', justifyItems: 'center', gap: 12, justifyContent: 'center', borderRadius: 16, background: recorderState === 'recording' ? '' : 'white' }}
              onClick={recorderState === 'recording' ? stopRecording : startRecording}
              disabled={recorderState === 'saving' || recorderState === 'saved' || (!cameraOn && photos.length === 0 && recorderState === 'idle')}
            >
              <span style={{ display: 'flex', opacity: 0.8 }}>
                {recorderState === 'recording' ? <StopIcon /> : <MicIcon />}
              </span>
              {recorderState === 'recording'
                ? `Detener y agrupar (${formatDuration(elapsed)})`
                : recorderState === 'saving' ? 'Guardando...'
                : recorderState === 'saved'  ? '¡Hallazgo guardado!'
                : 'Grabar audio y agrupar'}
            </button>
            {photos.length === 0 && recorderState === 'idle' && (
              <p style={{ fontSize: 11, textAlign: 'center', marginTop: 10, color: 'rgba(255,255,255,0.85)' }}>
                Toma al menos una foto para iniciar un hallazgo.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
