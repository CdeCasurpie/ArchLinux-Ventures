import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { FileViewer } from '@capacitor/file-viewer';
import { Share } from '@capacitor/share';
import {
  initReportDocument, parseReportDocument, moveReportBlock, removeReportBlock,
  restoreGroupBlock, addTextBlock, setBlockPhotos, setBlockComment, setTextContent,
  setReportSigners, type ReportDocumentV1, type ReportBlock,
} from '@archforms/domain';
import type { Expediente, LocalState, Visita } from '@archforms/domain';
import { loadCaptureGroups, photoDataUrl, type CaptureGroup, type LabPhoto } from './lab-storage';
import { loadReportPhotos } from './report-photos';
import {SignersEditor} from './Signers';
import {VisitHeaderDetails} from './VisitHeader';
import {ReportChecklist} from './ReportChecklist';
import {SerialAutosave,type SaveStatus} from './serial-autosave';
import type {SaveBarrier} from './save-barrier';
import {reportSource} from './report-source';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

/** Grilla del editor: incluidas primero en orden del informe, resto en captura. */
function orderedPhotos(group: CaptureGroup | undefined, photoIds: string[]): LabPhoto[] {
  if (!group) return [];
  const rank = new Map(photoIds.map((id, i) => [id, i]));
  return [...group.photos].sort((a, b) => {
    const ra = rank.get(a.id);
    const rb = rank.get(b.id);
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return 0;
  });
}

export function VisitReport({ visita, expediente, profile, onSave,onSaveAnswers,saveBarrier,ownerId,provisional=false }: {
  visita: Visita;
  expediente: Expediente;
  profile: LocalState['profile'];
  ownerId: string;
  onSave: (record: Visita) => Promise<void>;
  onSaveAnswers:(id:string,patch:Record<string,string|number|null>)=>Promise<void>;
  saveBarrier:SaveBarrier;
  provisional?:boolean;
}) {
  const [groups, setGroups] = useState<CaptureGroup[]>([]);
  const [doc, setDoc] = useState<ReportDocumentV1 | null>(null);
  const [past, setPast] = useState<ReportDocumentV1[]>([]);
  const [future, setFuture] = useState<ReportDocumentV1[]>([]);
  const [savedRevision, setSavedRevision] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pdfMsg, setPdfMsg] = useState('');
  const [fileMsg, setFileMsg] = useState('');
  const [savedFile, setSavedFile] = useState<{ filename: string } | null>(null);
  const [fileSheetOpen, setFileSheetOpen] = useState(false);
  const initedFor = useRef<string | null>(null);
  const [loadError,setLoadError]=useState('');
  const [loadAttempt,setLoadAttempt]=useState(0);
  const [generatedSource,setGeneratedSource]=useState<string|null>(null);
  const source=reportSource(doc,visita,expediente,profile);
  const pdfInput=useRef({doc,visita,expediente,profile,source});pdfInput.current={doc,visita,expediente,profile,source};
  const pdfStale=generatedSource!==null&&source!==generatedSource;
  const [saveStatus,setSaveStatus]=useState<SaveStatus>('saved');
  const current=useRef({visita,onSave});current.current={visita,onSave};
  const writer=useMemo(()=>new SerialAutosave<ReportDocumentV1>(async target=>{
    await current.current.onSave({...current.current.visita,documento_json:target as unknown as Record<string,unknown>,updated_at:new Date().toISOString()});
    setSavedRevision(target.revision);
  },setSaveStatus),[visita.id]);
  useEffect(()=>saveBarrier.register(()=>writer.flush()),[saveBarrier,writer]);
  useEffect(()=>{if(!doc||doc.revision===savedRevision)return;void writer.save(doc)},[doc,writer]);
  useEffect(()=>{
    if(saveStatus==='saved')return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''};
    window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
  },[saveStatus]);

  useEffect(() => {
    let cancelled = false;
    setLoadError('');
    const timeout=setTimeout(()=>{if(!cancelled)setLoadError('No se pudo abrir el contenido local a tiempo. Si usas el servidor de desarrollo sin conexión, algunos módulos pueden no estar disponibles.')},12000);
    loadCaptureGroups(visita.id).then(g => {
      if (cancelled || initedFor.current === visita.id) return;
      initedFor.current = visita.id;
      const sorted = g.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setGroups(sorted);
      const parsed = parseReportDocument(visita.documento_json);
      if (parsed) {
        setDoc(parsed);
        setSavedRevision(parsed.revision);
      } else {
        const fresh = initReportDocument(sorted.map(gr => ({
          id: gr.id,
          photoIds: gr.photos.map(p => p.id),
          comment: gr.transcripcion ?? '',
        })));
        setDoc(fresh);
        setSavedRevision(null);
      }
      clearTimeout(timeout);
      setLoadError('');
    }).catch(error=>{if(!cancelled){clearTimeout(timeout);setLoadError(error instanceof Error?error.message:String(error))}});
    return () => { cancelled = true;clearTimeout(timeout); };
  }, [visita.id,loadAttempt]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = (fn: (d: ReportDocumentV1) => ReportDocumentV1) => {
    setDoc(current => {
      if (!current) return current;
      const next = fn(current);
      if (next === current) return current;
      setPast(p => [...p.slice(-49), current]);
      setFuture([]);
      return next;
    });
  };
  const undo = () => {
    setPast(p => {
      if (!p.length || !doc) return p;
      setFuture(f => [doc, ...f]);
      setDoc(p[p.length - 1]);
      return p.slice(0, -1);
    });
  };
  const redo = () => {
    setFuture(f => {
      if (!f.length) return f;
      const [next, ...rest] = f;
      setDoc(current => {
        if (current) setPast(p => [...p.slice(-49), current]);
        return next;
      });
      return rest;
    });
  };

  const dirty = doc !== null && savedRevision !== null && doc.revision !== savedRevision;
  const fresh = doc !== null && savedRevision === null;
  const groupById = new Map(groups.map(g => [g.id, g]));
  const missingGroups = groups.filter(g => doc && !doc.blocks.some(b => b.type === 'capture-group' && b.groupId === g.id));

  const save = async (next?: ReportDocumentV1) => {
    const target = next ?? doc;
    if (!target) return;
    setSaving(true);
    try {
      await writer.save(target);
      await writer.flush();
    } finally {
      setSaving(false);
    }
  };

  const generate = async () => {
    if (!doc) return;
    setBusy(true);
    setPdfMsg('');
    try {
      // Persist content, never the generated binary, before rendering this snapshot.
      await saveBarrier.flush();
      await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
      const {doc,visita,expediente,profile,source}=pdfInput.current;
      if(!doc)throw new Error('El documento no está disponible');
      await save(doc);
      // El stack PDF (pesado) se carga diferido: no enlentece el arranque.
      const [{ pdf }, { buildInformeDoc, informeFileName, stampPageNumbers }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@archforms/report-pdf'),
      ]);
      // Fotos resueltas a dataURL desde disco (el displayUrl en memoria puede ser
      // una URL de archivo, que react-pdf no puede incrustar).
      const photos = await loadReportPhotos(doc,groups,photoDataUrl);
      const element = buildInformeDoc({
        doc, visita, expediente,
        profesional: profile ? { ...profile, email: '', updated_at: '' } : null,
        photos,
      });
      const blob = await pdf(element).toBlob();
      const raw = new Uint8Array(await blob.arrayBuffer());
      // Pie X/Y por página con coordenadas exactas (pdf-lib, 100% offline).
      const bytes = await stampPageNumbers(
        raw,
        (p, t) => `Pág. ${p}/${t} · Rev. ${doc.revision} · ${expediente.nro_expediente}${provisional?' · Numeración provisional':''}`,
      );
      const filename = informeFileName(expediente, visita);
      if (Capacitor.isNativePlatform()) {
        // Descarga directa a Documentos, sin hoja de compartir.
        await Filesystem.writeFile({ path: `ArchForms/${filename}`, data: bytesToBase64(bytes), directory: Directory.Documents, recursive: true });
        setSavedFile({ filename });
      } else {
        // Web: descargar los bytes ESTAMPADOS (con pie X/Y), no el blob original.
        const stampedBlob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
        const url = URL.createObjectURL(stampedBlob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
      setGeneratedSource(source);
      setPdfMsg('PDF generado en este dispositivo. No se sube a la nube.');
      setFileSheetOpen(true);
    } catch (e) {
      setPdfMsg(`No se pudo generar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const savedFileUri = async (filename: string) => {
    const { uri } = await Filesystem.getUri({ path: `ArchForms/${filename}`, directory: Directory.Documents });
    return uri;
  };

  const openSavedPdf = async (filename: string) => {
    setBusy(true);
    setFileMsg('');
    try {
      await FileViewer.openDocumentFromLocalPath({ path: await savedFileUri(filename) });
    } catch (e) {
      setFileMsg(`No se pudo abrir el PDF: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const shareSavedPdf = async (filename: string) => {
    setBusy(true);
    setFileMsg('');
    try {
      await Share.share({ title: 'Informe ArchForms', text: filename, url: await savedFileUri(filename), dialogTitle: 'Compartir informe' });
    } catch (e) {
      setFileMsg(`No se pudo compartir el PDF: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  if (!doc) {
    return <article className="card" style={{ padding: 24 }}>{loadError?<><p role="alert">No se pudo abrir el informe: {loadError}</p><button className="btn btn-secondary" onClick={()=>setLoadAttempt(value=>value+1)}>Reintentar apertura</button></>:<p role="status">Armando el informe…</p>}</article>;
  }

  return (
    <div className="page-enter">
      {provisional&&<p role="status">El número de visita es provisional hasta sincronizar. El PDF llevará esa advertencia.</p>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <span className="status active">{pdfStale?'PDF anterior desactualizado · vuelve a generarlo':'PDF local · se genera en cada descarga'}</span>
        <span style={{ flex: 1 }} />
        <button className="btn btn-secondary" onClick={undo} disabled={!past.length}>←</button>
        <button className="btn btn-secondary" onClick={redo} disabled={!future.length}>→</button>
        <button className="btn btn-secondary" onClick={() => void save().catch(error=>setPdfMsg(`No se pudo guardar: ${String(error)}`))} disabled={saving || (saveStatus!=='error'&&!dirty && !fresh)}>
          {saving ? 'Guardando…' : saveStatus==='error'?'Reintentar guardado':'Guardar informe'}
        </button>
        <button className="btn btn-primary" onClick={() => void generate()} disabled={busy}>
          {busy ? 'Generando…' : 'Generar PDF'}
        </button>
      </div>
      <p role="status">{saveStatus==='saving'?'Guardando informe en el dispositivo…':saveStatus==='error'?'No se pudo guardar el informe. Reintenta antes de salir.':'Informe guardado en este dispositivo · se sincroniza al tener conexión'}</p>
      {pdfMsg && <div className="alert notice">{pdfMsg}</div>}
      {fileSheetOpen && savedFile && Capacitor.isNativePlatform() && createPortal(
        <>
          <div onClick={() => setFileSheetOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(10,25,45,.45)', zIndex: 80 }} />
          <div className="card" style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 90, borderRadius: '20px 20px 0 0', padding: '10px 20px calc(20px + env(safe-area-inset-bottom))', animation: 'sheetUp .22s ease both' }}>
            <div style={{ width: 40, height: 4, borderRadius: 4, background: '#dde5ee', margin: '0 auto 12px' }} />
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <p style={{ margin: '0 0 4px 0', fontSize: 14, fontWeight: 800, color: 'var(--navy)' }}>✓ PDF guardado en el dispositivo</p>
                <p style={{ margin: 0, fontSize: 12, color: '#475569' }}>{savedFile.filename} · Documentos/ArchForms/</p>
              </div>
              <button className="btn btn-secondary" aria-label="Cerrar" onClick={() => setFileSheetOpen(false)} style={{ padding: '6px 12px' }}>×</button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => void openSavedPdf(savedFile.filename)} disabled={busy||pdfStale}>
                Abrir PDF
              </button>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => void shareSavedPdf(savedFile.filename)} disabled={busy||pdfStale}>
                Compartir
              </button>
            </div>
            {fileMsg && <p style={{ margin: '12px 0 0 0', fontSize: 12, color: 'var(--danger)' }}>{fileMsg}</p>}
            {pdfStale&&<p role="status">La información cambió. Cierra este panel y genera un PDF actualizado.</p>}
          </div>
        </>,
        document.body,
      )}
      {missingGroups.length > 0 && (
        <div className="card" style={{ padding: 16, marginBottom: 12 }}>
          <strong>Hallazgos fuera del informe ({missingGroups.length})</strong>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            {missingGroups.map((g) => (
              <button
                key={g.id}
                className="btn btn-secondary"
                onClick={() => apply(d => restoreGroupBlock(d, g.id, g.photos.map(p => p.id), g.transcripcion ?? ''))}
              >
                ＋ Hallazgo {groups.length - groups.indexOf(g)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {doc.blocks.map((block, i) => (
          <BlockCard
            key={block.id}
            block={block}
            index={i}
            total={doc.blocks.length}
            group={block.type === 'capture-group' ? groupById.get(block.groupId) : undefined}
            onMove={dir => apply(d => moveReportBlock(d, block.id, dir))}
            onRemove={() => apply(d => removeReportBlock(d, block.id))}
            onPhotos={ids => apply(d => setBlockPhotos(d, block.id, ids))}
            onComment={text => apply(d => setBlockComment(d, block.id, text))}
            onContent={text => apply(d => setTextContent(d, block.id, text))}
            onAddText={() => apply(d => addTextBlock(d, block.id))}
            source={block.type==='header'?<VisitHeaderDetails expediente={expediente} visita={visita}/>:block.type==='checklist'?<ReportChecklist visita={visita} ownerId={ownerId} onSave={onSave} onSaveAnswers={onSaveAnswers} saveBarrier={saveBarrier}/>:block.type==='signatures'?<SignersEditor signers={doc.signers??[]} onChange={signers=>apply(d=>setReportSigners(d,signers))}/>:undefined}
          />
        ))}
      </div>
    </div>
  );
}

function BlockCard({ block, index, total, group, onMove, onRemove, onPhotos, onComment, onContent, onAddText,source }: {
  source?:React.ReactNode;
  block: ReportBlock;
  index: number;
  total: number;
  group?: CaptureGroup;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  onPhotos: (ids: string[]) => void;
  onComment: (text: string) => void;
  onContent: (text: string) => void;
  onAddText: () => void;
}) {
  const locked = block.type === 'header' || block.type === 'checklist' || block.type === 'signatures';
  const title = block.type === 'header' ? 'Cabecera (fija)'
    : block.type === 'checklist' ? 'Checklist (fijo)'
    : block.type === 'capture-group' ? `Hallazgo · ${group ? new Date(group.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '?'}` 
    : block.type === 'conclusions' ? 'Conclusiones'
    : block.type === 'signatures' ? 'Firmas (fijo)'
    : 'Texto';
  return (
    <article className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <strong>{title}</strong>
        <span style={{ flex: 1 }} />
        {!locked && (
          <>
            <button className="btn btn-secondary" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Subir">↑</button>
            <button className="btn btn-secondary" onClick={() => onMove(1)} disabled={index === total - 1} aria-label="Bajar">↓</button>
            <button className="btn btn-secondary" onClick={onRemove} aria-label="Quitar del informe">×</button>
          </>
        )}
      </div>

      {source}

      {block.type === 'capture-group' && (
        <>
          {group?.audio && (
            <div style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', marginBottom: 8 }}>
              <span style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>🎙 Escucha el audio mientras corriges</span>
              <audio controls src={group.audio.displayUrl} style={{ width: '100%', height: 32 }} />
            </div>
          )}
          <textarea
            rows={3}
            value={block.comment}
            onChange={e => onComment(e.target.value)}
            placeholder="Comentario del hallazgo (editable; la transcripción original se conserva en la pestaña Resumen)"
            style={{ width: '100%', marginBottom: 8 }}
          />
          <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#81909d', textTransform: 'uppercase', marginBottom: 8 }}>
            Fotos en el informe ({block.photoIds.length}/{group?.photos.length ?? 0})
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 8 }}>
            {orderedPhotos(group, block.photoIds).map((p) => {
              const included = block.photoIds.includes(p.id);
              return (
                <div key={p.id} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: included ? '2px solid var(--blue-700)' : '1px solid #e2e8f0', opacity: included ? 1 : 0.45 }}>
                  <img src={p.displayUrl} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', background: 'rgba(255,255,255,0.9)' }}>
                    <button style={{ flex: 1 }} onClick={() => {
                      const ids = included ? block.photoIds.filter(id => id !== p.id) : [...block.photoIds, p.id];
                      // Mantener el orden de captura al reincorporar.
                      const order = new Map((group?.photos ?? []).map((ph, idx) => [ph.id, idx]));
                      onPhotos(ids.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)));
                    }}>{included ? '✓' : '＋'}</button>
                    <button
                      disabled={!included || block.photoIds.length < 2}
                      onClick={() => {
                        const ids = [...block.photoIds];
                        const at = ids.indexOf(p.id);
                        const to = (at + block.photoIds.length - 1) % block.photoIds.length;
                        [ids[at], ids[to]] = [ids[to], ids[at]];
                        onPhotos(ids);
                      }}
                    >←</button>
                    <button
                      disabled={!included || block.photoIds.length < 2}
                      onClick={() => {
                        const ids = [...block.photoIds];
                        const at = ids.indexOf(p.id);
                        const to = (at + 1) % block.photoIds.length;
                        [ids[at], ids[to]] = [ids[to], ids[at]];
                        onPhotos(ids);
                      }}
                    >→</button>
                  </div>
                  {included && <span style={{ position: 'absolute', top: 4, left: 4, background: 'var(--blue-700)', color: 'white', fontSize: 10, borderRadius: 8, padding: '0 6px' }}>{block.photoIds.indexOf(p.id) + 1}</span>}
                </div>
              );
            })}
          </div>
          {!group && <p style={{ color: '#991b1b' }}>Este hallazgo aún no está descargado en este dispositivo.</p>}
        </>
      )}

      {block.type === 'text' && (
        <textarea rows={3} value={block.content} onChange={e => onContent(e.target.value)} placeholder="Texto libre…" style={{ width: '100%' }} />
      )}
      {block.type === 'conclusions' && (
        <textarea rows={4} value={block.content} onChange={e => onContent(e.target.value)} placeholder="Conclusiones globales de la visita…" style={{ width: '100%' }} />
      )}

      <div style={{ marginTop: 8 }}>
        <button className="edit-link" onClick={onAddText}>＋ Añadir texto debajo</button>
      </div>
    </article>
  );
}
