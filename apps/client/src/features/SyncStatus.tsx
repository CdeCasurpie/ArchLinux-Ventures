export function SyncStatus({online,running,pending,error,onRetry}:{
  online:boolean;running:boolean;pending:number;error:string;onRetry:()=>void;
}){
  const status=!online?'offline':error?'error':running?'running':pending?'pending':'idle';
  const label=!online?'Modo offline':error?'Sincronización requiere atención':running?'Sincronizando datos…':pending?`${pending} cambios pendientes`:'Sin cambios de datos pendientes';
  return <section className={`sync-status sync-status--${status}`} aria-label="Estado de sincronización de datos">
    <div role="status"><strong>{label}</strong><small>{!online?'Tus cambios guardados se enviarán al recuperar conexión.':error?'El trabajo local se conserva. Revisa el error e intenta de nuevo.':running?'Puedes seguir trabajando.':'Los archivos multimedia tienen su propio estado de transferencia.'}</small></div>
    <button className="btn btn-secondary" disabled={running} onClick={onRetry}>{running?'Sincronizando…':!online?'Reintentar conexión':error?'Reintentar':'Sincronizar ahora'}</button>
  </section>;
}
