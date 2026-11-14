import {useEffect,useMemo,useRef,useState} from 'react';
import type {Visita} from '@archforms/domain';
import {ChecklistForm} from './checklist';
import {TemplateEditor} from './library';
import {SerialAutosave,type SaveStatus} from './serial-autosave';
import type {SaveBarrier} from './save-barrier';

export function ReportChecklist({visita,ownerId,onSave,onSaveAnswers,saveBarrier}:{visita:Visita;ownerId:string;onSave:(v:Visita)=>Promise<void>;onSaveAnswers:(id:string,patch:Record<string,string|number|null>)=>Promise<void>;saveBarrier:SaveBarrier}){
 const [editing,setEditing]=useState(false),[answers,setAnswers]=useState(visita.checklist_respuestas_json),[status,setStatus]=useState<SaveStatus>('saved');
 const current=useRef({visita,onSaveAnswers});current.current={visita,onSaveAnswers};
 const saved=useRef(visita.checklist_respuestas_json);
 const writer=useMemo(()=>new SerialAutosave<Record<string,unknown>>(async next=>{
  const patch:Record<string,string|number|null>={};
  for(const [id,value] of Object.entries(next))if(value!==saved.current[id]){if(value!==null&&typeof value!=='string'&&typeof value!=='number')throw new Error('Respuesta inválida');patch[id]=value}
  if(Object.keys(patch).length)await current.current.onSaveAnswers(current.current.visita.id,patch);
  saved.current=next;
 },setStatus),[visita.id]);
 useEffect(()=>saveBarrier.register(()=>writer.flush()),[saveBarrier,writer]);
 useEffect(()=>{if(status==='saved'){saved.current=visita.checklist_respuestas_json;setAnswers(visita.checklist_respuestas_json)}},[visita.checklist_respuestas_json,status]);
 if(editing)return <TemplateEditor owner={ownerId} source={null} mode="instance" instanceTarget="visita" initialName={visita.checklist_nombre} initialSchema={visita.checklist_esquema_json} onCancel={()=>setEditing(false)} onSave={async result=>{if(result.kind!=='instance')return;await saveBarrier.flush();await onSave({...visita,checklist_nombre:result.nombre,checklist_esquema_json:result.esquema,updated_at:new Date().toISOString()});setEditing(false)}}/>;
 return <><p>Los cambios solo afectan a esta visita; la plantilla, el expediente y las otras visitas conservan sus copias.</p><ChecklistForm schema={visita.checklist_esquema_json} answers={answers} onChange={(id,value)=>{const next={...answers,[id]:value};setAnswers(next);void writer.save(next)}}/>
  <p role="status">{status==='saving'?'Guardando respuestas…':status==='error'?'No se pudieron guardar las respuestas':'Respuestas guardadas en este dispositivo'}</p>
  {status==='error'&&<button className="btn btn-secondary" onClick={()=>void writer.retry()}>Reintentar respuestas</button>}
  <button className="btn btn-secondary" onClick={()=>setEditing(true)}>Añadir o editar campos de esta visita</button>
 </>;
}
