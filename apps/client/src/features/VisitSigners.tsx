import {useEffect,useMemo,useRef,useState} from 'react';
import {parseReportDocument,setReportSigners,type ReportSigner,type Visita} from '@archforms/domain';
import {SignersEditor} from './Signers';
import {SerialAutosave,type SaveStatus} from './serial-autosave';
import type {SaveBarrier} from './save-barrier';
import {visitDocument} from './visit-document';

export function VisitSigners({visita,onSave,saveBarrier}:{visita:Visita;onSave:(v:Visita)=>Promise<void>;saveBarrier?:SaveBarrier}){
 const [signers,setSigners]=useState<ReportSigner[]>(()=>parseReportDocument(visita.documento_json)?.signers??[]),[status,setStatus]=useState<SaveStatus>('saved');
 const current=useRef({visita,onSave});current.current={visita,onSave};
 const writer=useMemo(()=>new SerialAutosave<ReportSigner[]>(async next=>{
  const {visita,onSave}=current.current;
  const doc=await visitDocument(visita);
  await onSave({...visita,documento_json:setReportSigners(doc,next) as unknown as Record<string,unknown>,updated_at:new Date().toISOString()});
 },setStatus),[visita.id]);
 useEffect(()=>saveBarrier?.register(()=>writer.flush()),[saveBarrier,writer]);
 useEffect(()=>{if(status==='saved')setSigners(parseReportDocument(visita.documento_json)?.signers??[])},[visita.documento_json,status]);
 return <section className="card summary-section"><h3>Firmantes y firmas</h3><SignersEditor signers={signers} onChange={next=>{setSigners(next);void writer.save(next)}}/><p role="status" className="signers-save-status">{status==='saving'?'Guardando firmantes…':status==='error'?'No se pudieron guardar los firmantes':'Firmantes guardados localmente · incluidos en el informe'}</p>{status==='error'&&<button className="btn btn-secondary" onClick={()=>void writer.retry()}>Reintentar firmantes</button>}</section>;
}
