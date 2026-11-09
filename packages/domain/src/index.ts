export type Profile = {
 id:string; email:string; nombre_completo:string; cargo:string|null;
 nro_colegiatura:string|null; updated_at:string;
};
export type ProfileEdit = Pick<Profile,'nombre_completo'|'cargo'|'nro_colegiatura'>;
export type Pending = {id:string; owner:string; base:string; edit:ProfileEdit};
export type LocalState = {profile:Profile|null; pending:Pending|null};
export class ConflictError extends Error { constructor(){super('El perfil cambió en otro dispositivo. Revisa ambas versiones.')} }
export function validateProfile(edit:ProfileEdit):ProfileEdit {
 const nombre=edit.nombre_completo.trim();
 if(nombre.length<2 || nombre.length>160) throw new Error('Escribe un nombre de 2 a 160 caracteres.');
 if((edit.cargo?.length??0)>160 || (edit.nro_colegiatura?.length??0)>40) throw new Error('Revisa la longitud del cargo y la colegiatura.');
 return {nombre_completo:nombre,cargo:edit.cargo?.trim()||null,nro_colegiatura:edit.nro_colegiatura?.trim()||null};
}

export type ChecklistFieldType='boolean'|'text'|'date'|'number';
export interface ChecklistField {id:string;label:string;description?:string;type:ChecklistFieldType;required?:boolean}
export interface ChecklistSection {id:string;title:string;fields:ChecklistField[]}
export interface ChecklistSchema {version:1;sections:ChecklistSection[]}
export interface ChecklistTemplate {id:string;codigo:string;nombre:string;version:number;esquema:ChecklistSchema;profesional_id:string|null}
export interface Expediente {
 id:string;profesional_id:string;nro_expediente:string;nro_licencia:string|null;modalidad:string|null;
 entidad_destinataria:string|null;fecha_emision_licencia:string|null;vigencia_desde:string|null;vigencia_hasta:string|null;
 propietario:string|null;ubicacion:string;distrito:string|null;provincia:string|null;departamento:string|null;
 tipo_obra:string|null;uso_predio:string|null;detalle_obra:string|null;valor_obra:number|null;
 total_visitas_programadas:number|null;responsable_obra_nombre:string|null;responsable_obra_colegiatura:string|null;
 poliza_car_json:Record<string,unknown>|null;datos_cabecera_extra:Record<string,unknown>|null;
 checklist_nombre:string;checklist_esquema_json:ChecklistSchema;activo:boolean;created_at:string;updated_at:string;
}
export interface Visita {
 id:string;expediente_id:string;nro_visita:number;codigo_informe:string|null;fecha:string;
 estado:'BORRADOR'|'EN_CAMPO'|'EN_REVISION'|'FINALIZADA'|'ARCHIVADA';checklist_nombre:string;
 checklist_esquema_json:ChecklistSchema;checklist_respuestas_json:Record<string,unknown>;checklist_completado:boolean;
 documento_json:Record<string,unknown>;estado_documento:'BORRADOR'|'GENERADO';responsable_obra_nombre:string|null;
 pdf_archivo_id:string|null;responsable_obra_colegiatura:string|null;created_at:string;updated_at:string;
}
export type WorkspaceEntity='expediente'|'visita';
export interface WorkspacePending {id:string;entity:WorkspaceEntity;record:Expediente|Visita;created_at:string;answer_patch?:Record<string,string|number|null>;preserve_answers?:boolean}
export interface WorkspaceState {expedientes:Expediente[];visitas:Visita[];plantillas:ChecklistTemplate[];pending:WorkspacePending[];last_sync:string|null}
export function assertChecklist(schema:ChecklistSchema){
 if(schema.version!==1||!schema.sections.length)throw new Error('El checklist necesita al menos una sección.');
 const ids=new Set<string>();
 for(const section of schema.sections){
  if(!section.title.trim())throw new Error('Cada sección necesita un título.');
  for(const field of section.fields){
   if(!field.label.trim())throw new Error('Cada campo necesita una etiqueta.');
   if(ids.has(field.id))throw new Error('Los identificadores del checklist deben ser únicos.');
   ids.add(field.id);
  }
 }
 return schema;
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
 |{id:string;type:'capture-group';groupId:string;photoIds:string[];comment:string}
 |{id:string;type:'text';content:string}
 |{id:string;type:'conclusions';content:string}
 |{id:string;type:'signatures';locked:true};

export interface ReportDocumentV1 {
 schemaVersion:1;revision:number;blocks:ReportBlock[];
 /** Revisión con la que se generó el PDF vigente (ausente = nunca generado). */
 generatedRevision?:number;
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
   blocks.push({id:String((block as {id?:unknown}).id??uid()),type:'capture-group',groupId:block.groupId,photoIds:block.photoIds.filter((p):p is string=>typeof p==='string'),comment:typeof block.comment==='string'?block.comment:''});
  }else if(block.type==='text'||block.type==='conclusions'){
   blocks.push({id:String((block as {id?:unknown}).id ?? uid()),type:block.type,content:typeof block.content==='string'?block.content:''});
  }else return null;
 }
 if(!blocks.some(b=>b.type==='header')||!blocks.some(b=>b.type==='checklist')||!blocks.some(b=>b.type==='signatures'))return null;
 return {schemaVersion:1,revision:doc.revision,generatedRevision:typeof doc.generatedRevision==='number'?doc.generatedRevision:undefined,blocks};
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
 const blocks=doc.blocks.map(b=>b.type==='capture-group'&&b.id===id?{...b,comment}:b);
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
