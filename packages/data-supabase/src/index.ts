import { createClient,type SupabaseClient } from '@supabase/supabase-js';
import { type Profile,type Pending,type WorkspacePending,type Expediente,type Visita,type ChecklistTemplate } from '@archforms/domain';
import type { RemoteRepository,WorkspaceRemoteRepository } from '@archforms/application';
import type {Database} from '@archforms/contracts';
import { SupabaseAnswerSyncRemote } from './answer-sync';
import { readPages } from './read-pages';
export {createClient};
export { SupabaseAnswerSyncRemote } from './answer-sync';
export { SupabaseCaptureReader } from './capture-reader';
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
  async fetchReplica(cursor?:number){
   const partial=cursor!==undefined;
   let revision=cursor;
   if(revision===undefined){const {data,error}=await this.client.rpc('sync_replica_head_v1');if(error)throw error;revision=data}
   if(!Number.isSafeInteger(revision)||revision!<0)throw new Error('Invalid replica cursor');
   const initial=partial?{expedientes:[],visitas:[],plantillas:await readPages((after,size)=>{
    let q=this.client.from('plantilla_checklist').select('*').eq('activa',true).order('id').limit(size);if(after)q=q.gt('id',after);return q;
   }).then(rows=>rows.map(row=>({id:row.id,codigo:row.codigo,nombre:row.nombre,version:row.version,esquema:row.esquema_json,profesional_id:row.profesional_id})) as unknown as ChecklistTemplate[])}:await this.fetchAll();
   const cases=new Map<string,Expediente>(initial.expedientes.map(row=>[row.id,row]));
   const visits=new Map<string,Visita>(initial.visitas.map(row=>[row.id,row]));
   const removed=new Map<string,{entity:'expediente'|'visita';id:string}>();
   for(let page=0;page<100;page++){
    const {data,error}=await this.client.rpc('sync_replica_pull_v1',{after_revision:revision!,page_size:200});
    if(error)throw error;if(!Array.isArray(data))throw new Error('Invalid replica page');
    for(const raw of data){
     if(!raw||typeof raw!=='object'||Array.isArray(raw)||!Number.isSafeInteger(raw.revision)||(raw.revision as number)<=revision!||!['expediente','visita'].includes(String(raw.entity))||typeof raw.entity_id!=='string'||typeof raw.deleted!=='boolean'||!raw.record||typeof raw.record!=='object'||Array.isArray(raw.record)||raw.record.id!==raw.entity_id)throw new Error('Invalid replica event');
     revision=raw.revision as number;
     const key=`${raw.entity}:${raw.entity_id}`;
     if(raw.deleted){
      removed.set(key,{entity:raw.entity as 'expediente'|'visita',id:raw.entity_id});
      if(raw.entity==='expediente'){cases.delete(raw.entity_id);for(const [id,row] of visits)if(row.expediente_id===raw.entity_id)visits.delete(id)}else visits.delete(raw.entity_id);
     }else{
      removed.delete(key);
      if(raw.entity==='expediente')cases.set(raw.entity_id,raw.record as unknown as Expediente);else visits.set(raw.entity_id,raw.record as unknown as Visita);
     }
    }
    if(data.length<200)break;
   }
   return {expedientes:[...cases.values()],visitas:[...visits.values()],plantillas:initial.plantillas,replica:{cursor:revision!,partial,deleted:[...removed.values()]}};
  }
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
   const {error}=await this.client.rpc('sync_legacy_workspace_v1',{
    operation_id:operation.id,entity:operation.entity,entity_id:operation.record.id,
    record:operation.record as unknown as import('@archforms/contracts').Json,
    preserve_answers:operation.preserve_answers??false,
   });
   if(error)throw error;
 }
}
