import {useEffect,useState} from 'react';
import type {TransferJob,TransferQueue} from '@archforms/application';

export function VisitDownload({visitaId,queue}:{visitaId:string;queue:TransferQueue}){
  const [job,setJob]=useState<TransferJob>();
  const [error,setError]=useState('');
  useEffect(()=>{
    const unsubscribe=queue.subscribe(jobs=>{const current=jobs.find(job=>job.id===visitaId);setJob(current);if(current&&current.state!=='error')setError('')});
    void queue.request(visitaId,100).catch(error=>setError(String(error)));
    const refresh=()=>{if(navigator.onLine&&document.visibilityState==='visible')void queue.request(visitaId,100).catch(error=>setError(String(error)))};
    window.addEventListener('online',refresh);document.addEventListener('visibilitychange',refresh);
    return ()=>{unsubscribe();window.removeEventListener('online',refresh);document.removeEventListener('visibilitychange',refresh)};
  },[queue,visitaId]);
  const retry=()=>{setError('');void queue.request(visitaId,100).catch(error=>setError(String(error)))};
  if(error||job?.state==='error')return <div className="transfer-retry"><span role="status">Archivos pendientes de descargar</span><button type="button" onClick={retry}>Reintentar</button><span hidden>{error||job?.error}</span></div>;
  if(!job||job.state==='pending'||job.state==='done')return null;
  if(!job.total)return <div role="status" className="transfer-status">Comprobando fotografías y audios en la nube… <progress aria-label="Comprobación de archivos"/></div>;
  const percent=Math.floor(job.done/job.total*100);
  return <div role="status" className="transfer-status">Descargando fotografías y audios: {job.done} de {job.total} · {percent}% <progress value={job.done} max={job.total} aria-label="Descarga de archivos"/></div>;
}
