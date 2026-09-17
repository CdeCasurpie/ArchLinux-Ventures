import { useEffect, useRef, useState } from 'react';
import { CameraPreview } from '@capacitor-community/camera-preview';
import { Capacitor } from '@capacitor/core';
import { ArchFormsAudio } from './native-audio';
import { extractLocalFeatures } from './local-features';
import { savePhoto, saveNativeAudio, loadPhotos, loadAudioClips, type LabPhoto, type AudioClip } from './lab-storage';
import type { Visita } from '@archforms/domain';

export function VisitCapture({ visita }: { visita: Visita }) {
  const [photos, setPhotos] = useState<LabPhoto[]>([]);
  const [clips, setClips] = useState<AudioClip[]>([]);
  const [cameraOn, setCameraOn] = useState(false);
  const [recorderState, setRecorderState] = useState<'idle'|'recording'|'saving'>('idle');
  const [elapsed, setElapsed] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    loadPhotos().then(setPhotos);
    loadAudioClips().then(setClips);
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
      window.removeEventListener('scroll', synchronizeCamera);
      window.removeEventListener('resize', synchronizeCamera);
    };
  }, [cameraOn]);

  const startCamera = async () => {
    try {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) throw new Error('No se encontró el visor.');
      await CameraPreview.start({ position: 'rear', x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height), toBack: false, storeToFile: false, enableZoom: true, lockAndroidOrientation: true });
      setCameraOn(true);
    } catch (caught) { console.error(caught); }
  };
  const stopCamera = async () => { await CameraPreview.stop(); setCameraOn(false); };
  
  const takePhoto = async () => {
    try {
      const result = await CameraPreview.capture({ quality: 88 });
      const displayUrl = `data:image/jpeg;base64,${result.value}`;
      const features = await extractLocalFeatures(displayUrl);
      const saved = await savePhoto({ base64: result.value, mimeType: 'image/jpeg', features });
      setPhotos(current => [...current, saved]);
    } catch (caught) { console.error(caught); }
  };

  const startRecording = async () => {
    try { await ArchFormsAudio.startRecording(); setElapsed(0); setRecorderState('recording'); }
    catch (caught) { console.error(caught); }
  };
  
  const stopRecording = async () => {
    setRecorderState('saving');
    try { 
      const saved = await saveNativeAudio(await ArchFormsAudio.stopRecording()); 
      setClips(current => [...current, saved]); 
    }
    catch (caught) { console.error(caught); }
    finally { setElapsed(0); setRecorderState('idle'); }
  };

  const formatDuration = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  };

  return (
    <article className="card checklist-card capture-card">
      <p className="eyebrow">Evidencias de visita</p>
      <h2>Cámara y Audio</h2>
      <p>Captura fotografías y dicta tus comentarios. Todo se guarda offline.</p>
      
      <div className="camera-section">
        <div className="actions">
          <button className="btn btn-secondary" onClick={cameraOn ? stopCamera : startCamera}>
            {cameraOn ? 'Apagar cámara' : 'Encender cámara'}
          </button>
          <button className="btn btn-primary" onClick={takePhoto} disabled={!cameraOn}>
            Tomar foto
          </button>
        </div>
        <div ref={viewportRef} className={`camera-viewport ${cameraOn ? 'live' : ''}`} style={{ width: '100%', aspectRatio: '16/10', background: cameraOn ? 'transparent' : '#e7eef4', borderRadius: 12, marginTop: 16, display: 'grid', placeItems: 'center' }}>
          {!cameraOn && <span style={{color: '#81909d'}}>Visor apagado</span>}
        </div>
      </div>

      {photos.length > 0 && (
        <div className="photos-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
          {photos.map((photo, index) => (
            <div key={photo.id} style={{ borderRadius: 8, overflow: 'hidden', background: '#f2f5f8' }}>
              <img src={photo.displayUrl} alt={`Foto ${index + 1}`} style={{ width: '100%', aspectRatio: '4/3', objectFit: 'cover' }} />
              <div style={{ padding: 8, fontSize: 10 }}>Foto {index + 1}</div>
            </div>
          ))}
        </div>
      )}

      <div className="audio-section" style={{ marginTop: 32, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
        <h3>Grabación de comentarios</h3>
        <button className={`btn ${recorderState === 'recording' ? 'btn-danger' : 'btn-secondary'}`} onClick={recorderState === 'recording' ? stopRecording : startRecording} disabled={recorderState === 'saving'}>
          {recorderState === 'recording' ? `Detener (${formatDuration(elapsed)})` : recorderState === 'saving' ? 'Guardando...' : 'Grabar audio'}
        </button>
      </div>

      {clips.length > 0 && (
        <div className="audio-list" style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {clips.map((clip, index) => (
            <div key={clip.id} style={{ padding: 12, borderRadius: 8, background: '#f8fafc', border: '1px solid var(--line)' }}>
              <div style={{ marginBottom: 8, fontSize: 12, fontWeight: 'bold' }}>Audio {index + 1} ({formatDuration(clip.durationMs)})</div>
              <audio controls src={clip.displayUrl} style={{ width: '100%', height: 32 }} />
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
