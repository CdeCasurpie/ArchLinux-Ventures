import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { loadCaptureGroups, type CaptureGroup } from './lab-storage';
import {
  subscribeMediaSync, triggerMediaSync, getMediaSyncDebugState, getGroupSyncDebug,
  isMigrated, retryGroup, pullVisitaFromCloud, getLastPull,
  type GroupSyncDebug, type SyncDebugState, type PullProgress,
} from './media-sync';
import { mediaOutbox, supabase } from '../platform';
import { SupabaseCaptureReader } from '@archforms/data-supabase';
import type { Visita } from '@archforms/domain';

// ── Sync status badge ─────────────────────────────────────────────────────────
function SyncBadge({ status }: { status: CaptureGroup['syncStatus'] }) {
  const styles: Record<string, { label: string; color: string; bg: string }> = {
    pending:   { label: '🕐 En cola',        color: '#92400e', bg: '#fef3c7' },
    uploading: { label: '⬆ Subiendo',        color: '#1e40af', bg: '#dbeafe' },
    synced:    { label: '✓ Sincronizado',    color: '#065f46', bg: '#d1fae5' },
    error:     { label: '⚠ Error — reintentando', color: '#991b1b', bg: '#fee2e2' },
  };
  const s = styles[status] ?? styles.pending;
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: '2px 8px',
      borderRadius: 100, background: s.bg, color: s.color,
      letterSpacing: 0.3, whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
function timeAgo(iso: string | null): string {
  if (!iso) return '—';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 5) return 'ahora mismo';
  if (s < 60) return `hace ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m}min`;
  return `hace ${Math.floor(m / 60)}h`;
}

export function VisitSummary({ visita }: { visita: Visita }) {
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
  const [pullMsg, setPullMsg] = useState('');

  const doPull = () => {
    if (!navigator.onLine || pulling) return;
    setPulling(true);
    setPullMsg('');
    setPullProgress(null);
    const reader = new SupabaseCaptureReader(supabase);
    pullVisitaFromCloud(mediaOutbox, reader, visita.id, setPullProgress)
      .then(r => {
        setPullMsg(`Nube al día: ${r.upserted} grupos, ${r.downloaded} archivos` +
          (r.skippedDirty ? `, ${r.skippedDirty} omitidos (local manda)` : ''));
        return getLastPull(visita.id).then(setLastPull).catch(console.error);
      })
      .catch(e => setPullMsg(`No se pudo descargar: ${e instanceof Error ? e.message : String(e)}`))
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
    const onNet = () => { setOnline(navigator.onLine); fetchAll(); };
    window.addEventListener('online', onNet);
    window.addEventListener('offline', onNet);
    // Pull-on-open: hydrate from the cloud on first open (or leave to reload).
    getLastPull(visita.id).then(stamp => {
      setLastPull(stamp);
      if (!stamp && navigator.onLine) void doPull();
    }).catch(console.error);
    return () => { cancelled = true; unsub(); window.removeEventListener('online', onNet); window.removeEventListener('offline', onNet); };
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

  return (
    <article className="summary-layout" style={{ margin: '-18px', padding: '20px 15px', background: '#f2f5f9', minHeight: '100vh' }}>
      <p className="eyebrow" style={{ marginBottom: 16 }}>HISTORIAL DE HALLAZGOS</p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 12, color: '#475569' }}>
        <span>Nube: {lastPull ? `actualizado ${timeAgo(lastPull)}` : 'nunca descargado en este dispositivo'}</span>
        <span style={{ flex: 1 }} />
        <button
          onClick={e => { e.preventDefault(); doPull(); }}
          disabled={pulling || !online}
          style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #cbd5e1', background: 'white', fontWeight: 700, fontSize: 12, color: '#0c4a6e' }}
        >
          {pulling
            ? (pullProgress?.phase === 'binaries' ? `Descargando ${pullProgress.done}/${pullProgress.total}…` : 'Leyendo nube…')
            : '↓ Actualizar desde la nube'}
        </button>
      </div>
      {pullMsg && <p style={{ fontSize: 12, color: '#475569', marginTop: 0 }}>{pullMsg}</p>}

      <DebugPanel
        visitaId={visita.id}
        online={online}
        engine={engine}
        migrated={migrated}
        totals={totals}
        forcing={forcing}
        onForce={forceSync}
      />

      {groups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#81909d', background: 'white', borderRadius: 16, border: '1px dashed #cbd9e7' }}>
          <p>Aún no has registrado ningún hallazgo en esta visita.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {groups.map((group, i) => (
            <div key={group.id} className="card" style={{ background: 'white', borderRadius: 16, padding: 16, border: '1px solid var(--line)', boxShadow: 'var(--shadow-sm)' }}>
              {/* Header row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 16, color: 'var(--navy)' }}>Hallazgo {groups.length - i}</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <SyncBadge status={group.syncStatus ?? 'pending'} />
                  <span style={{ fontSize: 11, color: '#81909d' }}>
                    {new Date(group.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              {/* Transcription / audio */}
              <div style={{ marginBottom: 16 }}>
                <p style={{ margin: '0 0 12px 0', fontSize: 14, color: 'var(--navy)', lineHeight: 1.5 }}>
                  {group.transcripcion ? (
                    <span>{group.transcripcion}</span>
                  ) : (
                    <i style={{ color: '#81909d' }}>
                      {group.transcripcionStatus === 'downloading_model' && '⏳ Descargando modelo de IA...'}
                      {group.transcripcionStatus === 'transcribing'      && '⏳ Transcribiendo el audio localmente...'}
                      {group.transcripcionStatus === 'remote'           && 'Traída de la nube (este dispositivo no la transcribe).'}
                      {group.transcripcionStatus === 'error'             && `❌ Error en Whisper: ${group.transcripcionError}`}
                      {group.transcripcionStatus === 'pending'           && '⏳ Transcripción en cola...'}
                      {!group.transcripcionStatus                        && '[Transcripción automática pendiente.]'}
                    </i>
                  )}
                </p>
                {group.audio && (
                  <div style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--blue-700)', marginBottom: 6 }}>Nota de voz original</span>
                    <audio controls src={group.audio.displayUrl} style={{ width: '100%', height: 32 }} />
                  </div>
                )}
              </div>

              {/* Photo gallery */}
              {group.photos.length > 0 && (
                <div>
                  <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#81909d', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 }}>
                    Evidencia Fotográfica ({group.photos.length})
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 8 }}>
                    {group.photos.map(photo => (
                      <img key={photo.id} src={photo.displayUrl} alt="Evidencia" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, border: '1px solid #e2e8f0' }} />
                    ))}
                  </div>
                </div>
              )}

              <DebugGroup
                debug={debug[group.id]}
                retrying={retrying === group.id}
                onRetry={() => retryOne(group)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Placeholders */}
      <div style={{ marginTop: 32 }}>
        <p className="eyebrow" style={{ marginBottom: 16 }}>CONCLUSIONES Y CIERRE</p>
        <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '1px solid var(--line)', marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: 15, color: 'var(--navy)' }}>Conclusiones</h3>
          <p style={{ margin: 0, fontSize: 14, color: '#81909d' }}>Las conclusiones globales se redactarán en la próxima fase del MVP.</p>
        </div>
        <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '1px solid var(--line)' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: 15, color: 'var(--navy)' }}>Firmantes y Adjuntos</h3>
          <p style={{ margin: 0, fontSize: 14, color: '#81909d' }}>El panel para firmas y adjuntos estará disponible en futuras actualizaciones.</p>
        </div>
      </div>
    </article>
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
