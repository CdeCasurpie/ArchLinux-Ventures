import {useState} from 'react';
import {checklistStats,sectionStats,AVANCE_OBRA_FIELD_ID,type ChecklistField,type ChecklistSchema} from '@archforms/domain';

/**
 * ChecklistForm — render compartido del formulario dinámico (sección 4).
 * Misma fidelidad en los tres lugares donde aparece: la visita (editable),
 * la vista previa del expediente y la biblioteca de plantillas (readonly).
 * El campo de sistema «Avance de obra» se muestra como tarjeta destacada.
 */
export function ChecklistForm({schema,answers,onChange,readonly=false}:{schema:ChecklistSchema;answers:Record<string,unknown>;onChange?:(id:string,value:string|number|null)=>void;readonly?:boolean}){
 const avance=schema.sections.flatMap(section=>section.fields).find(field=>field.id===AVANCE_OBRA_FIELD_ID);
 const [closed,setClosed]=useState<Record<string,boolean>>({});
 const setValue=(id:string,value:string|number|null)=>onChange?.(id,value);
 return <div className="checklist-form">
  {avance&&<AvanceCard field={avance} value={answers[avance.id]} onChange={value=>setValue(avance.id,value)} readonly={readonly}/>}
  {schema.sections.map((section,index)=>{
   const fields=section.fields.filter(field=>field.id!==AVANCE_OBRA_FIELD_ID);
   if(!fields.length)return null;
   const stats=sectionStats(section,answers);
   const collapsed=Boolean(closed[section.id]);
   return <section className={`check-group${collapsed?' collapsed':''}`} key={section.id}>
    <button type="button" className="check-group-head" aria-expanded={!collapsed}
     onClick={()=>setClosed(current=>({...current,[section.id]:!current[section.id]}))}>
     <span className="check-group-chev" aria-hidden="true"><ChevronIcon open={!collapsed}/></span>
     <span className="check-group-index" aria-hidden="true">{index+1}</span>
     <h3>{section.title}</h3>
     <span className="check-group-meta">{stats.answered} de {stats.total} respondidas</span>
    </button>
    {!collapsed&&fields.map(field=><div className="check-item" key={field.id}>
     <div><strong>{field.label}{field.required&&<span className="required"> *</span>}</strong>{field.description&&<small>{field.description}</small>}</div>
     <FieldControl field={field} value={answers[field.id]} onChange={value=>setValue(field.id,value)} readonly={readonly}/>
    </div>)}
   </section>;
  })}
 </div>;
}

/** Chevron de sección plegable, compartido con el editor de plantillas. */
function ChevronIcon({open}:{open:boolean}){
 return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"
  style={open?undefined:{transform:'rotate(-90deg)'}}>
  <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
 </svg>;
}

function AvanceCard({field,value,onChange,readonly}:{field:ChecklistField;value:unknown;onChange:(value:string|number|null)=>void;readonly:boolean}){
 const text=String(value??'');
 return <div className="avance-card">
  <div><strong>{field.label}</strong><small>{field.description??'Porcentaje de avance de la obra'}</small></div>
  {readonly
   ?<span className="avance-value">{value===undefined||value===null||value===''?'—':`${value} %`}</span>
   :<span className="avance-input"><input type="number" min={0} max={100} inputMode="decimal" value={text}
     onChange={e=>onChange(e.target.value===''?'':Math.max(0,Math.min(100,Number(e.target.value))))}/><i>%</i></span>}
 </div>;
}

function FieldControl({field,value,onChange,readonly}:{field:ChecklistField;value:unknown;onChange:(value:string|number|null)=>void;readonly:boolean}){
 const text=String(value??'');
 if(field.type==='boolean'){
  return <div className="segmented">{([['si','Sí'],['no','No'],['na','N/A']] as const).map(([option,label])=>
   <button key={option} type="button" disabled={readonly} className={value===option?'active':''} onClick={()=>onChange(value===option?null:option)}>{label}</button>)}</div>;
 }
 if(field.type==='select'){
  const options=field.options??[];
  return <select className="field inline-field" value={text} disabled={readonly} onChange={e=>onChange(e.target.value||null)}>
   <option value="">Sin responder</option>
   {options.map(option=><option key={option} value={option}>{option}</option>)}
  </select>;
 }
 if(field.type==='textarea'){
  return <textarea rows={3} value={text} disabled={readonly} onChange={e=>onChange(e.target.value)}/>;
 }
 if(field.type==='number'){
  return <span className="unit-field">
   <input className="field inline-field" type="number" inputMode="decimal" min={field.min} max={field.max} value={text} disabled={readonly}
    onChange={e=>onChange(e.target.value===''?'':Number(e.target.value))}/>
   {field.unit&&<i>{field.unit}</i>}
  </span>;
 }
 if(field.type==='percent'){
  return <span className="unit-field">
   <input className="field inline-field" type="number" inputMode="decimal" min={0} max={100} value={text} disabled={readonly}
    onChange={e=>onChange(e.target.value===''?'':Math.max(0,Math.min(100,Number(e.target.value))))}/>
   <i>%</i>
  </span>;
 }
 return <input className="field inline-field" type={field.type==='date'?'date':'text'} value={text} disabled={readonly}
  onChange={e=>onChange(e.target.value)}/>;
}

/** Etiqueta de progreso reutilizada por la cabecera de la visita y el aside. */
export function progressLabel(schema:ChecklistSchema,answers:Record<string,unknown>):string{
 const stats=checklistStats(schema,answers);
 return `${stats.answered} de ${stats.total} · ${stats.progress}%`;
}
