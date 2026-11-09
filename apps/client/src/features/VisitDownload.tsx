import { useEffect, useState } from 'react';
import { SupabaseCaptureReader } from '@archforms/data-supabase';
import { mediaOutbox, supabase } from '../platform';
import { pullVisitaFromCloud, type PullProgress } from './media-sync';

/** Download only the visit being consulted, not the whole workspace on startup. */
export function VisitDownload({ visitaId }: { visitaId: string }) {
  const [progress, setProgress] = useState<PullProgress | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [offline, setOffline] = useState(!navigator.onLine);
  useEffect(() => {
    const network = () => { setOffline(!navigator.onLine); if(navigator.onLine)setAttempt(value=>value+1); };
    window.addEventListener('online', network);
    window.addEventListener('offline', network);
    return () => { window.removeEventListener('online', network); window.removeEventListener('offline', network); };
  }, []);
  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    setProgress(null);
    setError('');
    if (!navigator.onLine) return;
    void pullVisitaFromCloud(mediaOutbox,new SupabaseCaptureReader(supabase),visitaId,
      value=>{if(active)setProgress(value)},abort.signal)
      .catch(error=>{if(active)setError(error instanceof Error?error.message:String(error))});
    return () => { active=false;abort.abort(); };
  }, [visitaId, attempt]);
  if(offline)return <p role="status">Modo offline · los archivos que no se descargaron requieren conexión.</p>;
  if(error)return <div role="alert">No se completó la descarga: {error} <button onClick={()=>setAttempt(value=>value+1)}>Reintentar</button></div>;
  if(!progress||progress.phase==='meta')return <p role="status">Consultando archivos de esta visita…</p>;
  const percent=progress.total?Math.floor(progress.done/progress.total*100):100;
  return <div role="status">Archivos: {progress.done} de {progress.total} · {percent}%
    <progress value={progress.done} max={progress.total||1} aria-label="Descarga de archivos de visita"/>
  </div>;
}
