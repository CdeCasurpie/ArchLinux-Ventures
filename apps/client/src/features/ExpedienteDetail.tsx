import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {Expediente,Visita} from '@archforms/domain';
import {useBackAction} from './back-navigation';
import {TrashIcon} from './TrashIcon';

const dateLabel=(date:string)=>new Intl.DateTimeFormat('es-PE',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(`${date}T12:00:00`));
export function ExpedienteDetail({expediente,visitas,onEdit,onVisit,onOpenVisit,onEditReport,creating,onDelete}:{expediente:Expediente;visitas:Visita[];onEdit:()=>void;onVisit:()=>void;onOpenVisit:(id:string)=>void;onEditReport:(id:string)=>void;creating:boolean;onDelete:(entity:'expediente'|'visita',ids:string[])=>Promise<void>}){
 const [selected,setSelected]=useState<string[]>([]),[confirm,setConfirm]=useState<'expediente'|'visita'|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [singleDelete,setSingleDelete]=useState<string|null>(null);
 const deleteIds=singleDelete?[singleDelete]:selected;
 useEffect(()=>{if(!confirm)return;const overflow=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=overflow}},[confirm]);
 function dismissConfirmation(){setConfirm(null);setSingleDelete(null)}
 useBackAction(()=>confirm?dismissConfirmation():setSelected([]),Boolean(confirm)||selected.length>0);
 const toggle=(id:string)=>setSelected(current=>current.includes(id)?current.filter(value=>value!==id):[...current,id]);
 async function remove(){if(!confirm||busy)return;setBusy(true);setError('');try{await onDelete(confirm,confirm==='expediente'?[expediente.id]:deleteIds);dismissConfirmation();setSelected([])}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
  return <div className="page-enter">
   <section className="detail-banner">
    <p className="eyebrow">EXPEDIENTE {expediente.nro_expediente}</p><h1>{expediente.detalle_obra||expediente.propietario||'Obra'}</h1><p>{expediente.ubicacion}</p>
    <div className="detail-meta"><div><span>Propietario</span><strong>{expediente.propietario||'Por completar'}</strong></div><div><span>Licencia</span><strong>{expediente.nro_licencia||'Por completar'}{expediente.modalidad?` · ${expediente.modalidad}`:''}</strong></div><div><span>Vigencia</span><strong>{expediente.vigencia_desde||'—'} — {expediente.vigencia_hasta||'—'}</strong></div><div><span>Plantilla</span><strong>{expediente.checklist_nombre}</strong></div></div>
    <div className="detail-actions"><button className="btn btn-primary btn-lg" disabled={creating} onClick={onVisit}>＋ Nueva visita</button><button className="btn btn-secondary" onClick={onEdit}>Editar expediente</button></div>
    <footer className="detail-footer"><button className="case-delete-action" onClick={()=>setConfirm('expediente')}><TrashIcon/>Eliminar expediente</button></footer>
   </section>
   <section className="card timeline-card"><div className="section-heading"><div><p className="eyebrow">HISTORIAL</p><h2>Visitas de inspección</h2></div><span className="date-chip">{visitas.length}{expediente.total_visitas_programadas?` de ${expediente.total_visitas_programadas}`:''} creadas</span></div>
  {visitas.length>0&&<p className="selection-hint">Mantén pulsada una visita para seleccionar varias.</p>}
  {selected.length>0&&<div className="visit-selection-toolbar"><strong role="status">{selected.length} seleccionadas</strong><button className="btn btn-ghost" onClick={()=>setSelected(visitas.map(v=>v.id))}>Todas</button><button className="btn btn-ghost" onClick={()=>setSelected([])}>Cancelar</button><button className="delete-icon-button" aria-label="Eliminar seleccionadas" title="Eliminar seleccionadas" onClick={()=>setConfirm('visita')}><TrashIcon/></button></div>}
  {[...visitas].sort((a,b)=>b.nro_visita-a.nro_visita).map(item=><SelectableVisit key={item.id} item={item} selecting={selected.length>0} selected={selected.includes(item.id)} onToggle={()=>toggle(item.id)} onOpen={()=>onOpenVisit(item.id)} onReport={()=>onEditReport(item.id)} onDelete={()=>{setSingleDelete(item.id);setConfirm('visita')}}/>)}
 {!visitas.length&&<div className="empty-state"><h3>Aún no hay visitas</h3><p>La primera visita conservará una copia independiente de la plantilla.</p><button className="btn btn-primary" onClick={onVisit}>Nueva visita</button></div>}</section>
  {confirm&&createPortal(<div className="modal-backdrop deletion-backdrop" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" aria-describedby="delete-description">
   <section className="card modal-card deletion-confirm">
    <span className="deletion-icon"><TrashIcon size={20}/></span>
    <h2 id="delete-title">{confirm==='expediente'?'¿Eliminar este expediente?':deleteIds.length===1?'¿Eliminar esta visita?':`¿Eliminar ${deleteIds.length} visitas?`}</h2>
    <div id="delete-description">
     <p>{confirm==='expediente'?<>Se eliminará el expediente <strong>{expediente.nro_expediente}</strong>{visitas.length>0&&<> junto con sus <strong>{visitas.length} visita{visitas.length===1?'':'s'}</strong></>} y todo su contenido.</>:<>Se eliminará{deleteIds.length===1?' esta visita':'n las visitas seleccionadas'} junto con sus fotografías, audios, informes y firmas.</>}</p>
     <p className="deletion-consequence">{confirm==='expediente'?'Todos los hallazgos, fotografías, audios, informes y adjuntos se perderán. ':''}<strong>Esta acción no se puede deshacer.</strong> El cambio se aplicará en todos tus dispositivos al sincronizar.</p>
    </div>
    {error&&<p className="alert error" role="alert">{error}</p>}
    <div className="form-actions"><button autoFocus className="btn btn-secondary" disabled={busy} onClick={dismissConfirmation}>Conservar {confirm==='expediente'?'expediente':deleteIds.length===1?'visita':'visitas'}</button><button className="btn delete-confirm-button" disabled={busy} onClick={()=>void remove()}>{busy?'Eliminando…':confirm==='expediente'?'Eliminar expediente':deleteIds.length===1?'Eliminar visita':'Eliminar visitas'}</button></div>
   </section>
  </div>,document.body)}
 </div>;
}

function SelectableVisit({item,selecting,selected,onToggle,onOpen,onReport,onDelete}:{item:Visita;selecting:boolean;selected:boolean;onToggle:()=>void;onOpen:()=>void;onReport:()=>void;onDelete:()=>void}){
 const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined),origin=useRef<{x:number;y:number}|null>(null),longPressed=useRef(false);
 const cancel=()=>{clearTimeout(timer.current);origin.current=null};
 useEffect(()=>()=>clearTimeout(timer.current),[]);
  return <article className={`visit-row selectable-visit${selecting?' is-selecting':''}${selected?' is-selected':''}`} onContextMenu={e=>e.preventDefault()} onPointerDown={e=>{if((e.target as HTMLElement).closest('button,input'))return;longPressed.current=false;origin.current={x:e.clientX,y:e.clientY};timer.current=setTimeout(()=>{longPressed.current=true;onToggle()},550)}} onPointerMove={e=>{if(origin.current&&Math.hypot(e.clientX-origin.current.x,e.clientY-origin.current.y)>12)cancel()}} onPointerUp={cancel} onPointerCancel={cancel} onPointerLeave={cancel} onClick={e=>{if((e.target as HTMLElement).closest('button,input'))return;if(longPressed.current){longPressed.current=false;return}if(selecting)onToggle();else onOpen()}}>
   {selecting?<input type="checkbox" aria-label={`Seleccionar visita ${item.nro_visita}`} checked={selected} onChange={onToggle}/>:<span className="visit-number">{String(item.nro_visita).padStart(2,'0')}</span>}
   <div className="visit-row-copy"><h3>Visita {String(item.nro_visita).padStart(2,'0')} · {dateLabel(item.fecha)}</h3><p>{item.checklist_nombre} · {item.checklist_completado?'Plantilla completa':'Borrador editable'}</p></div>
   <div className="visit-actions">{!selecting&&<><button className="btn btn-secondary" onClick={onOpen}>Abrir</button>{item.estado==='FINALIZADA'&&<button className="btn btn-secondary" onClick={onReport}>Editar informe</button>}<button className="delete-icon-button" aria-label={`Eliminar visita ${item.nro_visita}`} title="Eliminar visita" onClick={onDelete}><TrashIcon/></button></>}</div>
  </article>;
}
