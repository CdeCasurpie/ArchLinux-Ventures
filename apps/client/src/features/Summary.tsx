import { useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { loadCaptureGroups, photoDataUrl, type CaptureGroup, type LabPhoto } from './lab-storage';
import {
  subscribeMediaSync, subscribeGroupCreated, triggerMediaSync, getMediaSyncDebugState, getGroupSyncDebug,
  isMigrated, retryGroup, getLastPull,
  type GroupSyncDebug, type SyncDebugState,
} from './media-sync';
import { mediaOutbox } from '../platform';
import { SerialAutosave, type SaveStatus } from './serial-autosave';
import { useDictation } from './dictation';
import type { SaveBarrier } from './save-barrier';
import {VisitSigners} from './VisitSigners';
import {VisitHeaderDetails} from './VisitHeader';
import {ChecklistForm} from './checklist';
import type {Expediente} from '@archforms/domain';
import {visitDocument} from './visit-document';
import {transcriptionService} from './transcription-service';
import {orderObservations} from './observation-order';

// Pasa a true para mostrar el panel de diagnóstico de sync en el Resumen.
const SHOW_SYNC_DEBUG = false;
import { parseReportDocument, setTextContent, type Visita } from '@archforms/domain';

// ── Main component ────────────────────────────────────────────────────────────
// Si la URL de archivo falla (p. ej. file server), se autocura con el dataURL
// leído del disco y deja el rastro para diagnosticar la URL rota.
function PhotoImg({ photo }: { photo: LabPhoto }) {
  const [src, setSrc] = useState(photo.thumbUrl ?? photo.displayUrl);
  const [fellBack, setFellBack] = useState(false);
  useEffect(() => { setSrc(photo.thumbUrl ?? photo.displayUrl); setFellBack(false); }, [photo]);
  return (
    <img
      src={src} alt="Evidencia" loading="lazy" decoding="async"
      style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, border: '1px solid #e2e8f0' }}
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

export function VisitSummary({ visita,expediente, onConclude, onEditReport, onGoChecklist, onSave, saveBarrier,onDownload }: {
  onDownload:()=>Promise<void>;
  expediente:Expediente;
  visita: Visita;
  onConclude: () => Promise<void>;
  onEditReport: () => void;
  onGoChecklist?: () => void;
  onSave: (record: Visita) => Promise<void>;
  saveBarrier?: SaveBarrier;
}) {
  const [capturedGroups, setGroups] = useState<CaptureGroup[]>([]);
  const groups=useMemo(()=>orderObservations(capturedGroups,parseReportDocument(visita.documento_json)),[capturedGroups,visita.documento_json]);
  const [debug, setDebug] = useState<Record<string, GroupSyncDebug>>({});
  const [engine, setEngine] = useState<SyncDebugState>({ running: false, lastRun: null });
  const [migrated, setMigrated] = useState<boolean | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [forcing, setForcing] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);
  const [lastPull, setLastPull] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [actionError,setActionError]=useState('');
  const [transferError,setTransferError]=useState('');

  const checklistFields = visita.checklist_esquema_json.sections.flatMap(s => s.fields);
  // 9.3: solo los campos obligatorios impiden concluir; los opcionales vacíos no avisan.
  const missingRequired = checklistFields.filter(f => {
    const v = visita.checklist_respuestas_json[f.id];
    return f.required && (v === undefined || v === null || v === '');
  }).length;
  const checklistComplete = missingRequired === 0;

  const doConclude = () => { setConfirming(false); setFinishing(true);setActionError(''); void onConclude().catch(error=>setActionError(String(error))).finally(() => setFinishing(false)); };
  const requestConclude = () => { if (checklistComplete) doConclude(); else setConfirming(true); };

  const doPull = () => {
    if (!navigator.onLine || pulling) return;
    setPulling(true);
    setActionError('');
    onDownload()
      .then(() => {
        return getLastPull(visita.id).then(setLastPull).catch(console.error);
      })
      .catch(error=>{setTransferError(String(error));setActionError('No se pudieron descargar los archivos. Puedes reintentar la descarga.')})
      .finally(() => { setPulling(false); });
  };

  useEffect(() => {
    let cancelled = false;
    const fetchAll = () => {
      loadCaptureGroups(visita.id).then(async g => {
        if (cancelled) return;
        const sorted = orderObservations(g);
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
      }).catch(error=>{if(!cancelled)setActionError(`No se pudieron leer los hallazgos locales: ${String(error)}`)});
    };
    fetchAll();
    // Event-driven refresh: the sync manager emits after every outbox change.
    const unsub = subscribeMediaSync(fetchAll);
    // Grupo recién creado en memoria: aparece al instante, sin esperar al disco.
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
    }).catch(console.error);
    return () => { cancelled = true; unsub(); unsubGroup(); window.removeEventListener('online', onNet); window.removeEventListener('offline', onNet); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visita.id]);

  const forceSync = () => {
    setForcing(true);
    setActionError('');triggerMediaSync().catch(error=>{setTransferError(String(error));setActionError('No se pudieron subir los archivos. Los originales locales se conservan.')}).finally(() => setForcing(false));
  };
  const retryOne = (group: CaptureGroup) => {
    setRetrying(group.id);
    setActionError('');retryGroup(mediaOutbox, group).catch(error=>{setTransferError(String(error));setActionError('El hallazgo sigue pendiente de subir. Puedes reintentarlo.')}).finally(() => setRetrying(null));
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

  return (
    <article className="summary-layout">
      {actionError&&<p role="alert" className="alert error">{actionError}</p>}
      <span hidden>{transferError}</span>
      <details className="card summary-section summary-disclosure"><summary><div><span className="eyebrow">CABECERA</span><h2>Revisión de la visita</h2></div><svg className="summary-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary><div className="summary-disclosure-body"><VisitHeaderDetails expediente={expediente} visita={visita}/></div></details>
      <details className="card summary-section summary-disclosure"><summary><div><span className="eyebrow">PLANTILLA</span><h3>{visita.checklist_nombre}</h3></div><svg className="summary-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary><div className="summary-disclosure-body"><ChecklistForm schema={visita.checklist_esquema_json} answers={visita.checklist_respuestas_json} readonly/><button className="btn btn-secondary" onClick={onGoChecklist}>Corregir respuestas</button></div></details>
      <div className="summary-findings-heading"><h3>Hallazgos</h3><span>{groups.length}</span></div>
      <div className="summary-file-actions">
        <span>{lastPull ? `Archivos actualizados ${timeAgo(lastPull)}` : 'Archivos de esta visita'}</span>
        <div>
        {pendingSync>0&&<button type="button" disabled={forcing||!online} onClick={forceSync}>{forcing?'Reintentando…':'Reintentar subida'}</button>}
        <button type="button"
          onClick={e => { e.preventDefault(); doPull(); }}
          disabled={pulling || !online}
        >
          {pulling
            ? 'Actualizando archivos…'
             : 'Actualizar archivos'}
        </button>
        </div>
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

      {groups.length === 0 ? (
        <div className="summary-empty-findings">
          <p>Aún no has registrado ningún hallazgo en esta visita.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {groups.map((group, i) => {
            const noText = !group.transcripcion;
            const failed = group.transcripcionStatus === 'error';
            const remoteNoText = group.transcripcionStatus === 'remote' && noText;
            const transcribing = noText && !failed && !remoteNoText;
            return (
            <div key={group.id} className="card" style={{ background: 'white', borderRadius: 16, padding: 16, border: transcribing ? '2px solid #7fb5f5' : '1px solid var(--line)', boxShadow: 'var(--shadow-sm)' }}>
              {/* Header row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                 <h3 style={{ margin: 0, fontSize: 16, color: 'var(--navy)' }}>Hallazgo {i + 1}</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {transcribing && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 100, background: '#d7e9fd', color: '#0b4a8f', whiteSpace: 'nowrap' }}>
                      <span className="spinner" />Procesando
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: '#81909d' }}>
                    {new Date(group.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              {/* Texto: skeleton hasta que la transcripción esté lista */}
              {transcribing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                  <div className="skeleton" style={{ height: 12, borderRadius: 6 }} />
                  <div className="skeleton" style={{ height: 12, borderRadius: 6, width: '65%' }} />
                </div>
              ) : (
                group.transcripcion && (
                  <p style={{ margin: '0 0 12px 0', fontSize: 14, color: 'var(--navy)', lineHeight: 1.5 }}>
                    <span>{group.transcripcion}</span>
                  </p>
                )
              )}

              {/* Audio: real desde el primer momento */}
              {group.audio && (
                <div style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', marginBottom: group.photos.length ? 16 : 0 }}>
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--blue-700)', marginBottom: 6 }}>Nota de voz original</span>
                  <audio controls src={group.audio.displayUrl} style={{ width: '100%', height: 32 }} />
                </div>
              )}

              {/* Fotos: reales desde el primer momento */}
              {group.photos.length > 0 && (
                <div>
                  <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#81909d', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 }}>
                    Evidencia Fotográfica ({group.photos.length})
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 8 }}>
                    {group.photos.map(photo => (
                      <PhotoImg key={photo.id} photo={photo} />
                    ))}
                  </div>
                </div>
              )}

              {/* Discreet status line below photos */}
              {transcribing && (
                <p style={{ margin: '12px 0 0 0', fontSize: 12, color: '#65758b' }}>
                  {group.transcripcionStatus === 'checking_model' && 'Preparando modelo de IA…'}
                  {group.transcripcionStatus === 'downloading_model' && 'Descargando modelo de IA…'}
                  {group.transcripcionStatus === 'waiting_model' && 'Esperando modelo (sin conexión)…'}
                  {group.transcripcionStatus === 'transcribing' && 'Transcribiendo nota de voz…'}
                  {(group.transcripcionStatus === 'pending' || !group.transcripcionStatus) && 'Procesando hallazgo…'}
                </p>
              )}
              {failed && (
                <div className="transcription-error">
                  <p>No se pudo transcribir esta nota de voz.</p>
                  {Capacitor.isNativePlatform()&&<button type="button" onClick={()=>transcriptionService.enqueue(group.id)}>Reintentar transcripción</button>}
                  {group.transcripcionError&&<details><summary>Ver detalle del error</summary><p>{group.transcripcionError}</p></details>}
                </div>
              )}
              {remoteNoText && (
                <p style={{ margin: '12px 0 0 0', fontSize: 12, color: '#81909d' }}>
                  Traída de la nube (este dispositivo no la transcribe).
                </p>
              )}
              {debug[group.id]?.media.some(media=>media.status==='error')&&<div className="alert error"><p>Hay archivos de este hallazgo pendientes por un error de subida. Los originales locales se conservan.</p><button className="btn btn-secondary" disabled={!online||retrying===group.id} onClick={()=>retryOne(group)}>Reintentar este hallazgo</button></div>}

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

      <section className="summary-conclusions"><ConclusionsCard visita={visita} onSave={onSave} saveBarrier={saveBarrier}/><VisitSigners visita={visita} onSave={onSave} saveBarrier={saveBarrier}/></section>
      {/* Cierre de campo → edición de informe */}
      <div className="card" style={{ padding: 20, marginTop: groups.length ? 20 : 0, marginBottom: 20 }}>
        {visita.estado === 'FINALIZADA' ? (
          <>
            <h3 style={{ margin: '0 0 8px 0', fontSize: 15, color: 'var(--navy)' }}>Visita concluida ✓</h3>
            <p style={{ margin: '0 0 12px 0', fontSize: 13, color: '#475569' }}>El trabajo de campo está cerrado. Puedes armar y regenerar el informe cuando quieras.</p>
            <button className="btn btn-primary" onClick={onEditReport}>Editar informe →</button>
          </>
        ) : (
          <>
            <h3 style={{ margin: '0 0 8px 0', fontSize: 15, color: 'var(--navy)' }}>¿Terminaste en campo?</h3>
            <p style={{ margin: '0 0 12px 0', fontSize: 13, color: '#475569' }}>Al concluir se habilita la edición del informe. La plantilla y la captura siguen disponibles.</p>
            {confirming ? (
              <div style={{ padding: 16, borderRadius: 12, background: 'white', border: '1px solid var(--line)' }}>
                <p style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 800, color: 'var(--navy)' }}>Plantilla sin terminar</p>
                <p style={{ margin: '0 0 14px 0', fontSize: 13, color: 'var(--danger)' }}>Te falta{missingRequired === 1 ? '' : 'n'} {missingRequired} campo{missingRequired === 1 ? '' : 's'} obligatorio{missingRequired === 1 ? '' : 's'} de la plantilla antes de cerrar la visita.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button className="btn btn-primary" onClick={() => { setConfirming(false); onGoChecklist?.(); }}>
                    Terminar plantilla
                  </button>
                  <button className="btn btn-secondary" disabled={finishing} onClick={doConclude}>
                    {finishing ? 'Concluyendo…' : 'Concluir de todos modos'}
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="btn btn-primary btn-lg"
                disabled={finishing}
                onClick={requestConclude}
              >
                {finishing ? 'Concluyendo…' : 'Concluir visita →'}
              </button>
            )}
          </>
        )}
      </div>

    </article>
  );
}

// ── Conclusiones (sección 6): edición directa + dictado por voz ───────────────
// Comparte el bloque 'conclusions' del documento del informe con el editor:
// escribir aquí o en el editor actualiza la misma fuente y el PDF la recoge.
function ConclusionsCard({ visita, onSave, saveBarrier }: {
  visita: Visita;
  onSave: (record: Visita) => Promise<void>;
  saveBarrier?: SaveBarrier;
}) {
  const [text, setText] = useState('');
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const currentVisit = useRef(visita);
  currentVisit.current = visita;
  const savedText = useRef('');
  const textRef = useRef('');
  const dirty = useRef(false);
  const blockId = useRef<string | null>(null);
  const persist = useRef(onSave);
  persist.current = onSave;

  const conclusionsOf = (json: Record<string, unknown>): string => {
    const doc = parseReportDocument(json);
    const block = doc?.blocks.find(b => b.type === 'conclusions');
    if (doc && block && block.type === 'conclusions') blockId.current = block.id;
    return block && block.type === 'conclusions' ? block.content : '';
  };

  // Carga inicial por visita: el documento del prop manda una sola vez.
  useEffect(() => {
    const content = conclusionsOf(visita.documento_json);
    savedText.current = content;
    textRef.current = content;
    setText(content);
  }, [visita.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-sincronización solo cuando llega un documento nuevo del workspace
  // (propio guardado o edición desde el editor del informe), y únicamente si
  // no hay escritura en vuelo: nunca borrar lo que el usuario está tecleando.
  useEffect(() => {
    if (dirty.current) return;
    const content = conclusionsOf(visita.documento_json);
    if (content === textRef.current) return;
    savedText.current = content;
    textRef.current = content;
    setSaveStatus('saved');
    setText(content);
  }, [visita.documento_json]); // eslint-disable-line react-hooks/exhaustive-deps

  const writer = useMemo(() => new SerialAutosave<string>(async next => {
    if (next === savedText.current) return;
    // Si la visita nunca abrió el editor, el documento no existe todavía:
    // se crea la estructura mínima. Los hallazgos que queden fuera los ofrece
    // el editor («Hallazgos fuera del informe»), así que no se pierde nada.
    const doc = await visitDocument(currentVisit.current);
    const block = doc.blocks.find(b => b.type === 'conclusions');
    if (!block || block.type !== 'conclusions') throw new Error('El informe no tiene bloque de conclusiones');
    blockId.current = block.id;
    await persist.current({
      ...currentVisit.current,
      documento_json: setTextContent(doc, block.id, next) as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    });
    savedText.current = next;
    // El valor persistido manda solo si el usuario no siguió escribiendo.
    if (next === textRef.current) dirty.current = false;
  }, setSaveStatus), [visita.id]);

  useEffect(() => saveBarrier?.register(() => writer.flush()), [saveBarrier, writer]);

  // Dictado por voz: los fragmentos finales se añaden al texto; el resultado
  // queda en el mismo textarea para revisarlo y corregirlo antes de guardar.
  const dictation = useDictation(chunk => {
    const base = textRef.current;
    const next = base && !/\s$/.test(base) ? `${base} ${chunk}` : base + chunk;
    textRef.current = next;
    dirty.current = true;
    setText(next);
    void writer.save(next);
  });

  const native = Capacitor.isNativePlatform();
  const statusLabel = saveStatus === 'saving' ? 'Guardando…' : saveStatus === 'error' ? 'No se pudo guardar' : 'Guardado en este dispositivo';
  return (
    <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '1px solid var(--line)', marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
        {/* El dictado nativo (Whisper) llegará después: por ahora solo web. */}
        <h3 style={{ margin: 0, fontSize: 15, color: 'var(--navy)' }}>Conclusiones</h3>
        <button
          className="btn btn-secondary"
          disabled={native}
          onClick={() => (dictation.state === 'listening' ? dictation.stop() : dictation.start())}
        >
          {dictation.state === 'listening' ? '■ Detener dictado' : '🎙 Dictar'}
        </button>
      </div>
      <textarea
        rows={5}
        style={{ width: '100%' }}
        value={text}
        placeholder="Escribe o dicta las conclusiones globales de la visita…"
        onChange={e => { textRef.current = e.target.value; dirty.current = true; setText(e.target.value); void writer.save(e.target.value); }}
      />
      <p role="status" style={{ margin: '8px 0 0 0', fontSize: 12, color: '#65758b' }}>
        {dictation.state === 'listening' && 'Escuchando… toca «Detener dictado» al terminar. '}
        {native && 'El dictado por voz estará disponible en la app más adelante; por ahora puedes escribirlo. '}
        {dictation.state === 'unsupported' && 'El dictado por voz no está disponible aquí; escribe el texto. '}
        {dictation.error && `${dictation.error} `}
        {statusLabel} · se comparte con el editor del informe.
      </p>
      {saveStatus==='error'&&<button className="btn btn-secondary" onClick={()=>void writer.retry()}>Reintentar conclusiones</button>}
    </div>
  );
}

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
