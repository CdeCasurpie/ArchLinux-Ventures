import { useEffect, useState } from 'react';
import { loadCaptureGroups, type CaptureGroup } from './lab-storage';
import type { Visita } from '@archforms/domain';

export function VisitSummary({ visita }: { visita: Visita }) {
  const [groups, setGroups] = useState<CaptureGroup[]>([]);

  useEffect(() => {
    loadCaptureGroups(visita.id).then(g => {
      // Sort newest first
      setGroups(g.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    });
  }, [visita.id]);

  return (
    <article className="summary-layout" style={{ margin: '-18px', padding: '20px 15px', background: '#f2f5f9', minHeight: '100%' }}>
      <p className="eyebrow" style={{ marginBottom: 16 }}>HISTORIAL DE HALLAZGOS</p>
      
      {groups.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#81909d', background: 'white', borderRadius: 16, border: '1px dashed #cbd9e7' }}>
          <p>Aún no has registrado ninguna iteración en esta visita.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {groups.map((group, i) => (
            <div key={group.id} className="card" style={{ background: 'white', borderRadius: 16, padding: 16, border: '1px solid var(--line)', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 16, color: 'var(--navy)' }}>Iteración {groups.length - i}</h3>
                <span style={{ fontSize: 11, color: '#81909d' }}>{new Date(group.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              
              {/* Audio Principal */}
              <div style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', marginBottom: 16 }}>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--blue-700)', marginBottom: 6 }}>Nota de voz</span>
                <audio controls src={group.audio.displayUrl} style={{ width: '100%', height: 32 }} />
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
    </article>
  );
}
