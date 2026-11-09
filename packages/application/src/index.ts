import { type Profile,type ProfileEdit,type LocalState,type Pending,validateProfile,type WorkspaceState,type WorkspacePending,type Expediente,type Visita,assertChecklist,type MediaOutboxItem,type EntityOutboxItem,type GrupoCapturaPayload,type MediaSyncStatus,type EntitySyncStatus,type RemoteArchivo,type RemoteFoto,type RemoteGrupo } from '@archforms/domain';
export * from './answer-sync';
export * from './sync-coordinator';
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
  saveAnswers(owner:string,visitaId:string,patch:Record<string,string|number|null>):Promise<void>;
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
    // Only a successful server acknowledgement can remove a local operation.
    // Uniqueness violations are not proof that this operation was applied.
    await this.remote.push(next);
   await this.local.acknowledge(this.owner,next.id);
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
 const stamp=now();return {id:crypto.randomUUID(),expediente_id:expediente.id,nro_visita:number,codigo_informe:null,fecha:date,estado:'BORRADOR',checklist_nombre:expediente.checklist_nombre,checklist_esquema_json:structuredClone(expediente.checklist_esquema_json),checklist_respuestas_json:{},checklist_completado:false,documento_json:{version:1,blocks:[]},estado_documento:'BORRADOR',pdf_archivo_id:null,responsable_obra_nombre:expediente.responsable_obra_nombre,responsable_obra_colegiatura:expediente.responsable_obra_colegiatura,created_at:stamp,updated_at:stamp};
}
export function workspaceOperation(entity:WorkspacePending['entity'],record:Expediente|Visita):WorkspacePending{return {id:crypto.randomUUID(),entity,record,created_at:now(),preserve_answers:entity==='visita'}}

// ── Media Sync (Iteración 4) ──────────────────────────────────────────────────

/** Exponential backoff with jitter. Returns milliseconds to wait before retry. */
export function exponentialBackoff(attempt:number):number{
 const BASE=2_000,CAP=5*60_000,JITTER=1_000;
 return Math.min(CAP,BASE*Math.pow(2,attempt))+Math.random()*JITTER;
}

export interface MediaOutboxRepository {
 pendingMedia(now:string):Promise<MediaOutboxItem[]>;
 markMediaUploading(id:string):Promise<void>;
 markMediaSynced(id:string,bucketPath:string):Promise<void>;
 markMediaError(id:string,error:string,nextRetry:string):Promise<void>;
 pendingEntities(now:string):Promise<EntityOutboxItem[]>;
 markEntitySyncing(id:string):Promise<void>;
 markEntitySynced(id:string):Promise<void>;
 markEntityError(id:string,error:string,nextRetry:string):Promise<void>;
 mediaStatus(id:string):Promise<MediaOutboxItem|null>;
 entityStatus(id:string):Promise<EntityOutboxItem|null>;
 /** Manual retry: requeues the given media/entity rows skipping backoff. */
 forceRetry(ids:string[]):Promise<void>;
 enqueueMedia(item:Omit<MediaOutboxItem,'attempts'|'last_error'|'next_retry'|'status'>):Promise<void>;
 enqueueEntity(item:Omit<EntityOutboxItem,'attempts'|'last_error'|'next_retry'|'status'>):Promise<void>;
 collectGarbage(now:string):Promise<string[]>;
 /** Resets items stuck in transient states (uploading/syncing) after an abrupt close. */
 resetStuck():Promise<void>;
}

export interface MediaRemoteRepository {
 /** Returns existing bucket path if same checksum already uploaded, null otherwise. */
 checkExists(visitaId:string,mediaId:string,checksum:string):Promise<string|null>;
 /** Uploads raw bytes (must be < 10 MB) and returns bucket path. */
 upload(visitaId:string,mediaId:string,data:Uint8Array,mimeType:string):Promise<string>;
 /** Upserts grupo_captura + fotos + audio_nota in Postgres. */
 pushGrupo(payload:GrupoCapturaPayload):Promise<void>;
}

export class MediaSyncEngine {
 private running:Promise<void>|null=null;
 private readonly MAX_ITER=200;
 private readonly MEDIA_BATCH=5;

 constructor(
  private outbox:MediaOutboxRepository,
  private remote:MediaRemoteRepository,
  private readFile:(path:string)=>Promise<Uint8Array>,
  private listener?:MediaSyncListener,
  /**
   * Builds the entity payload from CURRENT local state at push time.
   * When present it replaces the frozen JSON stored at enqueue time, so late
   * arrivals (e.g. a transcription finishing after the group was queued) are
   * included. Must be deterministic across retries (stable row ids).
   */
  private resolvePayload?:(entityId:string)=>Promise<GrupoCapturaPayload|null>,
 ){}

 run():Promise<void>{
  if(this.running)return this.running;
  this.running=this.perform().finally(()=>{this.running=null});
  return this.running;
 }

 /** True while a sync pass is in flight (used by the debug panel). */
 active():boolean{return this.running!==null}

 private async perform():Promise<void>{
  for(let i=0;i<this.MAX_ITER;i++){
   const ts=new Date().toISOString();
   const media=await this.outbox.pendingMedia(ts);
   const entities=await this.outbox.pendingEntities(ts);
   if(!media.length&&!entities.length)return;
   // Phase 1: upload binaries in parallel batches
   if(media.length){
    await Promise.all(media.slice(0,this.MEDIA_BATCH).map(item=>this.uploadOne(item)));
    continue; // re-check queue after batch
   }
   // Phase 2: push entity records whose media are all synced
   for(const entity of entities){
    await this.pushOne(entity);
   }
  }
 }

 private async uploadOne(item:MediaOutboxItem):Promise<void>{
  await this.outbox.markMediaUploading(item.id);
  this.listener?.onMedia?.(item,'uploading');
  try{
   // Idempotency: skip if same file already in bucket
   const existing=await this.remote.checkExists(item.visita_id,item.id,item.checksum);
   if(existing){await this.outbox.markMediaSynced(item.id,existing);this.listener?.onMedia?.(item,'synced');return;}
   if(item.size_bytes>10_000_000){
    throw new Error(`Archivo demasiado grande (${item.size_bytes} bytes). Máx 10 MB.`);
   }
   const data=await this.readFile(item.local_path);
   const path=await this.remote.upload(item.visita_id,item.id,data,item.mime_type);
   await this.outbox.markMediaSynced(item.id,path);
   this.listener?.onMedia?.(item,'synced');
  }catch(err){
   const attempts=item.attempts+1;
   const wait=exponentialBackoff(attempts);
   const next=new Date(Date.now()+wait).toISOString();
   await this.outbox.markMediaError(item.id,err instanceof Error?err.message:String(err),next);
   this.listener?.onMedia?.(item,'error');
  }
 }

 private async pushOne(item:EntityOutboxItem):Promise<void>{
  await this.outbox.markEntitySyncing(item.id);
  this.listener?.onEntity?.(item.id,'syncing');
  try{
   const raw=this.resolvePayload
    ? await this.resolvePayload(item.id)
    : JSON.parse(item.payload) as GrupoCapturaPayload;
   if(!raw)throw new Error(`Grupo ${item.id} ya no existe localmente.`);
   // Resolve remote paths from synced media rows (fotos point at archivo ids)
   for(const foto of raw.fotos){
    const m=await this.outbox.mediaStatus(foto.archivo_id);
    foto.remote_path=m?.bucket_path??null;
   }
   const audioMedia=await this.outbox.mediaStatus(raw.audio.id);
   raw.audio.remote_path=audioMedia?.bucket_path??null;
   await this.remote.pushGrupo(raw);
   await this.outbox.markEntitySynced(item.id);
   this.listener?.onEntity?.(item.id,'synced');
  }catch(err){
   const attempts=item.attempts+1;
   const wait=exponentialBackoff(attempts);
   const next=new Date(Date.now()+wait).toISOString();
   await this.outbox.markEntityError(item.id,err instanceof Error?err.message:String(err),next);
   this.listener?.onEntity?.(item.id,'error');
  }
 }
}

/** Domain events emitted by MediaSyncEngine. The client adapts them to its UI store. */
export interface MediaSyncListener {
 onMedia?(item:MediaOutboxItem,status:MediaSyncStatus):void;
 onEntity?(entityId:string,status:EntitySyncStatus|'synced'):void;
}

// ── Capture pull planner (pure, tested) ───────────────────────────────────────
// Decides what to mirror from the cloud. Rules:
// - Remote groups unknown locally → upsert + download their binaries.
// - Known groups with local pending rows → SKIP (local wins while dirty).
// - Known clean groups → refresh metadata/transcription, download missing binaries.
// - Binaries already present locally are never re-downloaded.
export interface LocalCaptureSnapshot {
 groupId:string;mediaIds:string[];hasPending:boolean;
}
export interface RemoteCaptureState {
 grupos:RemoteGrupo[];fotos:RemoteFoto[];archivos:RemoteArchivo[];
}
export interface PullGroupPlan {
 grupo:RemoteGrupo;
 fotos:RemoteFoto[];
 archivos:RemoteArchivo[];
}
export interface CapturePullPlan {
 upserts:PullGroupPlan[];
 skippedDirty:string[];
}

export function planCapturePull(
 local:LocalCaptureSnapshot[],
 remote:RemoteCaptureState,
):CapturePullPlan{
 const byId=new Map(local.map(l=>[l.groupId,l]));
 const archivosById=new Map(remote.archivos.map(a=>[a.id,a]));
 const fotosByGrupo=new Map<string,RemoteFoto[]>();
 for(const f of remote.fotos){
  if(!f.grupo_captura_id)continue;
  const list=fotosByGrupo.get(f.grupo_captura_id)??[];
  list.push(f);fotosByGrupo.set(f.grupo_captura_id,list);
 }
 const upserts:PullGroupPlan[]=[];
 const skippedDirty:string[]=[];
 for(const grupo of remote.grupos){
  const known=byId.get(grupo.id);
  if(known?.hasPending){skippedDirty.push(grupo.id);continue}
  const fotos=fotosByGrupo.get(grupo.id)??[];
  const localMedia=new Set(known?.mediaIds??[]);
  const audio=grupo.audio_archivo_id?archivosById.get(grupo.audio_archivo_id):undefined;
  const wanted=[...fotos.map(f=>archivosById.get(f.archivo_id)),audio]
   .filter((a):a is RemoteArchivo=>!!a&&!!a.storage_key&&!localMedia.has(a.id));
  upserts.push({grupo,fotos,archivos:wanted});
 }
 return {upserts,skippedDirty};
}

export interface CaptureRemoteReader {
 /** Reads capture rows for the given visitas (RLS limits to the owner's). */
 fetchCapture(visitaIds:string[]):Promise<RemoteCaptureState>;
 /** Downloads raw bytes for a storage_key in `visita-media`. */
 downloadBytes(storageKey:string):Promise<Uint8Array>;
}
