import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { FileViewer } from '@capacitor/file-viewer';
import { Share } from '@capacitor/share';
import {
  initReportDocument, parseReportDocument, moveReportBlock, removeReportBlock,
  restoreGroupBlock, addTextBlock, setBlockPhotos, setBlockComment, setTextContent,
  isPdfStale, type ReportDocumentV1, type ReportBlock,
} from '@archforms/domain';
import type { Expediente, LocalState, Visita } from '@archforms/domain';
import { loadCaptureGroups, photoDataUrl, type CaptureGroup, type LabPhoto } from './lab-storage';
import { getPendingPdf, setPendingPdf, uploadPdfArtifact } from './media-sync';
import { supabase } from '../platform';
import { Icon } from '../ui/Icon';

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

export function VisitReport({ visita, expediente, profile, ownerId, onSave }: {
  visita: Visita;
  expediente: Expediente;
  profile: LocalState['profile'];
  ownerId: string;
  onSave: (record: Visita) => Promise<void>;
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
  const [pendingPdf, setPendingPdfState] = useState<{ pdfId: string; filename: string } | null>(null);
  const initedFor = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
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
    });
    getPendingPdf(visita.id).then(p => { if (!cancelled) setPendingPdfState(p); }).catch(console.error);
    return () => { cancelled = true; };
  }, [visita.id]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const stale = doc !== null && isPdfStale(doc, visita.estado_documento);
  const groupById = new Map(groups.map(g => [g.id, g]));
  const missingGroups = groups.filter(g => doc && !doc.blocks.some(b => b.type === 'capture-group' && b.groupId === g.id));

  const save = async (next?: ReportDocumentV1) => {
    const target = next ?? doc;
    if (!target) return;
    setSaving(true);
    try {
      await onSave({ ...visita, documento_json: target as unknown as Record<string, unknown>, updated_at: new Date().toISOString() });
      setSavedRevision(target.revision);
    } finally {
      setSaving(false);
    }
  };

  const generate = async () => {
    if (!doc) return;
    // PDF vigente al día: en nativo se ofrece el archivo existente.
    // En web siempre se regenera y descarga a pedido explícito.
    if (visita.estado_documento === 'GENERADO' && !isPdfStale(doc, visita.estado_documento) && Capacitor.isNativePlatform()) {
      const { informeFileName } = await import('@archforms/report-pdf');
      const existing = informeFileName(expediente, visita);
      try {
        await Filesystem.stat({ path: `ArchForms/${existing}`, directory: Directory.Documents });
        setSavedFile({ filename: existing });
        setFileSheetOpen(true);
        return;
      } catch { /* ya no está en disco: regenerar */ }
    }
    setBusy(true);
    setPdfMsg('');
    try {
      // El stack PDF (pesado) se carga diferido: no enlentece el arranque.
      const [{ pdf }, { buildInformeDoc, informeFileName, stampPageNumbers }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@archforms/report-pdf'),
      ]);
      // Fotos resueltas a dataURL desde disco (el displayUrl en memoria puede ser
      // una URL de archivo, que react-pdf no puede incrustar).
      const photos: Record<string, string> = {};
      for (const g of groups) for (const p of g.photos) photos[p.id] = await photoDataUrl(p.path, p.mimeType);
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
        (p, t) => `Pág. ${p}/${t} · Rev. ${doc.revision} · ${expediente.nro_expediente}`,
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
      // Sellar GENERADO con la revisión actual.
      const pdfId = crypto.randomUUID();
      const stamped: ReportDocumentV1 = { ...doc, generatedRevision: doc.revision };
      await onSave({ ...visita, documento_json: stamped as unknown as Record<string, unknown>, estado_documento: 'GENERADO', updated_at: new Date().toISOString() });
      setDoc(stamped);
      setSavedRevision(stamped.revision);
      // Registrar en la nube cuando haya red (reutiliza el remoto de medios).
      if (navigator.onLine) {
        try {
          await uploadPdfArtifact(supabase, ownerId, visita.id, pdfId, filename, bytes);
          await onSave({ ...visita, documento_json: stamped as unknown as Record<string, unknown>, estado_documento: 'GENERADO', pdf_archivo_id: pdfId, updated_at: new Date().toISOString() });
          await setPendingPdf(visita.id, null);
          setPendingPdfState(null);
          setPdfMsg('PDF generado, guardado y subido a la nube.');
        } catch (e) {
          await setPendingPdf(visita.id, { pdfId, filename });
          setPendingPdfState({ pdfId, filename });
          setPdfMsg(`PDF generado en este dispositivo. No se pudo subir: ${e instanceof Error ? e.message : String(e)}`);
        }
      } else {
        await setPendingPdf(visita.id, { pdfId, filename });
        setPendingPdfState({ pdfId, filename });
        setPdfMsg('PDF generado en este dispositivo. Sin conexión: la subida queda pendiente.');
      }
      // Recién al terminar todo (sellado + subida) se abre el panel: los botones ya sirven.
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

  const uploadPending = async () => {
    if (!pendingPdf || !doc) return;
    setBusy(true);
    try {
      const { data } = Capacitor.isNativePlatform()
        ? await Filesystem.readFile({ path: `ArchForms/${pendingPdf.filename}`, directory: Directory.Documents })
        : { data: null };
      if (typeof data !== 'string' || !data) throw new Error('No se encontró el PDF local.');
      const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
      await uploadPdfArtifact(supabase, ownerId, visita.id, pendingPdf.pdfId, pendingPdf.filename, bytes);
      const stamped: ReportDocumentV1 = { ...doc, generatedRevision: doc.revision };
      await onSave({ ...visita, documento_json: stamped as unknown as Record<string, unknown>, estado_documento: 'GENERADO', pdf_archivo_id: pendingPdf.pdfId, updated_at: new Date().toISOString() });
      await setPendingPdf(visita.id, null);
      setPendingPdfState(null);
      setPdfMsg('PDF pendiente subido a la nube.');
    } catch (e) {
      setPdfMsg(`Sigue sin subirse: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  if (!doc) {
    return <article className="card block-card"><p>Preparando el informe…</p></article>;
  }

  return (
    <div className="page-enter">
      <div className="report-toolbar">
        <span className={`badge ${stale ? 'badge-draft' : visita.estado_documento === 'GENERADO' ? 'badge-done' : ''}`}>
          {stale ? 'El PDF no tiene los últimos cambios' : visita.estado_documento === 'GENERADO' ? 'PDF al día' : 'Sin PDF todavía'}
        </span>
        <span className="spacer" />
        <button className="btn btn-ghost" onClick={undo} disabled={!past.length}><Icon name="undo" size={20} />Deshacer</button>
        <button className="btn btn-ghost" onClick={redo} disabled={!future.length}><Icon name="redo" size={20} />Rehacer</button>
        <button className="btn btn-secondary" onClick={() => void save()} disabled={saving || (!dirty && !fresh)}>
          {saving ? 'Guardando…' : dirty || fresh ? 'Guardar cambios' : 'Guardado'}
        </button>
        <button className="btn btn-primary" onClick={() => void generate()} disabled={busy}>
          <Icon name="file" size={20} />{busy ? 'Generando…' : 'Generar PDF'}
        </button>
      </div>
      {pdfMsg && <div className="alert notice" role="status">{pdfMsg}</div>}
      {fileSheetOpen && savedFile && Capacitor.isNativePlatform() && createPortal(
        <>
          <div className="sheet-backdrop" onClick={() => setFileSheetOpen(false)} />
          <div className="sheet" role="dialog" aria-labelledby="pdf-sheet-title">
            <div className="sheet-grip" />
            <div className="sheet-head">
              <div>
                <strong id="pdf-sheet-title"><Icon name="check" />PDF guardado en el teléfono</strong>
                <p>{savedFile.filename} · carpeta Documentos/ArchForms</p>
              </div>
              <button className="icon-btn" aria-label="Cerrar" onClick={() => setFileSheetOpen(false)}><Icon name="close" /></button>
            </div>
            <div className="sheet-actions">
              <button className="btn btn-primary" onClick={() => void openSavedPdf(savedFile.filename)} disabled={busy}>Abrir PDF</button>
              <button className="btn btn-secondary" onClick={() => void shareSavedPdf(savedFile.filename)} disabled={busy}>Compartir</button>
            </div>
            {fileMsg && <p className="finding-note error">{fileMsg}</p>}
          </div>
        </>,
        document.body,
      )}
      {pendingPdf && (
        <div className="alert notice" role="status">
          <span>El PDF {pendingPdf.filename} está guardado aquí pero falta subirlo a la nube.</span>
          <button className="btn btn-secondary" onClick={() => void uploadPending()} disabled={busy || !navigator.onLine}>
            Subir ahora
          </button>
        </div>
      )}

      {missingGroups.length > 0 && (
        <div className="panel missing-groups">
          <strong>{missingGroups.length === 1 ? 'Un hallazgo no está en el informe' : `${missingGroups.length} hallazgos no están en el informe`}</strong>
          <div className="row-actions">
            {missingGroups.map((g) => (
              <button
                key={g.id}
                className="btn btn-secondary"
                onClick={() => apply(d => restoreGroupBlock(d, g.id, g.photos.map(p => p.id), g.transcripcion ?? ''))}
              >
                <Icon name="plus" size={20} />Incluir hallazgo {groups.length - groups.indexOf(g)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="blocks">
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
          />
        ))}
      </div>
    </div>
  );
}

function BlockCard({ block, index, total, group, onMove, onRemove, onPhotos, onComment, onContent, onAddText }: {
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
  const title = block.type === 'header' ? 'Cabecera'
    : block.type === 'checklist' ? 'Checklist'
    : block.type === 'capture-group' ? `Hallazgo de las ${group ? new Date(group.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '…'}`
    : block.type === 'conclusions' ? 'Conclusiones'
    : block.type === 'signatures' ? 'Firmas'
    : 'Texto libre';
  return (
    <article className="card block-card">
      <div className="block-head">
        <strong>{title}</strong>
        {locked ? <span className="lock">Se completa solo</span> : (
          <>
            <button className="icon-btn" onClick={() => onMove(-1)} disabled={index === 0} aria-label={`Subir «${title}»`}><Icon name="up" /></button>
            <button className="icon-btn" onClick={() => onMove(1)} disabled={index === total - 1} aria-label={`Bajar «${title}»`}><Icon name="down" /></button>
            <button className="icon-btn" onClick={onRemove} aria-label={`Quitar «${title}» del informe`}><Icon name="close" /></button>
          </>
        )}
      </div>

      {block.type === 'header' && <p className="block-hint">Datos del expediente y de la visita. Para cambiarlos, edita el expediente.</p>}
      {block.type === 'checklist' && <p className="block-hint">Respuestas del checklist de esta visita. Para cambiarlas, vuelve a la visita, paso 1.</p>}
      {block.type === 'signatures' && <p className="block-hint">Espacios para la firma a mano del responsable de obra y del profesional.</p>}

      {block.type === 'capture-group' && (
        <>
          {group?.audio && (
            <div className="audio-hint">
              <span><Icon name="mic" size={18} />Escucha la nota mientras corriges el texto</span>
              <audio controls src={group.audio.displayUrl} />
            </div>
          )}
          <textarea
            rows={4}
            value={block.comment}
            onChange={e => onComment(e.target.value)}
            aria-label="Texto del hallazgo"
            placeholder="Describe el hallazgo. La transcripción original se conserva en el resumen de la visita."
          />
          <span className="photo-label">Fotos en el informe: {block.photoIds.length} de {group?.photos.length ?? 0}</span>
          <div className="pick-grid">
            {orderedPhotos(group, block.photoIds).map((p) => {
              const included = block.photoIds.includes(p.id);
              const position = block.photoIds.indexOf(p.id) + 1;
              return (
                <div key={p.id} className={`pick ${included ? 'on' : 'off'}`}>
                  <img src={p.displayUrl} alt={included ? `Foto ${position} del hallazgo` : 'Foto no incluida'} />
                  {included && <span className="pick-order">{position}</span>}
                  <div className="pick-bar">
                    <button aria-pressed={included} onClick={() => {
                      const ids = included ? block.photoIds.filter(id => id !== p.id) : [...block.photoIds, p.id];
                      // Mantener el orden de captura al reincorporar.
                      const order = new Map((group?.photos ?? []).map((ph, idx) => [ph.id, idx]));
                      onPhotos(ids.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0)));
                    }}>{included ? 'Quitar' : 'Incluir'}</button>
                    <button
                      aria-label="Mover antes"
                      disabled={!included || block.photoIds.length < 2}
                      onClick={() => {
                        const ids = [...block.photoIds];
                        const at = ids.indexOf(p.id);
                        const to = (at + block.photoIds.length - 1) % block.photoIds.length;
                        [ids[at], ids[to]] = [ids[to], ids[at]];
                        onPhotos(ids);
                      }}
                    ><Icon name="back" size={18} /></button>
                    <button
                      aria-label="Mover después"
                      disabled={!included || block.photoIds.length < 2}
                      onClick={() => {
                        const ids = [...block.photoIds];
                        const at = ids.indexOf(p.id);
                        const to = (at + 1) % block.photoIds.length;
                        [ids[at], ids[to]] = [ids[to], ids[at]];
                        onPhotos(ids);
                      }}
                    ><Icon name="chevron" size={18} /></button>
                  </div>
                </div>
              );
            })}
          </div>
          {!group && <p className="finding-note error">Las fotos de este hallazgo aún no se descargan en este dispositivo. Usa «Traer de la nube» en el resumen de la visita.</p>}
        </>
      )}

      {block.type === 'text' && (
        <textarea rows={3} value={block.content} onChange={e => onContent(e.target.value)} aria-label="Texto libre" placeholder="Escribe un párrafo para el informe" />
      )}
      {block.type === 'conclusions' && (
        <textarea rows={5} value={block.content} onChange={e => onContent(e.target.value)} aria-label="Conclusiones" placeholder="Conclusiones generales de la visita (opcional)" />
      )}

      <button className="link-button" onClick={onAddText}><Icon name="plus" size={18} />Añadir un párrafo debajo</button>
    </article>
  );
}
