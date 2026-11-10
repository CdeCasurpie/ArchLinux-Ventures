import {useEffect,useState} from 'react';
import type {TransferJob,TransferQueue} from '@archforms/application';

export function VisitDownload({visitaId,queue,revision}:{visitaId:string;queue:TransferQueue;revision:string}){
  const [job,setJob]=useState<TransferJob>();
  const [error,setError]=useState('');
  useEffect(()=>{
    const unsubscribe=queue.subscribe(jobs=>{const current=jobs.find(job=>job.id===visitaId);setJob(current);if(current&&current.state!=='error')setError('')});
    void queue.request(visitaId,100).catch(error=>setError(String(error)));
    return unsubscribe;
  },[queue,visitaId,revision]);
  const retry=()=>{setError('');void queue.request(visitaId,100).catch(error=>setError(String(error)))};
  if(error||job?.state==='error')return <div role="alert">Descarga pendiente: {error||job?.error} <button className="btn btn-secondary" onClick={retry}>Reintentar descarga</button></div>;
  if(!job||job.state==='pending')return <p role="status">Archivos pendientes de comprobar o descargar. Se reanudará al disponer de conexión.</p>;
  if(job.state==='done')return <p role="status">Archivos de esta consulta actualizados.</p>;
  const percent=job.total?Math.floor(job.done/job.total*100):0;
  return <div role="status">Descargando archivos: {job.done} de {job.total} · {percent}% <progress value={job.done} max={job.total||1} aria-label="Descarga de archivos"/></div>;
}
