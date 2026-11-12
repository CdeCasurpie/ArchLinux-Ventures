import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { loadCaptureGroups, photoDataUrl, type CaptureGroup, type LabPhoto } from './lab-storage';
import {
  subscribeMediaSync, subscribeGroupCreated, triggerMediaSync, getMediaSyncDebugState, getGroupSyncDebug,
  isMigrated, retryGroup, pullVisitaFromCloud, getLastPull,
  type GroupSyncDebug, type SyncDebugState, type PullProgress,
} from './media-sync';
import { mediaOutbox, supabase } from '../platform';
import { SupabaseCaptureReader } from '@archforms/data-supabase';
import { Icon } from '../ui/Icon';

// Pasa a true para mostrar el panel de diagnóstico de sync en el Resumen.
const SHOW_SYNC_DEBUG = false;
import type { Visita } from '@archforms/domain';

// ── Main component ────────────────────────────────────────────────────────────
// Si la URL de archivo falla (p. ej. file server), se autocura con el dataURL
// leído del disco y deja el rastro para diagnosticar la URL rota.
function PhotoImg({ photo }: { photo: LabPhoto }) {
  const [src, setSrc] = useState(photo.thumbUrl ?? photo.displayUrl);
  const [fellBack, setFellBack] = useState(false);
  useEffect(() => { setSrc(photo.thumbUrl ?? photo.displayUrl); setFellBack(false); }, [photo]);
  return (
    <img
      src={src} alt="Foto del hallazgo" loading="lazy" decoding="async"
      onError={() => {
        if (fellBack) return;
        console.warn(`[photo-debug] img falló: ${src} (path ${photo.path})`);
        setFellBack(true);
        photoDataUrl(photo.path, photo.mimeType).then(setSrc).catch(e => console.error('[photo-debug] fallback falló', e));
      }}
    />
  );
}
function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 5) return 'ahora mismo';
  if (s < 60) return `hace ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m}min`;
  return `hace ${Math.floor(m / 60)}h`;
}

export function VisitSummary({ visita, onConclude, onEditReport, onGoChecklist }: {
  visita: Visita;
  onConclude: () => Promise<void>;
  onEditReport: () => void;
  onGoChecklist?: () => void;
}) {
  const [groups, setGroups] = useState<CaptureGroup[]>([]);
  const [debug, setDebug] = useState<Record<string, GroupSyncDebug>>({});
  const [engine, setEngine] = useState<SyncDebugState>({ running: false, lastRun: null });
  const [migrated, setMigrated] = useState<boolean | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [forcing, setForcing] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState<PullProgress | null>(null);
  const [lastPull, setLastPull] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const checklistFields = visita.checklist_esquema_json.sections.flatMap(s => s.fields);
  const checklistAnswered = checklistFields.filter(f => isAnswered(visita.checklist_respuestas_json[f.id])).length;
  const checklistComplete = checklistAnswered === checklistFields.length;

  const doConclude = () => { setConfirming(false); setFinishing(true); onConclude().finally(() => setFinishing(false)); };
  const requestConclude = () => { if (checklistComplete) doConclude(); else setConfirming(true); };

  const doPull = () => {
    if (!navigator.onLine || pulling) return;
    setPulling(true);
    setPullProgress(null);
    const reader = new SupabaseCaptureReader(supabase);
    pullVisitaFromCloud(mediaOutbox, reader, visita.id, setPullProgress)
      .then(() => {
        return getLastPull(visita.id).then(setLastPull).catch(console.error);
      })
      .catch(console.error)
      .finally(() => { setPulling(false); setPullProgress(null); });
  };

  useEffect(() => {
    let cancelled = false;
    const fetchAll = () => {
      loadCaptureGroups(visita.id).then(async g => {
        if (cancelled) return;
        const sorted = g.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setGroups(sorted);
        setEngine(getMediaSyncDebugState());
        setMigrated(await isMigrated(visita.id).catch(() => null));
        const entries = await Promise.all(
          sorted.map(async grp => [grp.id, await getGroupSyncDebug(mediaOutbox, grp).catch(() => null)] as const),
        );
        if (cancelled) return;
        const map: Record<string, GroupSyncDebug> = {};
        for (const [id, d] of entries) if (d) map[id] = d;
        setDebug(map);
      });
    };
    fetchAll();
    // Event-driven refresh: the sync manager emits after every outbox change.
    const unsub = subscribeMediaSync(fetchAll);
    // Grupo recién creado en memoria: se antepone al instante, sin esperar al disco.
    const unsubGroup = subscribeGroupCreated(g => {
      if (g.visitaId !== visita.id) return;
      setGroups(prev => (prev.some(p => p.id === g.id) ? prev : [g, ...prev]));
    });
    const onNet = () => { setOnline(navigator.onLine); fetchAll(); };
    window.addEventListener('online', onNet);
    window.addEventListener('offline', onNet);
    // Pull-on-open: hydrate from the cloud on first open (or leave to reload).
    getLastPull(visita.id).then(stamp => {
      setLastPull(stamp);
      if (!stamp && navigator.onLine) void doPull();
    }).catch(console.error);
    return () => { cancelled = true; unsub(); unsubGroup(); window.removeEventListener('online', onNet); window.removeEventListener('offline', onNet); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visita.id]);

  const forceSync = () => {
    setForcing(true);
    triggerMediaSync().catch(console.error).finally(() => setForcing(false));
  };
  const retryOne = (group: CaptureGroup) => {
    setRetrying(group.id);
    retryGroup(mediaOutbox, group).catch(console.error).finally(() => setRetrying(null));
  };

  // Outbox totals across this visita (from debug rows, not polling).
  const totals = Object.values(debug).reduce(
    (acc, d) => {
      for (const m of d.media) acc[m.status] = (acc[m.status] ?? 0) + 1;
      acc[d.entity.status] = (acc[d.entity.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const pendingSync = groups.filter(g => (g.syncStatus ?? 'pending') !== 'synced').length;
  const sections = visita.checklist_esquema_json.sections;
  const missing = checklistFields.length - checklistAnswered;
  const missingRequired = checklistFields.filter(f => f.required && !isAnswered(visita.checklist_respuestas_json[f.id])).length;

  return (
    <article className="summary-layout">
      <div className="sync-line" role="status">
        <Icon name={!online ? 'cloudOff' : pendingSync > 0 ? 'refresh' : 'cloud'} size={20} />
        <span>
          <strong>
            {!online
              ? 'Sin conexión'
              : pendingSync > 0
                ? `Subiendo ${pendingSync} ${pendingSync === 1 ? 'hallazgo' : 'hallazgos'}…`
                : groups.length ? 'Hallazgos respaldados en la nube' : 'En línea'}
          </strong>
          {' · '}
          {!online && pendingSync > 0
            ? `${pendingSync} ${pendingSync === 1 ? 'queda guardado' : 'quedan guardados'} en este dispositivo hasta tener señal`
            : lastPull ? `Revisado en la nube ${timeAgo(lastPull)}` : 'Aún no se ha revisado la nube en este dispositivo'}
        </span>
        <button className="btn btn-secondary" onClick={e => { e.preventDefault(); doPull(); }} disabled={pulling || !online}>
          {pulling
            ? (pullProgress?.phase === 'binaries' ? `Descargando ${pullProgress.done} de ${pullProgress.total} archivos…` : 'Consultando la nube…')
            : <><Icon name="download" size={18} />Traer de la nube</>}
        </button>
      </div>

      {SHOW_SYNC_DEBUG && (
      <DebugPanel
        visitaId={visita.id}
        online={online}
        engine={engine}
        migrated={migrated}
        totals={totals}
        forcing={forcing}
        onForce={forceSync}
      />
      )}

      <section className="summary-section">
        <h2>Checklist</h2>
        <p>{missing === 0 ? 'Todas las preguntas tienen respuesta.' : `${checklistAnswered} de ${checklistFields.length} respondidas. Las vacías quedan en blanco en el informe.`}</p>
        <div className="list">
          {sections.map(section => (
            <div key={section.id} className="answer-group">
              <h3>{section.title}</h3>
              <dl>
                {section.fields.map(field => {
                  const value = visita.checklist_respuestas_json[field.id];
                  return (
                    <div key={field.id} className="answer-row">
                      <dt>{field.label}</dt>
                      <dd className={isAnswered(value) ? `answer ${answerTone(value)}` : 'answer empty'}>{formatAnswer(value)}</dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          ))}
        </div>
        {missing > 0 && onGoChecklist && <button className="link-button" onClick={onGoChecklist}><Icon name="edit" size={18} />Completar el checklist</button>}
      </section>

      <section className="summary-section">
        <h2>Hallazgos</h2>
        <p>{groups.length ? 'Del más reciente al más antiguo. El texto lo puedes corregir en el informe.' : 'Cada grupo de fotos con su nota de voz aparece aquí como un hallazgo.'}</p>
        {groups.length === 0 ? (
          <div className="empty-state"><h3>Sin hallazgos todavía</h3><p>Ve a «Fotos y voz», toma las fotos de lo que observas y dicta qué ves.</p></div>
        ) : (
          <div className="findings">
            {groups.map((group, i) => {
              const noText = !group.transcripcion;
              const failed = group.transcripcionStatus === 'error';
              const remoteNoText = group.transcripcionStatus === 'remote' && noText;
              const transcribing = noText && !failed && !remoteNoText;
              return (
                <div key={group.id} className={`card finding ${transcribing ? 'processing' : ''}`}>
                  <div className="finding-head">
                    <h3>Hallazgo {groups.length - i}</h3>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {transcribing && <span className="badge badge-info"><span className="spinner" />Escribiendo la nota</span>}
                      <time>{new Date(group.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                    </span>
                  </div>

                  {transcribing ? (
                    <div style={{ display: 'grid', gap: 8, marginBottom: 12 }} aria-hidden="true">
                      <div className="skeleton" style={{ height: 14 }} />
                      <div className="skeleton" style={{ height: 14, width: '65%' }} />
                    </div>
                  ) : (
                    group.transcripcion && <p className="finding-text">{group.transcripcion}</p>
                  )}

                  {group.audio && (
                    <div className="finding-audio">
                      <span>Nota de voz original</span>
                      <audio controls src={group.audio.displayUrl} />
                    </div>
                  )}

                  {group.photos.length > 0 && (
                    <div>
                      <span className="photo-label">{group.photos.length === 1 ? '1 foto' : `${group.photos.length} fotos`}</span>
                      <div className="photo-grid">
                        {group.photos.map(photo => <PhotoImg key={photo.id} photo={photo} />)}
                      </div>
                    </div>
                  )}

                  {transcribing && (
                    <p className="finding-note">
                      {group.transcripcionStatus === 'checking_model' && 'Preparando el dictado en este teléfono…'}
                      {group.transcripcionStatus === 'downloading_model' && 'Descargando el dictado (solo la primera vez)…'}
                      {group.transcripcionStatus === 'waiting_model' && 'El dictado espera señal para descargarse. La nota de voz ya está guardada.'}
                      {group.transcripcionStatus === 'transcribing' && 'Pasando la nota de voz a texto…'}
                      {(group.transcripcionStatus === 'pending' || !group.transcripcionStatus) && 'En cola para pasar a texto…'}
                    </p>
                  )}
                  {failed && (
                    <p className="finding-note error">
                      No se pudo pasar la nota a texto{group.transcripcionError ? ` (${group.transcripcionError})` : ''}. El audio está guardado; puedes escribir el texto en el informe.
                    </p>
                  )}
                  {remoteNoText && (
                    <p className="finding-note">Traído de otro dispositivo, sin texto. Escúchalo y escribe la nota en el informe.</p>
                  )}

                  {SHOW_SYNC_DEBUG && (
                  <DebugGroup
                    debug={debug[group.id]}
                    retrying={retrying === group.id}
                    onRetry={() => retryOne(group)}
                  />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="summary-section">
        <h2>Conclusiones y firmas</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          <div className="placeholder-note"><h3>Conclusiones</h3><p>Se escriben en el editor del informe, después de cerrar la visita. Son opcionales.</p></div>
          <div className="placeholder-note"><h3>Firmas</h3><p>El PDF incluye los espacios del responsable de obra y del profesional para firmar a mano. La firma digital todavía no está disponible.</p></div>
        </div>
      </section>

      {visita.estado === 'FINALIZADA' ? (
        <section className="conclude-panel done">
          <h2>Visita cerrada</h2>
          <p>El trabajo de campo terminó. Puedes ordenar el informe y generar el PDF cuantas veces necesites.</p>
          <button className="btn btn-primary btn-lg" onClick={onEditReport}><Icon name="file" />Abrir el informe</button>
        </section>
      ) : (
        <section className="conclude-panel">
          <h2>¿Terminaste en la obra?</h2>
          <p>Cerrar la visita no genera el PDF todavía:</p>
          <ol className="conclude-steps">
            <li>Se marca la visita como concluida.</li>
            <li>Se abre el informe para ordenar hallazgos y escribir conclusiones.</li>
            <li>Generas el PDF cuando lo hayas revisado. El checklist y las fotos se pueden seguir corrigiendo.</li>
          </ol>
          {confirming ? (
            <div className="confirm-box" role="alertdialog" aria-labelledby="confirm-title">
              <strong id="confirm-title">{missing === 1 ? 'Queda 1 pregunta sin responder' : `Quedan ${missing} preguntas sin responder`}</strong>
              <p>{missingRequired > 0 ? `${missingRequired === 1 ? 'Una es obligatoria' : `${missingRequired} son obligatorias`}. ` : ''}Puedes completarlas ahora o cerrar igual y corregirlas después.</p>
              <div className="actions-row">
                <button className="btn btn-primary" onClick={() => { setConfirming(false); onGoChecklist?.(); }}>Completar checklist</button>
                <button className="btn btn-secondary" disabled={finishing} onClick={doConclude}>{finishing ? 'Cerrando…' : 'Cerrar la visita igual'}</button>
              </div>
            </div>
          ) : (
            <button className="btn btn-primary btn-lg" disabled={finishing} onClick={requestConclude}>
              {finishing ? 'Cerrando…' : <><Icon name="check" />Cerrar visita y pasar al informe</>}
            </button>
          )}
        </section>
      )}
    </article>
  );
}

function isAnswered(value: unknown) { return value !== undefined && value !== null && value !== ''; }
function formatAnswer(value: unknown) {
  if (!isAnswered(value)) return 'Sin respuesta';
  if (value === 'si') return 'Sí';
  if (value === 'no') return 'No';
  if (value === 'na') return 'N.A.';
  return String(value);
}
function answerTone(value: unknown) { return value === 'si' ? 'yes' : value === 'no' ? 'no' : ''; }

// ── Debug UI ──────────────────────────────────────────────────────────────────
const debugBox: React.CSSProperties = {
  background: '#1e293b', color: '#e2e8f0', borderRadius: 12,
  padding: '12px 14px', fontSize: 11, lineHeight: 1.7,
  fontFamily: 'ui-monospace, monospace', overflowX: 'auto',
};
const debugLabel: React.CSSProperties = { color: '#94a3b8' };
const debugError: React.CSSProperties = { color: '#fca5a5', wordBreak: 'break-word' };
const debugOk: React.CSSProperties = { color: '#6ee7b7' };

function DebugPanel({ visitaId, online, engine, migrated, totals, forcing, onForce }: {
  visitaId: string;
  online: boolean;
  engine: SyncDebugState;
  migrated: boolean | null;
  totals: Record<string, number>;
  forcing: boolean;
  onForce: () => void;
}) {
  const total = (k: string) => totals[k] ?? 0;
  return (
    <details style={{ ...debugBox, marginBottom: 16 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 700, color: '#f8fafc' }}>
        🔧 Diagnóstico de sincronización
      </summary>
      <div style={{ marginTop: 8 }}>
        <div><span style={debugLabel}>plataforma: </span>{Capacitor.isNativePlatform() ? 'nativo (SQLite)' : 'web (IndexedDB)'}</div>
        <div><span style={debugLabel}>red: </span>{online ? 'en línea' : 'SIN CONEXIÓN'}</div>
        <div><span style={debugLabel}>motor: </span>{engine.running ? 'corriendo…' : 'en reposo'}</div>
        <div><span style={debugLabel}>última corrida: </span>{engine.lastRun ? timeAgo(engine.lastRun.at) : 'nunca'}</div>
        <div>
          <span style={debugLabel}>error del motor: </span>
          {engine.lastRun?.error ? <span style={debugError}>{engine.lastRun.error}</span> : <span style={debugOk}>ninguno</span>}
        </div>
        <div><span style={debugLabel}>migración outbox: </span>{migrated === null ? '…' : migrated ? 'hecha' : 'PENDIENTE'}</div>
        <div>
          <span style={debugLabel}>outbox: </span>
          {total('pending') + total('uploading') + total('synced') + total('error') === 0
            ? 'vacío (nada encolado para esta visita)'
            : `pend=${total('pending')} subiendo=${total('uploading')} sync=${total('synced')} error=${total('error')}`}
        </div>
        <div><span style={debugLabel}>visita: </span>{visitaId.slice(0, 8)}…</div>
        <button
          onClick={e => { e.preventDefault(); onForce(); }}
          disabled={forcing}
          style={{ marginTop: 8, padding: '6px 14px', borderRadius: 8, border: 0, background: '#38bdf8', color: '#0c4a6e', fontWeight: 700, fontSize: 12 }}
        >
          {forcing ? 'Sincronizando…' : '↻ Forzar sincronización'}
        </button>
      </div>
    </details>
  );
}

function DebugGroup({ debug, retrying, onRetry }: {
  debug: GroupSyncDebug | undefined;
  retrying: boolean;
  onRetry: () => void;
}) {
  return (
    <details style={{ ...debugBox, marginTop: 12 }}>
      <summary style={{ cursor: 'pointer', color: '#f8fafc' }}>
        🔍 Detalle técnico del envío
      </summary>
      {!debug ? (
        <div style={{ marginTop: 8 }}>cargando estado del outbox…</div>
      ) : (
        <div style={{ marginTop: 8 }}>
          {debug.media.map(m => (
            <div key={m.id} style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid #334155' }}>
              <div><span style={debugLabel}>{m.kind} </span>{m.id.slice(0, 8)}… → <b>{m.status}</b></div>
              <div><span style={debugLabel}>intentos: </span>{m.attempts}</div>
              {m.lastError && <div><span style={debugLabel}>respuesta Supabase: </span><span style={debugError}>{m.lastError}</span></div>}
              {m.nextRetry && <div><span style={debugLabel}>próximo reintento: </span>{timeAgo(m.nextRetry)}</div>}
              <div><span style={debugLabel}>local: </span>{m.localPath.length > 60 ? `…${m.localPath.slice(-60)}` : m.localPath}</div>
              <div><span style={debugLabel}>remoto: </span>{m.remotePath ?? 'aún no subido'}</div>
            </div>
          ))}
          <div>
            <span style={debugLabel}>entidad grupo_captura: </span>
            {debug.entity.status === 'enviada-ok'
              ? <span style={debugOk}>enviada OK (pushGrupo exitoso)</span>
              : <b>{debug.entity.status}</b>}
          </div>
          {debug.entity.lastError && <div><span style={debugLabel}>respuesta Supabase: </span><span style={debugError}>{debug.entity.lastError}</span></div>}
          {debug.entity.status !== 'enviada-ok' && debug.entity.status !== 'nunca-entro' && (
            <button
              onClick={e => { e.preventDefault(); onRetry(); }}
              disabled={retrying}
              style={{ marginTop: 8, padding: '6px 14px', borderRadius: 8, border: 0, background: '#fbbf24', color: '#78350f', fontWeight: 700, fontSize: 12 }}
            >
              {retrying ? 'Reintentando…' : '↻ Reintentar este hallazgo'}
            </button>
          )}
        </div>
      )}
    </details>
  );
}
