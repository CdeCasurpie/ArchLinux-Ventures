import { type Profile,type ProfileEdit,type LocalState,type Pending,validateProfile,type WorkspaceState,type WorkspacePending,type Expediente,type Visita,assertChecklist } from '@archforms/domain';
export interface LocalRepository {
 read(owner:string):Promise<LocalState>;
 // Record and outbox are written together in one durable transaction.
 enqueue(owner:string,edit:ProfileEdit,id:string):Promise<void>;
 acknowledge(owner:string,operation:Pending,profile:Profile):Promise<void>;
 acceptRemote(owner:string,profile:Profile):Promise<void>;
}
export interface RemoteRepository {fetch():Promise<Profile>;push(operation:Pending):Promise<Profile>;}
export async function saveProfile(local:LocalRepository,owner:string,edit:ProfileEdit,id:string){
 await local.enqueue(owner,validateProfile(edit),id);
}
export class SyncEngine {
 private running:Promise<void>|null=null;
 constructor(private local:LocalRepository,private remote:RemoteRepository,private owner:string){}
 run():Promise<void>{
  if(this.running)return this.running;
  this.running=this.perform().finally(()=>{this.running=null});
  return this.running;
 }
 private async perform(){
  // Drain edits added while a network request was running.
  for(let i=0;i<20;i++){
   const state=await this.local.read(this.owner);
   if(!state.pending){await this.local.acceptRemote(this.owner,await this.remote.fetch());return;}
   const remote=await this.remote.push(state.pending);
   await this.local.acknowledge(this.owner,state.pending,remote);
  }
 }
}
export function queuedState(state:LocalState,owner:string,edit:ProfileEdit,id:string):LocalState {
 if(!state.profile || state.profile.id!==owner)throw new Error('Primero carga tu perfil con conexión.');
 return {profile:{...state.profile,...edit},pending:{id,owner,base:state.pending?.base??state.profile.updated_at,edit}};
}
export function acknowledgedState(state:LocalState,operation:Pending,profile:Profile):LocalState {
 if(state.pending?.id===operation.id)return {profile,pending:null};
 // Keep a newer local edit, rebasing it onto the acknowledged server timestamp.
 if(state.pending)return {profile:{...profile,...state.pending.edit},pending:{...state.pending,base:profile.updated_at}};
 return {profile,pending:null};
}

export interface WorkspaceLocalRepository {
 read(owner:string):Promise<WorkspaceState>;
 save(owner:string,operation:WorkspacePending):Promise<void>;
 acknowledge(owner:string,operationId:string):Promise<void>;
 mergeRemote(owner:string,remote:Pick<WorkspaceState,'expedientes'|'visitas'|'plantillas'>):Promise<void>;
}
export interface WorkspaceRemoteRepository {fetchAll():Promise<Pick<WorkspaceState,'expedientes'|'visitas'|'plantillas'>>;push(operation:WorkspacePending):Promise<void>}
export class WorkspaceSyncEngine {
 private running:Promise<void>|null=null;
 constructor(private local:WorkspaceLocalRepository,private remote:WorkspaceRemoteRepository,private owner:string){}
 run(){if(this.running)return this.running;this.running=this.perform().finally(()=>{this.running=null});return this.running}
 private async perform(){
  for(let i=0;i<100;i++){
   const next=(await this.local.read(this.owner)).pending[0];
   if(!next){await this.local.mergeRemote(this.owner,await this.remote.fetchAll());return}
   await this.remote.push(next);await this.local.acknowledge(this.owner,next.id);
  }
  throw new Error('Hay demasiados cambios pendientes para una sola sincronización.');
 }
}
const now=()=>new Date().toISOString();
const nullable=(value:FormDataEntryValue|null)=>{const text=String(value??'').trim();return text||null};
export function buildExpediente(owner:string,data:FormData,schema:Expediente['checklist_esquema_json'],existing?:Expediente):Expediente{
 assertChecklist(schema);const nro=String(data.get('nro_expediente')??'').trim(),ubicacion=String(data.get('ubicacion')??'').trim();
 if(!nro)throw new Error('Ingresa el número de expediente.');if(!ubicacion)throw new Error('Ingresa la ubicación de la obra.');
 const stamp=now();
 return {id:existing?.id??crypto.randomUUID(),profesional_id:owner,nro_expediente:nro,nro_licencia:nullable(data.get('nro_licencia')),modalidad:nullable(data.get('modalidad')),entidad_destinataria:nullable(data.get('entidad_destinataria')),fecha_emision_licencia:nullable(data.get('fecha_emision_licencia')),vigencia_desde:nullable(data.get('vigencia_desde')),vigencia_hasta:nullable(data.get('vigencia_hasta')),propietario:nullable(data.get('propietario')),ubicacion,distrito:nullable(data.get('distrito')),provincia:nullable(data.get('provincia')),departamento:nullable(data.get('departamento')),tipo_obra:nullable(data.get('tipo_obra')),uso_predio:nullable(data.get('uso_predio')),detalle_obra:nullable(data.get('detalle_obra')),valor_obra:data.get('valor_obra')?Number(data.get('valor_obra')):null,total_visitas_programadas:data.get('total_visitas_programadas')?Number(data.get('total_visitas_programadas')):null,responsable_obra_nombre:nullable(data.get('responsable_obra_nombre')),responsable_obra_colegiatura:nullable(data.get('responsable_obra_colegiatura')),poliza_car_json:{compania:nullable(data.get('poliza_compania')),desde:nullable(data.get('poliza_desde')),hasta:nullable(data.get('poliza_hasta'))},datos_cabecera_extra:null,checklist_nombre:String(data.get('checklist_nombre')??'Checklist').trim(),checklist_esquema_json:schema,activo:existing?.activo??true,created_at:existing?.created_at??stamp,updated_at:stamp};
}
export function buildVisita(expediente:Expediente,number:number,date:string):Visita{
 const stamp=now();return {id:crypto.randomUUID(),expediente_id:expediente.id,nro_visita:number,codigo_informe:null,fecha:date,estado:'BORRADOR',checklist_nombre:expediente.checklist_nombre,checklist_esquema_json:structuredClone(expediente.checklist_esquema_json),checklist_respuestas_json:{},checklist_completado:false,documento_json:{version:1,blocks:[]},estado_documento:'BORRADOR',responsable_obra_nombre:expediente.responsable_obra_nombre,responsable_obra_colegiatura:expediente.responsable_obra_colegiatura,created_at:stamp,updated_at:stamp};
}
export function workspaceOperation(entity:WorkspacePending['entity'],record:Expediente|Visita):WorkspacePending{return {id:crypto.randomUUID(),entity,record,created_at:now()}}
