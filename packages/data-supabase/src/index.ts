import { createClient,type SupabaseClient } from '@supabase/supabase-js';
import { ConflictError,type Profile,type Pending,type WorkspacePending,type Expediente,type Visita,type ChecklistTemplate,type RemoteArchivo,type RemoteFoto,type RemoteGrupo } from '@archforms/domain';
import type { RemoteRepository,WorkspaceRemoteRepository,CaptureRemoteReader,RemoteCaptureState } from '@archforms/application';
import type {Database} from '@archforms/contracts';
export {createClient};
export class SupabaseProfileRepository implements RemoteRepository {
 constructor(private client:SupabaseClient<Database>){}
 async fetch():Promise<Profile>{
  const {data,error}=await this.client.from('profesional').select('id,email,nombre_completo,cargo,nro_colegiatura,updated_at').single();
  if(error)throw new Error(error.message);return data as Profile;
 }
 async push(op:Pending):Promise<Profile>{
  const {data,error}=await this.client.rpc('sync_profesional',{base_updated_at:op.base,nombre:op.edit.nombre_completo,cargo_nuevo:op.edit.cargo??'',colegiatura:op.edit.nro_colegiatura??''});
  if(error?.code==='40001')throw new ConflictError();
  if(error)throw new Error(error.message);return data as Profile;
 }
}
export class SupabaseWorkspaceRepository implements WorkspaceRemoteRepository{
 constructor(private client:SupabaseClient<Database>){}
 async fetchAll(){
  const [cases,visits,templates]=await Promise.all([this.client.from('expediente').select('*').order('updated_at',{ascending:false}),this.client.from('visita').select('*').order('fecha',{ascending:false}),this.client.from('plantilla_checklist').select('*').eq('activa',true).order('nombre')]);
  const error=cases.error??visits.error??templates.error;if(error)throw new Error(error.message);
  return {expedientes:cases.data as unknown as Expediente[],visitas:visits.data as unknown as Visita[],plantillas:(templates.data??[]).map(row=>({id:row.id,codigo:row.codigo,nombre:row.nombre,version:row.version,esquema:row.esquema_json,profesional_id:row.profesional_id})) as unknown as ChecklistTemplate[]};
 }
 async push(operation:WorkspacePending){const {error}=await this.client.from(operation.entity).upsert(operation.record as never);if(error)throw new Error(error.message)}
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
