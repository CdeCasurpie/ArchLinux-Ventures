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
import {PhotoThumbnail} from './PhotoViewer';
import {SignersEditor} from './Signers';
import {VisitHeaderDetails} from './VisitHeader';
import {ReportChecklist} from './ReportChecklist';
import {SerialAutosave,type SaveStatus} from './serial-autosave';
import type {SaveBarrier} from './save-barrier';
import {reportSource} from './report-source';
import {orderObservations} from './observation-order';
import {reconcileFindings} from './visit-document';
import {subscribeGroupCreated,subscribeMediaSync} from './media-sync';
import {Icon,IconButton} from './ui';

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
  const source=reportSource(doc,visita,expediente,profile,groups.flatMap(group=>group.photos));
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
      const sorted = orderObservations(g);
      setGroups(sorted);
      const parsed = parseReportDocument(visita.documento_json);
      if (parsed) {
        setDoc(reconcileFindings(parsed,sorted));
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
  useEffect(()=>{
   let disposed=false;
   const reload=()=>{void loadCaptureGroups(visita.id).then(groups=>{if(disposed||initedFor.current!==visita.id)return;setGroups(orderObservations(groups));setDoc(current=>current?reconcileFindings(current,groups):current)}).catch(error=>setLoadError(String(error)))};
   const offGroup=subscribeGroupCreated(reload),offSync=subscribeMediaSync(reload);
   return()=>{disposed=true;offGroup();offSync()};
  },[visita.id]);
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
      setPdfMsg('PDF generado.');
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
      <div className="report-toolbar" role="toolbar" aria-label="Acciones del informe">
        {pdfStale&&<span className="status review">PDF anterior desactualizado · vuelve a generarlo</span>}
        <IconButton icon="undo" label="Deshacer" onClick={undo} disabled={!past.length}/>
        <IconButton icon="redo" label="Rehacer" onClick={redo} disabled={!future.length}/>
        <button className="btn btn-secondary" onClick={() => void save().catch(error=>setPdfMsg(`No se pudo guardar: ${String(error)}`))} disabled={saving || (saveStatus!=='error'&&!dirty && !fresh)}>
          {saving ? 'Guardando…' : saveStatus==='error'?'Reintentar guardado':'Guardar informe'}
        </button>
        <button className="btn btn-primary" onClick={() => void generate()} disabled={busy}>
          <span data-tour="pdf">{busy ? 'Generando…' : 'Generar PDF'}</span>
        </button>
      </div>
      <p className="report-save-status" role="status">{saveStatus==='saving'?'Guardando informe en el dispositivo…':saveStatus==='error'?'No se pudo guardar el informe. Reintenta antes de salir.':'Informe guardado en este dispositivo · se sincroniza al tener conexión'}</p>
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
                <Icon name="plus"/> Hallazgo {groups.length - groups.indexOf(g)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {doc.blocks.map((block, i) => (
          <BlockCard
             key={block.id}
             ownerId={ownerId}
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

function BlockCard({ block, index, total, group, onMove, onRemove, onPhotos, onComment, onContent, onAddText,source,ownerId }: {
  ownerId:string;
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
    : block.type === 'checklist' ? 'Plantilla (fija)'
    : block.type === 'capture-group' ? `Hallazgo · ${group ? new Date(group.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '?'}` 
    : block.type === 'conclusions' ? 'Conclusiones'
    : block.type === 'signatures' ? 'Firmas (fijo)'
    : 'Texto';
  return (
    <article className="card report-block">
      <div className="report-block-heading">
        <strong>{title}</strong>
        {!locked && (
          <>
            <IconButton icon="up" label="Subir" onClick={() => onMove(-1)} disabled={index === 0}/>
            <IconButton icon="down" label="Bajar" onClick={() => onMove(1)} disabled={index === total - 1}/>
            <IconButton icon="close" label="Quitar del informe" onClick={onRemove}/>
          </>
        )}
      </div>

      {source}

      {block.type === 'capture-group' && (
        <>
          {group?.audio && (
            <div className="report-audio">
              <span className="report-audio-title"><Icon name="mic"/>Escucha el audio mientras corriges</span>
              <audio controls src={group.audio.displayUrl} style={{ width: '100%', height: 32 }} />
            </div>
          )}
          {group?.transcripcion && (
            <details className="report-transcript">
              <summary>Transcripción original del audio</summary>
              <p>{group.transcripcion}</p>
            </details>
          )}
          <textarea
            aria-label="Comentario del hallazgo"
            rows={3}
            value={block.comment}
            onChange={e => onComment(e.target.value)}
            placeholder="Comentario del hallazgo (editable; la transcripción original se conserva en la pestaña Resumen)"
            style={{ width: '100%', marginBottom: 8 }}
          />
          <span className="report-photo-label">
            Fotos en el informe ({block.photoIds.length}/{group?.photos.length ?? 0})
          </span>
          <div className="report-photos">
            {orderedPhotos(group, block.photoIds).map((p) => {
              const included = block.photoIds.includes(p.id);
              return (
                <div key={p.id} className={`report-photo${included?' report-photo--included':''}`}>
                  <PhotoThumbnail photo={p} visitaId={group!.visitaId} ownerId={ownerId}/>
                  <div className="report-photo-actions">
                    <IconButton icon={included?'check':'plus'} label={included?'Excluir foto del informe':'Incluir foto en el informe'} aria-pressed={included} onClick={() => {
                      const ids = included ? block.photoIds.filter(id => id !== p.id) : [...block.photoIds, p.id];
                      // Mantener el orden de captura al reincorporar.
                      const order = new Map((group?.photos ?? []).map((ph, idx) => [ph.id, idx]));
                      onPhotos(ids.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)));
                    }}/>
                    <IconButton icon="left" label="Mover foto antes"
                      disabled={!included || block.photoIds.length < 2}
                      onClick={() => {
                        const ids = [...block.photoIds];
                        const at = ids.indexOf(p.id);
                        const to = (at + block.photoIds.length - 1) % block.photoIds.length;
                        [ids[at], ids[to]] = [ids[to], ids[at]];
                        onPhotos(ids);
                      }}
                    />
                    <IconButton icon="right" label="Mover foto después"
                      disabled={!included || block.photoIds.length < 2}
                      onClick={() => {
                        const ids = [...block.photoIds];
                        const at = ids.indexOf(p.id);
                        const to = (at + 1) % block.photoIds.length;
                        [ids[at], ids[to]] = [ids[to], ids[at]];
                        onPhotos(ids);
                      }}
                    />
                  </div>
                  {included && <span style={{ position: 'absolute', top: 4, left: 4, background: 'var(--blue-700)', color: 'white', fontSize: 10, borderRadius: 8, padding: '0 6px' }}>{block.photoIds.indexOf(p.id) + 1}</span>}
                </div>
              );
            })}
          </div>
          {!group && <p className="alert error">Este hallazgo aún no está descargado en este dispositivo.</p>}
        </>
      )}

      {block.type === 'text' && (
        <textarea rows={3} value={block.content} onChange={e => onContent(e.target.value)} placeholder="Texto libre…" style={{ width: '100%' }} />
      )}
      {block.type === 'conclusions' && (
        <textarea rows={4} value={block.content} onChange={e => onContent(e.target.value)} placeholder="Conclusiones globales de la visita…" style={{ width: '100%' }} />
      )}

      <div className="report-add-text">
        <button className="edit-link" onClick={onAddText}><Icon name="plus"/>Añadir texto debajo</button>
      </div>
    </article>
  );
}
