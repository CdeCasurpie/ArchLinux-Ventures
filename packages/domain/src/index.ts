export type Profile = {
 id:string; email:string; nombre_completo:string; cargo:string|null;
 nro_colegiatura:string|null; firma_imagen?:string|null; updated_at:string;
};
export type ProfileEdit = Pick<Profile,'nombre_completo'|'cargo'|'nro_colegiatura'|'firma_imagen'>;
export type Pending = {id:string; owner:string; base:string; edit:ProfileEdit};
export type LocalState = {profile:Profile|null; pending:Pending|null};
export class ConflictError extends Error { constructor(){super('El perfil cambió en otro dispositivo. Revisa ambas versiones.')} }
export function validateProfile(edit:ProfileEdit):ProfileEdit {
 const nombre=edit.nombre_completo.trim();
 if(nombre.length<2 || nombre.length>160) throw new Error('Escribe un nombre de 2 a 160 caracteres.');
 if((edit.cargo?.length??0)>160 || (edit.nro_colegiatura?.length??0)>40) throw new Error('Revisa la longitud del cargo y la colegiatura.');
  if(edit.firma_imagen&&(!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(edit.firma_imagen)||edit.firma_imagen.length>160000))throw new Error('Imagen de firma inválida o demasiado grande');
  return {nombre_completo:nombre,cargo:edit.cargo?.trim()||null,nro_colegiatura:edit.nro_colegiatura?.trim()||null,...(edit.firma_imagen===undefined?{}:{firma_imagen:edit.firma_imagen})};
}

/** Catálogo de campos del checklist dinámico (sección 4 del documento de cambios).
 *  `textarea` es el párrafo largo; `percent` es 0–100 (avance de obra); `select`
 *  elige una opción de una lista configurable. */
export type ChecklistFieldType='boolean'|'text'|'textarea'|'date'|'number'|'percent'|'select';
export interface ChecklistField {
 id:string;label:string;description?:string;type:ChecklistFieldType;required?:boolean;
 /** `select`: lista de opciones (al menos una). */
 options?:string[];
 /** `number`/`percent`: rango permitido. */
 min?:number;max?:number;
 /** `number`: sufijo de unidad mostrado (m, m², S/, mm…). */
 unit?:string;
}
export interface ChecklistSection {id:string;title:string;fields:ChecklistField[]}
/** v1 es el esquema histórico (4 tipos); v2 añade el catálogo dinámico. Ambas
 *  versiones son válidas y se leen igual — v2 es la que se crea de ahora en adelante. */
export interface ChecklistSchema {version:1|2;sections:ChecklistSection[]}
export interface ChecklistTemplate {id:string;codigo:string;nombre:string;version:number;esquema:ChecklistSchema;profesional_id:string|null;activa?:boolean}
export interface Expediente {
 id:string;profesional_id:string;nro_expediente:string;nro_licencia:string|null;modalidad:string|null;
 entidad_destinataria:string|null;fecha_emision_licencia:string|null;vigencia_desde:string|null;vigencia_hasta:string|null;
 propietario:string|null;ubicacion:string;distrito:string|null;provincia:string|null;departamento:string|null;
 tipo_obra:string|null;uso_predio:string|null;detalle_obra:string|null;valor_obra:number|null;
 total_visitas_programadas:number|null;responsable_obra_nombre:string|null;responsable_obra_colegiatura:string|null;
 poliza_car_json:Record<string,unknown>|null;datos_cabecera_extra:Record<string,unknown>|null;
 checklist_nombre:string;checklist_esquema_json:ChecklistSchema;checklist_template_id:string|null;activo:boolean;created_at:string;updated_at:string;
}
export interface Visita {
 id:string;expediente_id:string;nro_visita:number;codigo_informe:string|null;fecha:string;
 estado:'BORRADOR'|'EN_CAMPO'|'EN_REVISION'|'FINALIZADA'|'ARCHIVADA';checklist_nombre:string;
 checklist_esquema_json:ChecklistSchema;checklist_respuestas_json:Record<string,unknown>;checklist_completado:boolean;
 checklist_template_id:string|null;
 documento_json:Record<string,unknown>;estado_documento:'BORRADOR'|'GENERADO';responsable_obra_nombre:string|null;
 pdf_archivo_id:string|null;responsable_obra_colegiatura:string|null;created_at:string;updated_at:string;
}
export type WorkspaceEntity='expediente'|'visita'|'plantilla';
export function informeFileName(expediente:Pick<Expediente,'nro_expediente'>,visita:Pick<Visita,'nro_visita'>):string{
 const exp=expediente.nro_expediente.replace(/[^A-Za-z0-9_-]+/g,'_');
 return `Informe-${exp}-V${String(visita.nro_visita).padStart(2,'0')}.pdf`;
}
export interface WorkspacePending {id:string;entity:WorkspaceEntity;record:Expediente|Visita|ChecklistTemplate;created_at:string;answer_patch?:Record<string,string|number|null>;preserve_answers?:boolean;protocol?:1;workspace_mutation?:{type:'create'|'patch'|'delete';payload:Record<string,unknown>};blocked_error?:string}
export interface WorkspaceState {expedientes:Expediente[];visitas:Visita[];plantillas:ChecklistTemplate[];pending:WorkspacePending[];last_sync:string|null;sync_cursor?:number}
export interface ReplicaInfo {cursor:number;partial:boolean;deleted:{entity:WorkspaceEntity;id:string}[]}
export function assertChecklist(schema:ChecklistSchema){
  if(schema.version!==1&&schema.version!==2)throw new Error('Versión de plantilla no soportada.');
  if(!schema.sections.length)throw new Error('La plantilla necesita al menos una sección.');
 const ids=new Set<string>();
 for(const section of schema.sections){
  if(!section.title.trim())throw new Error('Cada sección necesita un título.');
  for(const field of section.fields){
   if(!field.label.trim())throw new Error('Cada campo necesita una etiqueta.');
    if(ids.has(field.id))throw new Error('Los identificadores de la plantilla deben ser únicos.');
   ids.add(field.id);
   if(field.type==='select'){
    const options=field.options??[];
    if(!options.length)throw new Error(`El campo «${field.label}» necesita al menos una opción.`);
    if(options.some(option=>!option.trim()))throw new Error(`Las opciones de «${field.label}» no pueden quedar vacías.`);
   }
   if((field.type==='number'||field.type==='percent')&&(field.min!==undefined||field.max!==undefined)){
    const min=field.min,max=field.max;
    if(min!==undefined&&max!==undefined&&min>max)throw new Error(`El rango de «${field.label}» es inválido.`);
    if(field.type==='percent'&&((min!==undefined&&(min<0||min>100))||(max!==undefined&&(max<0||max>100))))
     throw new Error(`El porcentaje de «${field.label}» debe estar entre 0 y 100.`);
   }
  }
 }
 return schema;
}

/** Id del campo de sistema «Avance de obra»: porcentaje obligatorio inyectado
 *  por la aplicación (sección 4). La BD ya lo espeja en `visita.avance_general`. */
export const AVANCE_OBRA_FIELD_ID='avance_obra';
export const avanceObraField:ChecklistField={id:AVANCE_OBRA_FIELD_ID,label:'Avance de obra',description:'Porcentaje de avance de la obra en esta visita',type:'percent',required:true};
/** Garantiza que el esquema contenga el campo de sistema; no muta el original. */
export function withAvanceObra(schema:ChecklistSchema):ChecklistSchema{
 if(schema.sections.some(section=>section.fields.some(field=>field.id===AVANCE_OBRA_FIELD_ID)))return schema;
 const sections=schema.sections.length?schema.sections.slice():[{id:'general',title:'General',fields:[]as ChecklistField[]}];
 sections[sections.length-1]={...sections[sections.length-1],fields:[...sections[sections.length-1].fields,avanceObraField]};
 return {...schema,sections};
}
/** Acepta esquemas v1 y v2; devuelve un esquema normalizado v2 (v1 ⊂ v2). */
export function parseChecklistSchema(raw:unknown):ChecklistSchema|null{
 if(typeof raw!=='object'||!raw)return null;
 const candidate=raw as {version?:unknown;sections?:unknown};
 if(candidate.version!==1&&candidate.version!==2||!Array.isArray(candidate.sections))return null;
 return {version:candidate.version,sections:structuredClone(candidate.sections) as ChecklistSection[]};
}

/** 9.3: solo los campos obligatorios impiden la completitud del checklist;
 *  los opcionales vacíos no cuentan como formulario incompleto.
 *  «Respondida» es igual para todos los tipos: un 0 numérico SÍ responde. */
export function isAnsweredValue(value:unknown):boolean{
 return value!==undefined&&value!==null&&value!=='';
}
export function checklistCompleted(schema:ChecklistSchema,answers:Record<string,unknown>):boolean{
 return schema.sections.flatMap(section=>section.fields).every(field=>!field.required||
  isAnsweredValue(answers[field.id]));
}
/** Progreso del checklist (9.4): global y por sección, contando respuestas reales. */
export function checklistStats(schema:ChecklistSchema,answers:Record<string,unknown>){
 const fields=schema.sections.flatMap(section=>section.fields);
 const answered=fields.filter(field=>isAnsweredValue(answers[field.id])).length;
 return {
  total:fields.length,answered,
  progress:fields.length?Math.round(answered/fields.length*100):0,
  missingRequired:fields.filter(field=>field.required&&!isAnsweredValue(answers[field.id])).length,
 };
}
export function sectionStats(section:ChecklistSection,answers:Record<string,unknown>){
 return {
  total:section.fields.length,
  answered:section.fields.filter(field=>isAnsweredValue(answers[field.id])).length,
 };
}

// ── Capture-media domain types (Iteración 4) ──────────────────────────────────
export type MediaSyncStatus  = 'pending'|'uploading'|'synced'|'error';
export type EntitySyncStatus = 'pending'|'syncing'|'synced'|'error';

export interface MediaOutboxItem {
 id:string;entity_type:'foto'|'audio';entity_id:string;grupo_id:string;visita_id:string;
 local_path:string;mime_type:string;size_bytes:number;checksum:string;
 bucket_path:string|null;attempts:number;last_error:string|null;next_retry:string|null;
 status:MediaSyncStatus;created_at:string;
}

export interface EntityOutboxItem {
 id:string;entity_type:'grupo_captura';payload:string;depends_on:string[];
 attempts:number;last_error:string|null;next_retry:string|null;
 status:EntitySyncStatus;created_at:string;
}

// ── Capture pull (nube → local) ─────────────────────────────────────────────
// Formas remotas mínimas para hidratar un dispositivo que nunca capturó.
// El merge es por unión: lo solo-local se conserva, lo remoto se espeja.
export interface RemoteArchivo {
 id:string;tipo:'IMAGEN'|'AUDIO'|'DOCUMENTO'|'PDF';storage_key:string|null;
 mime_type:string;tamanio_bytes:number|null;checksum_sha256:string|null;
}
export interface RemoteGrupo {
 id:string;visita_id:string;orden:number;audio_archivo_id:string|null;
 transcripcion_original:string|null;audio_duracion_ms:number|null;
 iniciado_at:string;confirmado_at:string|null;
}
export interface RemoteFoto {
 id:string;visita_id:string;grupo_captura_id:string|null;archivo_id:string;
 orden_en_grupo:number|null;capturada_at:string;
}

// ── ReportDocumentV1 (Iteración 5) ───────────────────────────────────────────
// Árbol de presentación del informe. No copia binarios: los bloques referencian
// grupos/fotos por id. Cabecera, checklist y firmas siempre existen y locked
// significa: no se elimina ni se mueve (su contenido se edita en su fuente).
export type ReportBlock =
 |{id:string;type:'header';locked:true}
 |{id:string;type:'checklist';locked:true}
 |{id:string;type:'capture-group';groupId:string;photoIds:string[];comment:string;commentEdited?:boolean}
 |{id:string;type:'text';content:string}
 |{id:string;type:'conclusions';content:string}
 |{id:string;type:'signatures';locked:true};

export interface ReportDocumentV1 {
  knownCaptureGroups?:string[];
  schemaVersion:1;revision:number;blocks:ReportBlock[];
  /** Imágenes pequeñas de firma manuscrita; no son firmas digitales certificadas. */
  signers?:ReportSigner[];
 /** Revisión con la que se generó el PDF vigente (ausente = nunca generado). */
 generatedRevision?:number;
}

export interface ReportSigner { id:string; nombre:string; cargo:string; colegiatura:string; image?:string }
export function setReportSigners(doc:ReportDocumentV1,signers:ReportSigner[]):ReportDocumentV1 {
 if(signers.length>6)throw new Error('Se admiten hasta seis firmantes');
 for(const signer of signers){
  if(signer.image&&(!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(signer.image)||signer.image.length>160000))throw new Error('Imagen de firma inválida o demasiado grande');
 }
 return {...doc,revision:doc.revision+1,signers:structuredClone(signers)};
}

const uid=()=>`b_${Math.random().toString(36).slice(2,10)}`;

/** Inicializa el documento desde la visita y sus grupos (solo si no existe). */
export function initReportDocument(groups:Array<{id:string;photoIds:string[];comment:string}>):ReportDocumentV1{
 return {
  schemaVersion:1,revision:1,
  blocks:[
   {id:uid(),type:'header',locked:true},
   {id:uid(),type:'checklist',locked:true},
   ...groups.map(g=>({id:uid(),type:'capture-group',groupId:g.id,photoIds:[...g.photoIds],comment:g.comment} as ReportBlock)),
   {id:uid(),type:'conclusions',content:''},
   {id:uid(),type:'signatures',locked:true},
  ],
 };
}

/** Valida un documento guardado; null si hay que re-inicializar. */
export function parseReportDocument(json:unknown):ReportDocumentV1|null{
 if(typeof json!=='object'||!json)return null;
 const doc=json as Partial<ReportDocumentV1>;
 if(doc.schemaVersion!==1||!Array.isArray(doc.blocks)||typeof doc.revision!=='number')return null;
 const blocks:ReportBlock[]=[];
 for(const b of doc.blocks){
  if(typeof b!=='object'||!b)return null;
  const block=b as Partial<ReportBlock>&{groupId?:unknown;photoIds?:unknown;comment?:unknown;content?:unknown};
  if(block.type==='header'||block.type==='checklist'||block.type==='signatures'){
   blocks.push({id:String((block as {id?:unknown}).id??uid()),type:block.type,locked:true});
  }else if(block.type==='capture-group'){
   if(typeof block.groupId!=='string'||!Array.isArray(block.photoIds))return null;
    blocks.push({id:String((block as {id?:unknown}).id??uid()),type:'capture-group',groupId:block.groupId,photoIds:block.photoIds.filter((p):p is string=>typeof p==='string'),comment:typeof block.comment==='string'?block.comment:'',...(block.commentEdited===true?{commentEdited:true}:{})});
  }else if(block.type==='text'||block.type==='conclusions'){
   blocks.push({id:String((block as {id?:unknown}).id ?? uid()),type:block.type,content:typeof block.content==='string'?block.content:''});
  }else return null;
 }
 if(!blocks.some(b=>b.type==='header')||!blocks.some(b=>b.type==='checklist')||!blocks.some(b=>b.type==='signatures'))return null;
 if(doc.signers!==undefined&&(!Array.isArray(doc.signers)||doc.signers.length>6||doc.signers.some(s=>!s||typeof s.id!=='string'||typeof s.nombre!=='string'||typeof s.cargo!=='string'||typeof s.colegiatura!=='string'||(s.image!==undefined&&(typeof s.image!=='string'||!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(s.image)||s.image.length>160000)))))return null;
  return {schemaVersion:1,revision:doc.revision,generatedRevision:typeof doc.generatedRevision==='number'?doc.generatedRevision:undefined,blocks,...(Array.isArray(doc.knownCaptureGroups)?{knownCaptureGroups:doc.knownCaptureGroups.filter((id):id is string=>typeof id==='string')} :{}),...(doc.signers?{signers:structuredClone(doc.signers)}:{})};
}

function bump(doc:ReportDocumentV1,blocks:ReportBlock[]):ReportDocumentV1{
 return {...doc,revision:doc.revision+1,blocks};
}
const isLocked=(b:ReportBlock)=>b.type==='header'||b.type==='checklist'||b.type==='signatures';

/** Mueve un bloque no-locked ±1. Fuera de rango o locked → mismo documento. */
export function moveReportBlock(doc:ReportDocumentV1,id:string,dir:-1|1):ReportDocumentV1{
 const i=doc.blocks.findIndex(b=>b.id===id);
 if(i<0)return doc;
 const block=doc.blocks[i];
 if(isLocked(block))return doc;
 const j=i+dir;
 if(j<0||j>=doc.blocks.length)return doc;
 if(isLocked(doc.blocks[j]))return doc;
 const blocks=[...doc.blocks];
 blocks[i]=blocks[j];blocks[j]=block;
 return bump(doc,blocks);
}

/** Elimina un bloque no-locked (las fotos originales no se tocan). */
export function removeReportBlock(doc:ReportDocumentV1,id:string):ReportDocumentV1{
 const block=doc.blocks.find(b=>b.id===id);
 if(!block||isLocked(block))return doc;
 return bump(doc,doc.blocks.filter(b=>b.id!==id));
}

/** Restaura el bloque de un grupo capturado (si no está ya en el documento).
 *  Los hallazgos nuevos van siempre encima de las conclusiones. */
export function restoreGroupBlock(doc:ReportDocumentV1,groupId:string,photoIds:string[],comment:string):ReportDocumentV1{
 if(doc.blocks.some(b=>b.type==='capture-group'&&b.groupId===groupId))return doc;
 const block:ReportBlock={id:uid(),type:'capture-group',groupId,photoIds:[...photoIds],comment};
 const blocks=[...doc.blocks];
 const conclusions=blocks.findIndex(b=>b.type==='conclusions');
 const sig=blocks.findIndex(b=>b.type==='signatures');
 const at=conclusions>=0?conclusions:(sig<0?blocks.length:sig);
 blocks.splice(at,0,block);
 return bump(doc,blocks);
}

export function addTextBlock(doc:ReportDocumentV1,afterId?:string):ReportDocumentV1{
 const block:ReportBlock={id:uid(),type:'text',content:''};
 const blocks=[...doc.blocks];
 const i=afterId?blocks.findIndex(b=>b.id===afterId):-1;
 blocks.splice(i<0?blocks.length:i+1,0,block);
 return bump(doc,blocks);
}

export function setBlockPhotos(doc:ReportDocumentV1,id:string,photoIds:string[]):ReportDocumentV1{
 const blocks=doc.blocks.map(b=>b.type==='capture-group'&&b.id===id?{...b,photoIds:[...photoIds]}:b);
 return bump(doc,blocks);
}

export function setBlockComment(doc:ReportDocumentV1,id:string,comment:string):ReportDocumentV1{
  const blocks=doc.blocks.map(b=>b.type==='capture-group'&&b.id===id?{...b,comment,commentEdited:true}:b);
 return bump(doc,blocks);
}

export function setTextContent(doc:ReportDocumentV1,id:string,content:string):ReportDocumentV1{
 const blocks=doc.blocks.map(b=>(b.type==='text'||b.type==='conclusions')&&b.id===id?{...b,content}:b);
 return bump(doc,blocks);
}

/** True cuando el PDF vigente está desactualizado respecto al documento. */
export function isPdfStale(doc:ReportDocumentV1,generado:Visita['estado_documento']):boolean{
 return generado==='GENERADO'&&doc.generatedRevision!==undefined&&doc.generatedRevision!==doc.revision;
}

// ── Capture-media domain types (Iteración 4) ──────────────────────────────────
// El sync usa el modelo aprobado de 9 tablas: cada binario es un `archivo`
// (storage_key en el bucket `visita-media`), agrupado por `grupo_captura`
// y referenciado por `foto.archivo_id`. Sin tablas nuevas.
export interface GrupoCapturaPayload {
 id:string;visita_id:string;profesional_id:string;
 iniciado_at:string;confirmado_at:string;
 transcripcion:string|null;
 audio:{
  id:string;local_path:string;remote_path:string|null;
  mime_type:string;duration_ms:number;size_bytes:number;checksum:string;created_at:string;
 };
 fotos:Array<{
  id:string;archivo_id:string;orden_en_grupo:number;capturada_at:string;
  local_path:string;remote_path:string|null;
  mime_type:string;size_bytes:number;checksum:string;
 }>;
}
