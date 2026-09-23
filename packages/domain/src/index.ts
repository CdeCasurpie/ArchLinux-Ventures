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
 responsable_obra_colegiatura:string|null;created_at:string;updated_at:string;
}
export type WorkspaceEntity='expediente'|'visita';
export interface WorkspacePending {id:string;entity:WorkspaceEntity;record:Expediente|Visita;created_at:string}
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

