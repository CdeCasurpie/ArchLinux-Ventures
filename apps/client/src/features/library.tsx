import {useState} from 'react';
import {useBackAction} from './back-navigation';
import {assertChecklist,withAvanceObra,AVANCE_OBRA_FIELD_ID,type ChecklistField,type ChecklistFieldType,type ChecklistSchema,type ChecklistSection,type ChecklistTemplate,type Expediente,type WorkspacePending} from '@archforms/domain';import {ChecklistForm} from './checklist';

/** Borrador del expediente que sobrevive el ida y vuelta a la biblioteca (Hilo C). */
export interface TemplateReturnDraft {
 values:Record<string,string>;
 schema:ChecklistSchema;
 checklistName:string;
 templateId:string|null;
 existing:Expediente|null;
 /** Plantilla recién creada: se selecciona y ancla en primera posición. */
 anchor:string|null;
 /** Conserva la guardia de cambios al ir y volver de la biblioteca. */
 dirty?:boolean;
}

const FIELD_TYPES=new Set<string>(['boolean','text','textarea','date','number','percent','select']);
const uid=(prefix:string)=>`${prefix}_${crypto.randomUUID().slice(0,8)}`;

function syncBadge(templateId:string,pending:WorkspacePending[]):{label:string;cls:string}|null{
 const op=pending.find(item=>item.entity==='plantilla'&&item.record.id===templateId);
 if(!op)return null;
 if(op.blocked_error)return {label:'Error al sincronizar',cls:'error'};
 return {label:'Pendiente de subir',cls:'pending'};
}

/** Biblioteca offline-first. Editar una plantilla propia conserva su identidad;
 * los expedientes y las visitas mantienen sus copias. Duplicar crea otra plantilla. */
export function TemplateLibrary({owner,templates,pending,returning,onSave,onReturn}:{owner:string;templates:ChecklistTemplate[];pending:WorkspacePending[];returning:boolean;onSave:(template:ChecklistTemplate)=>Promise<void>;onReturn:(template:ChecklistTemplate)=>void}){
  const [editor,setEditor]=useState<{source:ChecklistTemplate|null;mode:'create'|'duplicate'|'edit'}|null>(null);
 const [preview,setPreview]=useState<ChecklistTemplate|null>(null);
 useBackAction(()=>setPreview(null),Boolean(preview)&&!editor);
 const [search,setSearch]=useState('');
 const [error,setError]=useState('');
 const active=templates.filter(item=>item.activa!==false&&item.nombre.toLowerCase().includes(search.toLowerCase()));
 const platform=active.filter(item=>item.profesional_id===null);
 const mine=active.filter(item=>item.profesional_id!==null);
 const inactive=templates.filter(item=>item.activa===false&&item.profesional_id!==null&&item.nombre.toLowerCase().includes(search.toLowerCase()));

 async function saveTemplate(result:TemplateEditorResult){
  if(result.kind!=='template')return;
  setError('');
  try{await onSave(result.template)}
  catch(err){setError(err instanceof Error?err.message:String(err));throw err}
  if(returning)onReturn(result.template);else setEditor(null);
 }
 async function reactivate(template:ChecklistTemplate){
  try{await onSave({...template,activa:true})}catch(err){setError(err instanceof Error?err.message:String(err))}
 }
  function openEditor(source:ChecklistTemplate|null,mode:'create'|'duplicate'|'edit'){setError('');setEditor({source,mode})}

 if(editor)return <div className="page-enter"><TemplateEditor owner={owner} source={editor.source} mode={editor.mode}
  onCancel={()=>setEditor(null)} onSave={saveTemplate}/></div>;

 if(preview)return <div className="page-enter template-detail">
   <header className="page-heading"><div><p className="eyebrow">VISTA PREVIA</p><h1>{preview.nombre}</h1><p>{preview.esquema.sections.length} secciones · Versión {preview.version}</p></div><button className="btn btn-primary" onClick={()=>{setPreview(null);openEditor(preview,preview.profesional_id===owner?'edit':'duplicate')}}>{preview.profesional_id===owner?'Editar plantilla':'Duplicar y editar'}</button></header>
   <div className="template-preview-note"><span aria-hidden="true">◇</span><p>Los expedientes conservan copias independientes de esta plantilla.</p></div>
  <section className="card template-detail-form" aria-label={`Vista previa de ${preview.nombre}`}><ChecklistForm schema={withAvanceObra(preview.esquema)} answers={{}} readonly/></section>
 </div>;

 return <div className="page-enter">
  <header className="page-heading">
   <div>
     <p className="eyebrow">TU COLECCIÓN</p>
     <h1>Biblioteca de plantillas</h1>
     <p>{returning?'Crea una plantilla; al terminar volverás al expediente con todo intacto.':'Crea, edita y reutiliza tus plantillas. Los expedientes conservan sus propias copias.'}</p>
   </div>
    <button className="btn btn-primary" onClick={()=>openEditor(null,'create')}>＋ Crear plantilla</button>
  </header>
  {returning&&<div className="return-banner">
    <span>Estás creando o editando una plantilla para un expediente.</span>
  </div>}
  {error&&<div className="alert error">{error}</div>}
  <div className="filterbar"><div className="search-field"><SearchIcon/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar plantillas por nombre…"/></div></div>
   <TemplateGroup title="De la plataforma" items={platform} pending={pending} owner={owner} onPreview={setPreview} onEdit={openEditor} onReactivate={reactivate} hint="No se pueden editar; se duplican para crear tu versión."/>
    <TemplateGroup title="Mis plantillas" items={mine} pending={pending} owner={owner} onPreview={setPreview} onEdit={openEditor} onReactivate={reactivate} empty="Aún no tienes plantillas propias. Crea la primera o duplica una de la plataforma." hint="Editarlas no afecta a los expedientes existentes."/>
   {inactive.length>0&&<TemplateGroup title="Desactivados" items={inactive} pending={pending} owner={owner} onPreview={setPreview} onEdit={openEditor} onReactivate={reactivate}/>}
 </div>;
}

function TemplateGroup({title,items,pending,owner,hint,empty,onPreview,onEdit}:{title:string;items:ChecklistTemplate[];pending:WorkspacePending[];owner:string;hint?:string;empty?:string;onPreview:(template:ChecklistTemplate)=>void;onEdit:(source:ChecklistTemplate|null,mode:'create'|'duplicate'|'edit')=>void;onReactivate:(template:ChecklistTemplate)=>Promise<void>}){
 if(!items.length)return empty?<section className="section-heading" style={{marginTop:18}}><p className="eyebrow">{title.toUpperCase()}</p><p style={{color:'var(--muted)',fontSize:12}}>{empty}</p></section>:null;
 return <section style={{marginTop:18}}>
   <div className="section-heading template-group-heading"><h2 style={{fontSize:14}}>{title}</h2>{hint&&<span style={{color:'var(--muted)',fontSize:11}}>{hint}</span>}</div>
   <div className="library-grid">
   {items.map(template=>{
    const own=template.profesional_id===owner,badge=syncBadge(template.id,pending);
    return <article className="card library-card" key={template.id}>
      <button type="button" className="library-preview-trigger" aria-label={`Ver plantilla ${template.nombre}`} onClick={()=>onPreview(template)}>
       <span className="project-icon" aria-hidden="true"><svg width="16" height="18" viewBox="0 0 20 22" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7ZM12 2v5h5M7 11h6M7 15h6"/></svg></span>
       <div className="library-card-copy"><h3 title={template.nombre}>{template.nombre}</h3>
       <p>{template.esquema.sections.length===1?'1 sección':`${template.esquema.sections.length} secciones`} · {(() => { const n = template.esquema.sections.reduce((sum,s)=>sum+s.fields.length,0); return n===1?'1 campo':`${n} campos`; })()} · Versión {template.version}</p>
       {badge&&<span className={`sync-badge ${badge.cls}`}>{badge.label}</span>}
       {!badge&&template.activa===false&&<span className="sync-badge inactive">Desactivada</span>}</div>
      </button>
     <div className="library-actions">
      <button className="btn btn-secondary" onClick={()=>onEdit(template,'duplicate')}>{own?'Duplicar':'Duplicar y editar'}</button>
       {own&&<button className="btn btn-ghost" onClick={()=>onEdit(template,'edit')}>Editar</button>}
     </div>
    </article>;
   })}
  </div>
 </section>;
}

/** Resultado del editor: una plantilla nueva (biblioteca) o el borrador de la
 *  copia propia de un expediente. La instancia nunca escribe en la plantilla. */
export type TemplateEditorResult=
 |{kind:'template';template:ChecklistTemplate}
 |{kind:'instance';nombre:string;esquema:ChecklistSchema};

/** B4 — Editor visual (referencia: constructor de Google Forms) con secciones
 *  y campos plegables. «Avance de obra» es una fila más, bloqueada y translúcida.
 *  `instance` edita la copia del expediente y solo devuelve un borrador. */
export function TemplateEditor({owner,source,mode,initialName,initialSchema,instanceTarget='expediente',onCancel,onSave}:{
  owner:string;source:ChecklistTemplate|null;mode:'create'|'duplicate'|'instance'|'edit';
  initialName?:string;initialSchema?:ChecklistSchema;
  instanceTarget?:'expediente'|'visita';
 onCancel:()=>void;onSave:(result:TemplateEditorResult)=>Promise<void>|void;
}){
 const instance=mode==='instance';
 useBackAction(onCancel);
  const [name,setName]=useState(instance?(initialName??''):source?(mode==='edit'?source.nombre:`${source.nombre} (copia)`):'');
 const [sections,setSections]=useState<ChecklistSection[]>(()=>{
  const base=instance&&initialSchema?structuredClone(initialSchema):source?structuredClone(source.esquema):{version:2 as const,sections:[{id:uid('seccion'),title:'General',fields:[] as ChecklistField[]}]};
  return withAvanceObra(base).sections;
 });
 const [closedSections,setClosedSections]=useState<Record<string,boolean>>({});
 const [openField,setOpenField]=useState<string|null>(null);
 const [openDescriptions,setOpenDescriptions]=useState<Record<string,boolean>>({});
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 function update(mutate:(current:ChecklistSection[])=>ChecklistSection[]){setSections(current=>mutate(structuredClone(current)))}
 function patchField(sectionId:string,fieldId:string,patch:Partial<ChecklistField>){
  update(current=>current.map(section=>section.id!==sectionId?section:{...section,fields:section.fields.map(field=>field.id===fieldId?{...field,...patch}:field)}));
 }
 function move(list:unknown[],at:number,dir:-1|1){const to=at+dir;if(to<0||to>=list.length)return list;const [item]=list.splice(at,1);list.splice(to,0,item)}
 const moveSection=(at:number,dir:-1|1)=>update(current=>{move(current,at,dir);return current});
 const moveField=(sectionId:string,at:number,dir:-1|1)=>update(current=>current.map(section=>section.id!==sectionId?section:{...section,fields:(fields=>{move(fields,at,dir);return fields})([...section.fields])}));
 function addField(sectionId:string){
  const id=uid('campo');
  update(current=>current.map(section=>section.id!==sectionId?section:{...section,fields:[...section.fields,{id,label:'Campo nuevo',type:'boolean' as ChecklistFieldType}]}));
  setOpenField(id);
 }
 function duplicateField(sectionId:string,field:ChecklistField){
  const copy={...structuredClone(field),id:uid('campo'),label:`${field.label} (copia)`};
  update(current=>current.map(section=>section.id!==sectionId?section:{...section,fields:(fields=>{
   fields.splice(fields.findIndex(item=>item.id===field.id)+1,0,copy);return fields;
  })([...section.fields])}));
  setOpenField(copy.id);
 }
 function removeField(sectionId:string,fieldId:string){update(current=>current.map(section=>section.id!==sectionId?section:{...section,fields:section.fields.filter(field=>field.id!==fieldId)}))}
 function removeSection(sectionId:string){update(current=>current.filter(section=>section.id!==sectionId))}
 function addSection(){
  const id=uid('seccion');
  update(current=>[...current,{id,title:`Sección ${current.length+1}`,fields:[]}]);
 }
 const draftSchema:ChecklistSchema={version:2,sections};

 async function submit(){
  setBusy(true);setError('');
   try{
    if(!name.trim())throw new Error('Escribe un título para la plantilla.');
   const esquema=assertChecklist(withAvanceObra(draftSchema));
   if(instance){
     await onSave({kind:'instance',nombre:name.trim(),esquema});
    return;
   }
   const template:ChecklistTemplate={
     id:mode==='edit'&&source?source.id:crypto.randomUUID(),
     codigo:mode==='edit'&&source?source.codigo:`USR-${crypto.randomUUID().replace(/-/g,'').slice(0,8).toUpperCase()}`,
     nombre:name.trim(),version:mode==='edit'&&source?source.version+1:1,
    esquema,profesional_id:owner,activa:true,
   };
   await onSave({kind:'template',template});
  }catch(err){setError(err instanceof Error?err.message:String(err));setBusy(false)}
 }
 const displaySchema=withAvanceObra(draftSchema);
 return <div className="template-editor">
  <header className="page-heading">
   <div>
     <p className="eyebrow">EDITOR DE PLANTILLAS</p>
      <h1>{instance?`Editar plantilla ${instanceTarget==='visita'?'de esta visita':'del expediente'}`:mode==='edit'?'Editar plantilla':mode==='duplicate'?'Duplicar plantilla':'Nueva plantilla'}</h1>
      <p>{instance?(instanceTarget==='visita'?'Pulsa «Usar esta versión» para guardar la plantilla en esta visita. El expediente, la biblioteca y las otras visitas no cambian.':'Los cambios solo afectan a este expediente. Pulsa «Usar esta versión» y luego «Guardar cambios»; las visitas ya creadas no cambian.'):mode==='edit'?'Los cambios se aplicarán a futuros expedientes. Las copias existentes conservan su contenido.':mode==='duplicate'?'Se creará una plantilla nueva. La original y los expedientes existentes no cambian.':'Configura secciones y campos; la vista previa muestra cómo se llenará.'}</p>
   </div>
  </header>
  {error&&<div className="alert error">{error}</div>}
  <div className="editor-layout">
   <div className="editor-main">
     <label className="form-group">Título de la plantilla *<input className="field" required placeholder="Escribe un título" value={name} onChange={e=>setName(e.target.value)}/></label>
    {sections.map((section,si)=>{
     const closed=Boolean(closedSections[section.id]);
     const count=section.fields.length;
     return <section className="card editor-section" key={section.id}>
      <header className="editor-section-head">
       <span className="drag-dots" aria-hidden="true"><DragIcon/></span>
       <div className="editor-tools">
        <button type="button" title={closed?'Expandir sección':'Contraer sección'} aria-expanded={!closed} onClick={()=>setClosedSections(current=>({...current,[section.id]:!current[section.id]}))}><ChevronIcon open={!closed}/></button>
       </div>
       <input className="editor-section-title" value={section.title} aria-label="Título de la sección"
        onChange={e=>{const value=e.target.value;update(current=>current.map(item=>item.id===section.id?{...item,title:value}:item))}}/>
       <span className="chip">{count===1?'1 campo':`${count} campos`}</span>
       <div className="editor-tools">
        <button type="button" title="Subir sección" disabled={si===0} onClick={()=>moveSection(si,-1)}><ChevronIcon up/></button>
        <button type="button" title="Bajar sección" disabled={si===sections.length-1} onClick={()=>moveSection(si,1)}><ChevronIcon/></button>
        <span className="editor-sep" aria-hidden="true"/>
        <button type="button" className="danger" title="Eliminar sección" aria-label="Eliminar sección" disabled={sections.length===1} onClick={()=>removeSection(section.id)}><TrashIcon/></button>
       </div>
      </header>
      {!closed&&<div className="editor-section-body">
       {section.fields.map((field,fi)=>field.id===AVANCE_OBRA_FIELD_ID
        ?<div className="editor-field locked" key={field.id}>
          <div className="editor-field-head">
           <span className="lock-chip" aria-hidden="true"><LockIcon/></span>
           <span className="editor-field-label">{field.label}</span>
           <span className="editor-chips"><span className="chip">Porcentaje</span><span className="chip chip-system">Sistema</span></span>
          </div>
         </div>
        :<FieldRow key={field.id} field={field} sectionId={section.id} at={fi} total={section.fields.length}
          open={openField===field.id} descriptionOpen={Boolean(openDescriptions[field.id])||field.description!==undefined}
          onToggle={()=>setOpenField(current=>current===field.id?null:field.id)}
          onToggleDescription={()=>setOpenDescriptions(current=>({...current,[field.id]:true}))}
          onPatch={patchField} onMove={moveField} onDuplicate={duplicateField} onRemove={removeField}/>)}
       <button type="button" className="editor-add-field" onClick={()=>addField(section.id)}>＋ Añadir campo</button>
      </div>}
     </section>;
    })}
    <button type="button" className="editor-add-section" onClick={addSection}>＋ Añadir sección</button>
    <div className="form-actions">
     <button type="button" className="btn btn-primary btn-lg" disabled={busy} onClick={submit}>{busy?'Guardando…':instance?'Usar esta versión →':mode==='duplicate'?'Crear copia →':'Guardar plantilla →'}</button>
    </div>
   </div>
   <aside className="card editor-preview">
    <p className="eyebrow">VISTA PREVIA</p>
    <p className="editor-preview-hint">Así se verá al llenarlo.</p>
    <ChecklistForm schema={displaySchema} answers={{}} readonly/>
   </aside>
  </div>
 </div>;
}

const TYPE_OPTIONS:Record<ChecklistFieldType,string>={boolean:'Sí/No/N.A.',text:'Texto corto',textarea:'Párrafo',number:'Número',percent:'Porcentaje',date:'Fecha',select:'Lista de opciones'};

/** Fila de campo plegable: la cabecera resume tipo y obligatoriedad; al abrirla
 *  aparecen los ajustes del campo (referencia: constructor de Google Forms). */
function FieldRow({field,sectionId,at,total,open,descriptionOpen,onToggle,onToggleDescription,onPatch,onMove,onDuplicate,onRemove}:{
 field:ChecklistField;sectionId:string;at:number;total:number;open:boolean;descriptionOpen:boolean;
 onToggle:()=>void;onToggleDescription:()=>void;
 onPatch:(sectionId:string,fieldId:string,patch:Partial<ChecklistField>)=>void;
 onMove:(sectionId:string,at:number,dir:-1|1)=>void;
 onDuplicate:(sectionId:string,field:ChecklistField)=>void;
 onRemove:(sectionId:string,fieldId:string)=>void;
}){
 return <div className={`editor-field${open?' open':''}`}>
  <div className="editor-field-head">
   <span className="drag-dots" aria-hidden="true"><DragIcon/></span>
   <button type="button" className="editor-field-toggle" aria-expanded={open} onClick={onToggle}>
    <span className="editor-field-label" title={field.label||undefined}>{field.label||'Campo sin título'}</span>
   </button>
   <span className="editor-chips">
    <span className="chip">{TYPE_OPTIONS[field.type]}</span>
    {field.required&&<span className="chip chip-required">Obligatorio</span>}
   </span>
   <div className="editor-tools">
    <button type="button" title="Subir campo" disabled={at===0} onClick={()=>onMove(sectionId,at,-1)}><ChevronIcon up/></button>
    <button type="button" title="Bajar campo" disabled={at===total-1} onClick={()=>onMove(sectionId,at,1)}><ChevronIcon/></button>
    <button type="button" title="Duplicar campo" aria-label="Duplicar campo" onClick={()=>onDuplicate(sectionId,field)}><CopyIcon/></button>
    <button type="button" className="danger" title="Eliminar campo" aria-label="Eliminar campo" onClick={()=>onRemove(sectionId,field.id)}><TrashIcon/></button>
   </div>
  </div>
  {open&&<div className="editor-field-body">
   <label className="editor-label">Etiqueta del campo
    <input className="field" value={field.label} onChange={e=>onPatch(sectionId,field.id,{label:e.target.value})}/>
   </label>
   <div className="field-config-grid">
    <label className="editor-label">Tipo de respuesta
     <select className="field" value={field.type} onChange={e=>{
      const type=e.target.value as ChecklistFieldType;
      if(!FIELD_TYPES.has(type))return;
      onPatch(sectionId,field.id,type==='select'?{type,options:field.options?.length?[...field.options]:['Opción 1']}:{type});
     }}>{(Object.entries(TYPE_OPTIONS) as [ChecklistFieldType,string][]).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
    </label>
    <label className="editor-label switch-row">Obligatorio
     <span className="switch"><input type="checkbox" checked={Boolean(field.required)} onChange={e=>onPatch(sectionId,field.id,{required:e.target.checked})}/><span aria-hidden="true"/></span>
    </label>
   </div>
   {field.type==='select'&&<div className="options-editor">
    <span className="editor-label">Opciones</span>
    {(field.options??[]).map((option,oi)=><div className="editor-row" key={oi}>
     <input className="field compact" value={option} onChange={e=>{const options=[...(field.options??[])];options[oi]=e.target.value;onPatch(sectionId,field.id,{options})}}/>
     <div className="editor-tools"><button type="button" className="danger" title="Quitar opción" aria-label="Quitar opción" onClick={()=>{const options=[...(field.options??[])];options.splice(oi,1);onPatch(sectionId,field.id,{options})}}><TrashIcon/></button></div>
    </div>)}
    <button type="button" className="link-btn" onClick={()=>onPatch(sectionId,field.id,{options:[...(field.options??[]),'Opción nueva']})}>＋ Añadir opción</button>
   </div>}
   {(field.type==='number'||field.type==='percent')&&<div className="field-config-grid">
    {field.type==='number'&&<label className="editor-label">Unidad<input className="field compact" value={field.unit??''} onChange={e=>onPatch(sectionId,field.id,{unit:e.target.value||undefined})}/></label>}
    <label className="editor-label">Mínimo<input className="field compact" type="number" value={field.min??''} onChange={e=>onPatch(sectionId,field.id,{min:e.target.value===''?undefined:Number(e.target.value)})}/></label>
    <label className="editor-label">Máximo<input className="field compact" type="number" value={field.max??''} onChange={e=>onPatch(sectionId,field.id,{max:e.target.value===''?undefined:Number(e.target.value)})}/></label>
   </div>}
   {descriptionOpen
    ?<label className="editor-label">Descripción (opcional)
      <input className="field" value={field.description??''} onChange={e=>onPatch(sectionId,field.id,{description:e.target.value||undefined})} placeholder="Ayuda breve que verá quien llena la plantilla"/>
     </label>
    :<button type="button" className="link-btn" onClick={onToggleDescription}>＋ Añadir descripción</button>}
  </div>}
 </div>;
}

/* Iconos del editor: trazo fino y consistente con el resto de la interfaz. */
function DragIcon(){
 return <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden="true">
  {[3,7,11].map(y=><g key={y}><circle cx="3" cy={y} r="1.1"/><circle cx="7" cy={y} r="1.1"/></g>)}
 </svg>;
}
function ChevronIcon({up=false,open=true}:{up?:boolean;open?:boolean}){
 const style=up?{transform:'rotate(180deg)'}:open?undefined:{transform:'rotate(-90deg)'};
 return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={style}>
  <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
 </svg>;
}
function TrashIcon(){
 return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
  <path d="M2.8 4.2h10.4M6.2 4.2V3a1 1 0 0 1 1-1h1.6a1 1 0 0 1 1 1v1.2M4.2 4.2l.6 8.2a1.4 1.4 0 0 0 1.4 1.3h3.6a1.4 1.4 0 0 0 1.4-1.3l.6-8.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
 </svg>;
}
function CopyIcon(){
 return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
  <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.4"/>
  <path d="M10.5 4.2v-.6A1.6 1.6 0 0 0 8.9 2H4a1.6 1.6 0 0 0-1.6 1.6V9A1.6 1.6 0 0 0 4 10.6h.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
 </svg>;
}

/** Candado del campo de sistema, alineado con el estilo de iconos del editor. */
function LockIcon(){
 return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
  <rect x="3.2" y="7" width="9.6" height="6.6" rx="1.6" stroke="currentColor" strokeWidth="1.4"/>
  <path d="M5.6 7V5.2a2.4 2.4 0 0 1 4.8 0V7" stroke="currentColor" strokeWidth="1.4"/>
 </svg>;
}

/** Lupa del buscador: el glifo ⌕ no está en todas las fuentes. */
function SearchIcon(){
 return <span className="search-glyph" aria-hidden="true">
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
   <circle cx="7" cy="7" r="4.4" stroke="currentColor" strokeWidth="1.6"/>
   <path d="M10.4 10.4 14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
  </svg>
 </span>;
}
