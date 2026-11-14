export function SyncStatus({online,running,pending,error,onRetry}:{
  online:boolean;running:boolean;pending:number;error:string;onRetry:()=>void;
}){
  const status=!online?'offline':error?'error':running?'running':pending?'pending':'idle';
  const label=!online?'Sin conexión':error?'Reintentar sync':running?'Sincronizando':pending?`${pending} pendientes`:'Al día';
  const description=!online?'Guardado local · se enviará al conectar':error?'Guardado local · pulsa para reintentar':running?'Sincronizando datos · puedes seguir trabajando':'Datos del espacio · pulsa para sincronizar';
  return <button type="button" className={`sync-indicator sync-indicator--${status}`} aria-label={`Sincronización: ${label}`} title={description} disabled={running} onClick={onRetry}>
    <span className="sync-indicator-icon" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{status==='idle'?<path d="m5 12 4 4L19 6"/>:status==='offline'?<><path d="m3 3 18 18M8 5a8 8 0 0 1 12 8M4 8a8 8 0 0 0 12 11"/><path d="M20 4v5h-5M4 20v-5h5"/></>:<><path d="M20 4v5h-5M4 20v-5h5"/><path d="M4 9a8 8 0 0 1 13-5l3 5M4 15l3 5a8 8 0 0 0 13-5"/></>}</svg></span>
    <span className="sync-indicator-copy"><span role="status">{label}</span><small>{description}</small></span>
  </button>;
}
