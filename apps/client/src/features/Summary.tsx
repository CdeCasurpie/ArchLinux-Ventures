import { useEffect, useState } from 'react';
import { loadCaptureGroups, type CaptureGroup } from './lab-storage';
import type { Visita } from '@archforms/domain';

export function VisitSummary({ visita }: { visita: Visita }) {
  const [groups, setGroups] = useState<CaptureGroup[]>([]);

  useEffect(() => {
    const fetchGroups = () => {
      loadCaptureGroups(visita.id).then(g => {
        setGroups(g.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
      });
    };
    fetchGroups();
    const interval = setInterval(fetchGroups, 2000);
    return () => clearInterval(interval);
  }, [visita.id]);

  return (
    <article className="summary-layout" style={{ margin: '-18px', padding: '20px 15px', background: '#f2f5f9', minHeight: '100vh' }}>
      <p className="eyebrow" style={{ marginBottom: 16 }}>HISTORIAL DE HALLAZGOS</p>
      
      {groups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#81909d', background: 'white', borderRadius: 16, border: '1px dashed #cbd9e7' }}>
          <p>Aún no has registrado ninguna hallazgo en esta visita.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {groups.map((group, i) => (
            <div key={group.id} className="card" style={{ background: 'white', borderRadius: 16, padding: 16, border: '1px solid var(--line)', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 16, color: 'var(--navy)' }}>Hallazgo {groups.length - i}</h3>
                <span style={{ fontSize: 11, color: '#81909d' }}>{new Date(group.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              
              {/* Audio Principal */}
              <div style={{ marginBottom: 16 }}>
                <p style={{ margin: '0 0 12px 0', fontSize: 14, color: 'var(--navy)', lineHeight: 1.5 }}>
                  {group.transcripcion ? (
                    <span>{group.transcripcion}</span>
                  ) : (
                    <i style={{ color: '#81909d' }}>
                      {group.transcripcionStatus === 'downloading_model' && '⏳ Descargando modelo de IA...'}
                      {group.transcripcionStatus === 'transcribing' && '⏳ Transcribiendo el audio localmente...'}
                      {group.transcripcionStatus === 'error' && `❌ Error en Whisper: ${group.transcripcionError}`}
                      {group.transcripcionStatus === 'pending' && '⏳ Transcripción en cola...'}
                      {!group.transcripcionStatus && '[Transcripción automática pendiente. El dictado se procesará para generar la descripción del hallazgo.]'}
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

              {/* Galería de fotos del grupo */}
              {group.photos.length > 0 && (
                <div>
                  <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#81909d', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 }}>Evidencia Fotográfica ({group.photos.length})</span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 8 }}>
                    {group.photos.map(photo => (
                      <img key={photo.id} src={photo.displayUrl} alt="Evidencia" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 8, border: '1px solid #e2e8f0' }} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Placeholders for remaining features based on Plan Tecnico */}
      <div style={{ marginTop: 32 }}>
        <p className="eyebrow" style={{ marginBottom: 16 }}>CONCLUSIONES Y CIERRE</p>
        <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '1px solid var(--line)', marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: 15, color: 'var(--navy)' }}>Conclusiones</h3>
          <p style={{ margin: 0, fontSize: 14, color: '#81909d' }}>Las conclusiones globales se redactarán en la próxima hallazgo del MVP.</p>
        </div>

        <div style={{ background: 'white', borderRadius: 16, padding: 20, border: '1px solid var(--line)' }}>
          <h3 style={{ margin: '0 0 12px 0', fontSize: 15, color: 'var(--navy)' }}>Firmantes y Adjuntos</h3>
          <p style={{ margin: 0, fontSize: 14, color: '#81909d' }}>El panel para añadir firmas en pantalla y adjuntar el cuaderno de obra estará disponible en futuras actualizaciones.</p>
        </div>
      </div>

      {/* DEBUG VIEW */}
      <div style={{ marginTop: 32, background: '#2d3748', borderRadius: 16, padding: 20 }}>
        <h3 style={{ margin: '0 0 12px 0', fontSize: 12, color: '#a0aec0', textTransform: 'uppercase' }}>🔧 Debug Base de Datos Local (Lab Storage)</h3>
        <pre style={{ margin: 0, fontSize: 11, color: '#e2e8f0', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
          {JSON.stringify(groups, null, 2)}
        </pre>
      </div>
    </article>
  );
}
