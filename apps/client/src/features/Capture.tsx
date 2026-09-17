import { useEffect, useRef, useState } from 'react';
import { CameraPreview } from '@capacitor-community/camera-preview';
import { ArchFormsAudio } from './native-audio';
import { extractLocalFeatures } from './local-features';
import { savePhoto, saveNativeAudio, saveCaptureGroup, type LabPhoto } from './lab-storage';
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

export function VisitCapture({ visita, onGroupSaved }: { visita: Visita, onGroupSaved: () => void }) {
  const [photos, setPhotos] = useState<LabPhoto[]>([]);
  const [cameraOn, setCameraOn] = useState(false);
  const [flash, setFlash] = useState(false);
  const [recorderState, setRecorderState] = useState<'idle'|'recording'|'saving'|'saved'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  
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
    if (!cameraOn) return;
    document.body.classList.add('camera-active');
    document.documentElement.classList.add('camera-active');

    const synchronizeCamera = () => {
      requestAnimationFrame(() => {
        const rect = viewportRef.current?.getBoundingClientRect();
        if (!rect) return;
        void ArchFormsAudio.updateCameraRect({
          x: Math.round(rect.x), y: Math.round(rect.y),
          width: Math.round(rect.width), height: Math.round(rect.height),
        }).catch(() => undefined);
      });
    };
    synchronizeCamera();
    window.addEventListener('scroll', synchronizeCamera, { passive: true });
    window.addEventListener('resize', synchronizeCamera, { passive: true });
    return () => {
      document.body.classList.remove('camera-active');
      document.documentElement.classList.remove('camera-active');
      window.removeEventListener('scroll', synchronizeCamera);
      window.removeEventListener('resize', synchronizeCamera);
    };
  }, [cameraOn]);

  const startCamera = async () => {
    try {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) throw new Error('No se encontró el visor.');
      await CameraPreview.start({ position: 'rear', x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height), toBack: true, storeToFile: false, enableZoom: true, lockAndroidOrientation: true });
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
      
      const result = await CameraPreview.capture({ quality: 88 });
      const displayUrl = `data:image/jpeg;base64,${result.value}`;
      const features = await extractLocalFeatures(displayUrl);
      const saved = await savePhoto({ base64: result.value, mimeType: 'image/jpeg', features });
      
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
      const audioSaved = await saveNativeAudio(await ArchFormsAudio.stopRecording()); 
      await saveCaptureGroup(visita.id, photos, audioSaved);
      setPhotos([]); // Clear evidence for the next iteration!
      onGroupSaved(); // Tell parent we have a new group (to advance progress or notify)
      setRecorderState('saved');
      setTimeout(() => setRecorderState('idle'), 3000);
      setElapsed(0);
    }
    catch (caught) { console.error(caught); setRecorderState('idle'); setElapsed(0); }
  };

  const formatDuration = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  return (
    <article className="capture-layout" style={{ margin: '-18px', paddingBottom: '40px', display: 'flex', flexDirection: 'column' }}>
      
      <div style={{ position: 'sticky', top: '70px', zIndex: 10, padding: '15px' }}>
        <div ref={viewportRef} className={`camera-viewport ${cameraOn ? 'live' : ''}`} style={{ width: '100%', height: '48vh', background: cameraOn ? 'transparent' : '#e7eef4', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', borderRadius: '16px' }}>
          
          {cameraOn && (
            <div style={{ position: 'absolute', inset: 0, borderRadius: 16, boxShadow: '0 0 0 9999px #f2f5f9', pointerEvents: 'none', zIndex: -1 }} />
          )}

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
          <button className={`btn ${recorderState === 'recording' ? 'btn-danger' : 'btn-secondary'}`} style={{ width: '100%', minHeight: 65, fontSize: 16, display: 'flex', alignItems: 'center', justifyItems: 'center', gap: 12, justifyContent: 'center', borderRadius: 16, background: recorderState === 'recording' ? '' : 'white' }} onClick={recorderState === 'recording' ? stopRecording : startRecording} disabled={recorderState === 'saving' || recorderState === 'saved' || (!cameraOn && photos.length === 0 && recorderState === 'idle')}>
            <span style={{ display: 'flex', opacity: 0.8 }}>
              {recorderState === 'recording' ? <StopIcon /> : <MicIcon />}
            </span>
            {recorderState === 'recording' ? `Detener y agrupar (${formatDuration(elapsed)})` : recorderState === 'saving' ? 'Guardando...' : recorderState === 'saved' ? '¡Hallazgo guardado!' : 'Grabar audio y agrupar'}
          </button>
          {photos.length === 0 && recorderState === 'idle' && <p style={{ fontSize: 11, textAlign: 'center', marginTop: 10, color: '#81909d' }}>Toma al menos una foto para iniciar un hallazgo.</p>}
        </div>

        {photos.length > 0 && (
          <div className="photos-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 25 }}>
            {photos.map((photo, index) => (
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
