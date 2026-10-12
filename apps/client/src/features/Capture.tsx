import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Filesystem } from '@capacitor/filesystem';
import { CameraPreview } from '@capacitor-community/camera-preview';
import { ArchFormsAudio } from './native-audio';
import { extractLocalFeatures } from './local-features';
import { perfLog } from './perf';
import { captureActivity } from './activity';
import { idleQueue } from './job-queue';
import {
  savePhoto, saveNativeAudioShell, computeRecordingChecksum, updateAudioClipChecksum,
  loadCaptureGroup, loadDraftPhotos, createCaptureGroup, commitGroupPhotos, removeDraftPhotos,
  fileUrl, photoPath, ingestCapturedPhoto, registerGroupInMemory,
  type IngestResult, type LabPhoto,
} from './lab-storage';
import { enqueueGroupToOutbox, runMigrationIfNeeded, triggerMediaSync, notifyLocalChange, notifyGroupCreated } from './media-sync';
import { transcriptionService } from './transcription-service';
import { mediaOutbox } from '../platform';
import type { Visita } from '@archforms/domain';
import type { NativeRecording } from './native-audio';

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

const PHOTO_W = 1920, PHOTO_H = 1440, PHOTO_QUALITY = 82;

function CaptureActions({ cameraOn, recorderState, justSaved, elapsed, photoCount, compact, onToggleCamera, onTakePhoto, onRecord, formatDuration }: {
  cameraOn: boolean
  recorderState: 'idle' | 'recording' | 'saving'
  justSaved: boolean
  elapsed: number
  photoCount: number
  compact: boolean
  onToggleCamera: () => void
  onTakePhoto: () => void
  onRecord: () => void
  formatDuration: (ms: number) => string
}) {
  return (
    <>
      <div className="actions" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: compact ? 12 : 25 }}>
        <button className="btn btn-secondary" style={{ padding: '16px 0', fontSize: 13, background: 'white' }} onClick={onToggleCamera}>
          {cameraOn ? 'Apagar cámara' : 'Encender cámara'}
        </button>
        <button className="btn btn-primary" style={{ padding: '16px 0', fontSize: 13 }} onClick={onTakePhoto} disabled={!cameraOn}>
          Tomar foto
        </button>
      </div>

      <div className="audio-section" style={compact ? undefined : { marginBottom: 25 }}>
        <button
          className={`btn ${recorderState === 'recording' ? 'btn-danger' : 'btn-secondary'}`}
          style={{ width: '100%', minHeight: 65, fontSize: 16, display: 'flex', alignItems: 'center', justifyItems: 'center', gap: 12, justifyContent: 'center', borderRadius: 16, background: recorderState === 'recording' ? '' : 'white' }}
          onClick={onRecord}
          disabled={recorderState === 'saving' || (!cameraOn && photoCount === 0 && recorderState === 'idle')}
        >
          <span style={{ display: 'flex', opacity: 0.8 }}>
            {recorderState === 'recording' ? <StopIcon /> : <MicIcon />}
          </span>
          {recorderState === 'recording'
            ? `Detener y agrupar (${formatDuration(elapsed)})`
            : recorderState === 'saving' ? 'Guardando...'
            : justSaved  ? '¡Hallazgo guardado!'
            : 'Grabar audio y agrupar'}
        </button>
      </div>
    </>
  );
}

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
  const [photos, setPhotosState]      = useState<LabPhoto[]>([]);
  const [cameraOn, setCameraOn]         = useState(false);
  const [flash, setFlash]               = useState(false);
  const [recorderState, setRecorderState] = useState<'idle'|'recording'|'saving'>('idle');
  const [elapsed, setElapsed]           = useState(0);
  const [justSaved, setJustSaved]       = useState(false);
  const viewportRef                     = useRef<HTMLDivElement>(null);
  // TikTok-style fullscreen capture, solo nativo. Web conserva el layout actual.
  const tiktok = Capacitor.isNativePlatform();

  const pileRef      = useRef<LabPhoto[]>([]);
  const ingestJobs   = useRef(new Map<string, Promise<IngestResult>>());
  const tmpUris      = useRef(new Map<string, string>());
  const captureChain = useRef<Promise<void>>(Promise.resolve());
  const savedTimer   = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const setPile = (next: LabPhoto[]) => { pileRef.current = next; setPhotosState(next); };

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
    captureActivity.setTabActive(active);
  }, [active]);

  useEffect(() => {       // restaurar el hallazgo en curso si Android mató la app
    if (!tiktok) return;
    let alive = true;
    loadDraftPhotos(visita.id).then(r => { if (alive && r.length) setPile([...r, ...pileRef.current]); });
    return () => { alive = false; };
  }, [visita.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      clearTimeout(savedTimer.current);
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
        toBack: true, storeToFile: true, enableZoom: true, lockAndroidOrientation: true,
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

  // Web: pipeline actual intacto (compressPhoto + savePhoto).
  const takePhotoWeb = async () => {
    const t0 = performance.now();
    try {
      setFlash(true);
      setTimeout(() => setFlash(false), 150);
      const result   = await CameraPreview.capture({ quality: 88 });
      perfLog('capture-nativo', performance.now() - t0);
      const displayUrl = `data:image/jpeg;base64,${result.value}`;
      const features = await extractLocalFeatures(displayUrl);
      // savePhoto now compresses + computes checksum internally
      const saved    = await savePhoto({ base64: result.value, mimeType: 'image/jpeg', features });
      setPile([saved, ...pileRef.current]);
      perfLog('toque→pila', performance.now() - t0);
    } catch (caught) { console.error(caught); }
  };

  const takePhoto = () => {
    if (!tiktok) { void takePhotoWeb(); return; }       // web: pipeline actual intacto
    setFlash(true); setTimeout(() => setFlash(false), 150);
    captureActivity.touch();
    captureChain.current = captureChain.current.then(async () => {   // serializa la llamada nativa, no bloquea el botón
      const t0 = performance.now();
      try {
        const { value } = await CameraPreview.capture({ quality: PHOTO_QUALITY, width: PHOTO_W, height: PHOTO_H });
        const tmpUri = value.startsWith('file:') ? value : `file://${value}`;
        const id = crypto.randomUUID();
        const createdAt = new Date().toISOString();
        const photo: LabPhoto = {
          id, path: photoPath(id), mimeType: 'image/jpeg', features: [],
          sizeBytes: 0, checksum: '', createdAt, displayUrl: Capacitor.convertFileSrc(tmpUri),
        };
        tmpUris.current.set(id, tmpUri);
        setPile([photo, ...pileRef.current]);             // aparece de inmediato
        ingestJobs.current.set(id, ingestCapturedPhoto({ id, tmpUri, visitaId: visita.id, createdAt }));
        perfLog('toque→pila', performance.now() - t0);
      } catch (e) { console.error(e); }
    });
  };

  const startRecording = async () => {
    try {
      clearTimeout(savedTimer.current); setJustSaved(false);
      await ArchFormsAudio.startRecording();
      captureActivity.setRecording(true);
      setElapsed(0); setRecorderState('recording');
    } catch (e) { console.error(e); }
  };
  const flashSaved = () => {
    clearTimeout(savedTimer.current); setJustSaved(true);
    savedTimer.current = setTimeout(() => setJustSaved(false), 1500);
  };

  const stopRecording = async () => {
    setRecorderState('saving');
    try {
      const recording = await ArchFormsAudio.stopRecording();
      captureActivity.setRecording(false);
      await captureChain.current;                         // fotos con capture() en vuelo entran a ESTE hallazgo
      const snapshot = pileRef.current;
      setPile([]);                                        // workspace limpio: ya se puede seguir
      const audioShell = await saveNativeAudioShell(recording);    // sin I/O
      const group = createCaptureGroup(visita.id, snapshot, audioShell);
      registerGroupInMemory(group);                       // el store ya lo tiene
      notifyGroupCreated(group);                          // Resumen lo muestra al instante
      onGroupSaved();
      setRecorderState('idle'); setElapsed(0); flashSaved();
      void finalizeGroup(group, recording).catch(console.error);
    }
    catch (caught) { console.error(caught); setRecorderState('idle'); setElapsed(0); }
  };

  const finalizeGroup = async (group: { id: string; photos: LabPhoto[]; audio: { id: string } }, recording: NativeRecording) => {
    const results = await Promise.allSettled(group.photos.map(p =>
      ingestJobs.current.get(p.id) ?? Promise.resolve({ sizeBytes: p.sizeBytes, checksum: p.checksum })));  // fotos restauradas del draft ya están en disco
    const photos: LabPhoto[] = [];
    for (const [i, p] of group.photos.entries()) {
      const r = results[i];
      if (r.status === 'fulfilled') photos.push({ ...p, ...r.value, displayUrl: await fileUrl(p.path, p.mimeType) });
      else console.error('foto descartada (falló el guardado):', p.id, r.reason);
    }
    await commitGroupPhotos(group.id, photos);                   // JSON en disco, esperado
    removeDraftPhotos(visita.id, group.photos.map(p => p.id));
    notifyLocalChange();
    transcriptionService.enqueue(group.id);

    await idleQueue.enqueue(`audio-checksum:${group.audio.id}`, async () => {
      try { await updateAudioClipChecksum(group.audio.id, await computeRecordingChecksum(recording.uri)); }
      catch (e) { console.error('checksum:', e); }
    });
    const fresh = await loadCaptureGroup(group.id);
    if (fresh) await enqueueGroupToOutbox(mediaOutbox, fresh, ownerId);   // recién ahora: grupo ya en disco
    await triggerMediaSync();

    const toDelete = group.photos.map(p => tmpUris.current.get(p.id)).filter((u): u is string => !!u);
    group.photos.forEach(p => { ingestJobs.current.delete(p.id); tmpUris.current.delete(p.id); });
    setTimeout(() => toDelete.forEach(uri =>
      void Filesystem.deleteFile({ path: uri }).catch(() => undefined)), 10_000);  // margen para que la UI cambie de URL
  };

  const formatDuration = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

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
  const actions = (
    <CaptureActions
      cameraOn={cameraOn} recorderState={recorderState} justSaved={justSaved}
      elapsed={elapsed} photoCount={photos.length} compact={tiktok}
      onToggleCamera={cameraOn ? stopCamera : startCamera} onTakePhoto={takePhoto}
      onRecord={recorderState === 'recording' ? stopRecording : startRecording}
      formatDuration={formatDuration}
    />
  );

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
          {actions}

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
          {actions}
        </div>
      </div>
    </div>
  );
}
