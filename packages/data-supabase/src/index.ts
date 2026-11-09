import { createClient,type SupabaseClient } from '@supabase/supabase-js';
import { type Profile,type Pending,type WorkspacePending,type Expediente,type Visita,type ChecklistTemplate,type RemoteArchivo,type RemoteFoto,type RemoteGrupo } from '@archforms/domain';
import type { RemoteRepository,WorkspaceRemoteRepository,CaptureRemoteReader,RemoteCaptureState } from '@archforms/application';
import type {Database} from '@archforms/contracts';
import { SupabaseAnswerSyncRemote } from './answer-sync';
import { readPages } from './read-pages';
export {createClient};
export { SupabaseAnswerSyncRemote } from './answer-sync';
export class SupabaseProfileRepository implements RemoteRepository {
 constructor(private client:SupabaseClient<Database>){}
 async fetch():Promise<Profile>{
  const {data,error}=await this.client.from('profesional').select('id,email,nombre_completo,cargo,nro_colegiatura,updated_at').single();
  if(error)throw new Error(error.message);return data as Profile;
 }
 async push(op:Pending):Promise<Profile>{
   const {data,error}=await this.client.rpc('sync_profile_v1',{operation_id:op.id,nombre:op.edit.nombre_completo,cargo:op.edit.cargo,colegiatura:op.edit.nro_colegiatura});
   if(error)throw error;
   if(!data||typeof data!=='object'||Array.isArray(data)||typeof data.id!=='string'||typeof data.updated_at!=='string'||typeof data.nombre_completo!=='string')throw new Error('Invalid profile response');
   return data as unknown as Profile;
 }
}
export class SupabaseWorkspaceRepository implements WorkspaceRemoteRepository{
 constructor(private client:SupabaseClient<Database>){}
 async fetchAll(){
   const [cases,visits,templates]=await Promise.all([
    readPages((after,size)=>{let q=this.client.from('expediente').select('*').order('id').limit(size);if(after)q=q.gt('id',after);return q}),
    readPages((after,size)=>{let q=this.client.from('visita').select('*').order('id').limit(size);if(after)q=q.gt('id',after);return q}),
    readPages((after,size)=>{let q=this.client.from('plantilla_checklist').select('*').eq('activa',true).order('id').limit(size);if(after)q=q.gt('id',after);return q}),
   ]);
   return {expedientes:cases.sort((a,b)=>b.updated_at.localeCompare(a.updated_at)) as unknown as Expediente[],visitas:visits.sort((a,b)=>b.fecha.localeCompare(a.fecha)) as unknown as Visita[],plantillas:templates.sort((a,b)=>a.nombre.localeCompare(b.nombre)).map(row=>({id:row.id,codigo:row.codigo,nombre:row.nombre,version:row.version,esquema:row.esquema_json,profesional_id:row.profesional_id})) as unknown as ChecklistTemplate[]};
 }
  async push(operation:WorkspacePending){
   if(operation.answer_patch){
    await new SupabaseAnswerSyncRemote(this.client).push({operationId:operation.id,visitaId:operation.record.id,patch:operation.answer_patch});
    return;
   }
   if(operation.workspace_mutation){
    const {error}=await this.client.rpc('sync_workspace_v1',{
     operation_id:operation.id,entity:operation.entity,entity_id:operation.record.id,
     mutation:operation.workspace_mutation.type,payload:operation.workspace_mutation.payload as import('@archforms/contracts').Json,
    });
    if(error)throw error;
    return;
   }
   if(operation.entity==='visita'&&operation.preserve_answers){
    // Creation can carry initial answers; subsequent document/status writes cannot.
    const {error:insertError}=await this.client.from('visita').upsert(operation.record as never,{onConflict:'id',ignoreDuplicates:true});
    if(insertError)throw insertError;
    const {checklist_respuestas_json:_answers,checklist_completado:_complete,...fields}=operation.record as Visita;
    const {error}=await this.client.from('visita').update(fields as never).eq('id',operation.record.id);
    if(error)throw error;
    return;
   }
   const {error}=await this.client.from(operation.entity).upsert(operation.record as never);
   if(error)throw error;
  }
}

export class SupabaseCaptureReader implements CaptureRemoteReader{
 constructor(private client:SupabaseClient<Database>){}
 async fetchCapture(visitaIds:string[]):Promise<RemoteCaptureState>{
  if(!visitaIds.length)return {grupos:[],fotos:[],archivos:[]};
  const [grupos,fotos]=await Promise.all([
   this.client.from('grupo_captura').select('id,visita_id,orden,audio_archivo_id,transcripcion_original,audio_duracion_ms,iniciado_at,confirmado_at').in('visita_id',visitaIds).order('orden'),
   this.client.from('foto').select('id,visita_id,grupo_captura_id,archivo_id,orden_en_grupo,capturada_at').in('visita_id',visitaIds).order('orden_captura'),
  ]);
  const err=grupos.error??fotos.error;if(err)throw new Error(err.message);
  const archivoIds:string[]=[];
  for(const f of fotos.data??[])archivoIds.push(f.archivo_id);
  for(const g of grupos.data??[])if(g.audio_archivo_id)archivoIds.push(g.audio_archivo_id);
  const uniqueIds=[...new Set(archivoIds)];
  const archivos=uniqueIds.length
   ? await this.client.from('archivo').select('id,tipo,storage_key,mime_type,tamanio_bytes,checksum_sha256').in('id',uniqueIds)
   : {data:[],error:null};
  if(archivos.error)throw new Error(archivos.error.message);
  return {
   grupos:(grupos.data??[]) as unknown as RemoteGrupo[],
   fotos:(fotos.data??[]) as unknown as RemoteFoto[],
   archivos:(archivos.data??[]) as unknown as RemoteArchivo[],
  };
 }
 async downloadBytes(storageKey:string):Promise<Uint8Array>{
  const {data,error}=await this.client.storage.from('visita-media').download(storageKey);
  if(error||!data)throw new Error(error?.message??' Descarga vacía.');
  return new Uint8Array(await data.arrayBuffer());
 }
}
