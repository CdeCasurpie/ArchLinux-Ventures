import { openDB, type IDBPDatabase } from 'idb';
import { answerOperation, prepareMutation } from './workspace-mutations';
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';
import { type LocalRepository,type WorkspaceLocalRepository,queuedState,acknowledgedState,type MediaOutboxRepository } from '@archforms/application';
import { checklistCompleted, type LocalState,Profile,ProfileEdit,Pending,WorkspaceState,WorkspacePending,MediaOutboxItem,EntityOutboxItem,Visita } from '@archforms/domain';
const empty=():LocalState=>({profile:null,pending:null});
const sqliteManager=new SQLiteConnection(CapacitorSQLite);
// One creation promise per database name: SQLiteRepository and
// SQLiteMediaOutboxRepository both open 'archforms' at startup. Without this,
// both check isConnection before either creates, one loses the race, and its
// 'already exists' fallback closes the other's live connection
// ("CloseConnection: No available connection for database archforms").
const connectionPromises=new Map<string,Promise<SQLiteDBConnection>>();
async function openNativeDatabase(name:string){
 const cached=connectionPromises.get(name);
 if(cached)return cached;
 const created=(async()=>{
  const known=await sqliteManager.isConnection(name,false);
  if(known.result)return sqliteManager.retrieveConnection(name,false);
  let db:SQLiteDBConnection;
  try{db=await sqliteManager.createConnection(name,false,'no-encryption',1,false)}
  catch(error){
   if(!String(error).includes('already exists'))throw error;
   await CapacitorSQLite.closeConnection({database:name,readonly:false});
   db=await sqliteManager.createConnection(name,false,'no-encryption',1,false);
  }
  const opened=await db.isDBOpen();if(!opened.result)await db.open();return db;
 })();
 connectionPromises.set(name,created);
 created.catch(()=>{if(connectionPromises.get(name)===created)connectionPromises.delete(name)});
 return created;
}
export class IndexedRepository implements LocalRepository {
 private db:Promise<IDBPDatabase>;
 constructor(name='archforms-v1'){this.db=openDB(name,1,{upgrade(db){db.createObjectStore('profiles')}})}
 async read(owner:string):Promise<LocalState>{return (await (await this.db).get('profiles',owner))??empty();}
 private async change(owner:string,fn:(s:LocalState)=>LocalState){
  const tx=(await this.db).transaction('profiles','readwrite');
  const state=(await tx.store.get(owner))??empty();
  await tx.store.put(fn(state),owner);await tx.done;
 }
 enqueue(owner:string,edit:ProfileEdit,id:string){return this.change(owner,s=>queuedState(s,owner,edit,id))}
 acknowledge(owner:string,op:Pending,profile:Profile){return this.change(owner,s=>acknowledgedState(s,op,profile))}
 acceptRemote(owner:string,profile:Profile){return this.change(owner,s=>s.pending?s:{profile,pending:null})}
}
export class SQLiteRepository implements LocalRepository {
 private db:Promise<SQLiteDBConnection>;
 private tail:Promise<unknown>=Promise.resolve();
 constructor(){
  this.db=(async()=>{
   const db=await openNativeDatabase('archforms');
   await db.execute('CREATE TABLE IF NOT EXISTS profile_state (owner TEXT PRIMARY KEY, payload TEXT NOT NULL);');
   return db;
  })();
 }
 private serial<T>(fn:()=>Promise<T>):Promise<T>{
  const next=this.tail.then(fn);this.tail=next.catch(()=>undefined);return next;
 }
 private async readRaw(owner:string):Promise<LocalState>{
  const rows=await (await this.db).query('SELECT payload FROM profile_state WHERE owner = ?',[owner]);
  return rows.values?.[0]?JSON.parse(rows.values[0].payload) as LocalState:empty();
 }
 read(owner:string){return this.serial(()=>this.readRaw(owner))}
 private change(owner:string,fn:(s:LocalState)=>LocalState){
  return this.serial(async()=>{
   const db=await this.db;
   const next=fn(await this.readRaw(owner));
   // One SQLite transaction commits both profile and pending operation in the payload.
   await db.run('INSERT INTO profile_state(owner,payload) VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET payload=excluded.payload',[owner,JSON.stringify(next)]);
  });
 }
 enqueue(owner:string,edit:ProfileEdit,id:string){return this.change(owner,s=>queuedState(s,owner,edit,id))}
 acknowledge(owner:string,op:Pending,profile:Profile){return this.change(owner,s=>acknowledgedState(s,op,profile))}
 acceptRemote(owner:string,profile:Profile){return this.change(owner,s=>s.pending?s:{profile,pending:null})}
}

const emptyWorkspace=():WorkspaceState=>({expedientes:[],visitas:[],plantillas:[],pending:[],last_sync:null});
const kindOf=(entity:WorkspaceState['pending'][number]['entity'])=>entity==='expediente'?'expedientes':entity==='plantilla'?'plantillas':'visitas';
function mergeWorkspace(state:WorkspaceState,remote:Pick<WorkspaceState,'expedientes'|'visitas'|'plantillas'>,replica?:import('@archforms/domain').ReplicaInfo):WorkspaceState{
 const cases=new Map((replica?.partial?state.expedientes:[]).map(row=>[row.id,row]));
 const visits=new Map((replica?.partial?state.visitas:[]).map(row=>[row.id,row]));
 const templates=new Map((replica?.partial?state.plantillas:[]).map(row=>[row.id,row]));
 for(const row of remote.expedientes)cases.set(row.id,row);
 for(const row of remote.visitas)visits.set(row.id,row);
 for(const row of remote.plantillas)templates.set(row.id,row);
 for(const removed of replica?.deleted??[]){
  if(removed.entity==='expediente'){cases.delete(removed.id);for(const [id,row] of visits)if(row.expediente_id===removed.id)visits.delete(id)}
  else if(removed.entity==='plantilla')templates.delete(removed.id);
  else visits.delete(removed.id);
 }
 for(const operation of state.pending){
  const kind=kindOf(operation.entity);
  const records=kind==='expedientes'?cases:kind==='plantillas'?templates:visits;
  const base=records.get(operation.record.id)??operation.record;
  let next=operation.record;
  if(operation.answer_patch){
   const visit=base as Visita,answers={...visit.checklist_respuestas_json,...operation.answer_patch};
   next={...visit,checklist_respuestas_json:answers,checklist_completado:checklistCompleted(visit.checklist_esquema_json,answers),updated_at:(operation.record as Visita).updated_at};
  }
  else if(operation.workspace_mutation?.type==='patch')next={...base,...operation.workspace_mutation.payload} as typeof next;
  (records as Map<string,typeof next>).set(next.id,next);
 }
 return {expedientes:[...cases.values()],visitas:[...visits.values()],plantillas:[...templates.values()],pending:state.pending,last_sync:new Date().toISOString(),...(replica?{sync_cursor:replica.cursor}:state.sync_cursor===undefined?{}:{sync_cursor:state.sync_cursor})};
}
export class IndexedWorkspaceRepository implements WorkspaceLocalRepository{
 private db:Promise<IDBPDatabase>;
  constructor(name='archforms-workspace-v1'){
   this.db=openDB(name,2,{upgrade(db,oldVersion,_version,tx){
    if(oldVersion<1)db.createObjectStore('workspace');
    const records=db.createObjectStore('records');
    const pending=db.createObjectStore('pending');
    const metadata=db.createObjectStore('metadata');
    // Upgrade transaction is atomic; legacy snapshots remain as recovery copies.
    void tx.objectStore('workspace').openCursor().then(async function migrate(cursor):Promise<void>{
     if(!cursor)return;
     const owner=String(cursor.key),state=cursor.value as WorkspaceState;
     for(const kind of ['expedientes','visitas','plantillas'] as const){
      for(const record of state[kind])await records.put(record,[owner,kind,record.id]);
     }
     for(const op of state.pending)await pending.put(op,[owner,op.id]);
     await metadata.put({last_sync:state.last_sync,order:state.pending.map(op=>op.id)},owner);
     await migrate(await cursor.continue());
    }).catch(()=>tx.abort());
   }});
  }
  private async snapshot(tx:ReturnType<IDBPDatabase['transaction']>,owner:string):Promise<WorkspaceState>{
   const state=emptyWorkspace();
   for(const kind of ['expedientes','visitas','plantillas'] as const){
    (state[kind] as unknown[]) .push(...await tx.objectStore('records').getAll(IDBKeyRange.bound([owner,kind,''],[owner,kind,'\uffff'])));
   }
   state.pending=await tx.objectStore('pending').getAll(IDBKeyRange.bound([owner,''],[owner,'\uffff']));
   state.pending.sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
   // Insertion order is stored separately: timestamps may tie within one millisecond.
   const meta=await tx.objectStore('metadata').get(owner);
   if(meta?.order){const rank=new Map<string,number>(meta.order.map((id:string,i:number)=>[id,i]));state.pending.sort((a,b)=>(rank.get(a.id)??0)-(rank.get(b.id)??0))}
   state.last_sync=meta?.last_sync??null;
   if(meta?.sync_cursor!==undefined)state.sync_cursor=meta.sync_cursor;
   return state;
  }
  async read(owner:string):Promise<WorkspaceState>{
   const tx=(await this.db).transaction(['records','pending','metadata']);
   const state=await this.snapshot(tx,owner);await tx.done;return state;
  }
  async save(owner:string,operation:WorkspacePending){
   const tx=(await this.db).transaction(['records','pending','metadata'],'readwrite');
   operation=prepareMutation(operation,await tx.objectStore('records').get([owner,kindOf(operation.entity),operation.record.id]));
   await tx.objectStore('records').put(operation.record,[owner,kindOf(operation.entity),operation.record.id]);
   const meta=await tx.objectStore('metadata').get(owner)??{last_sync:null,order:[]};
   const order:string[]=meta.order??(await this.snapshot(tx,owner)).pending.map(op=>op.id);
   await tx.objectStore('pending').put(operation,[owner,operation.id]);
   await tx.objectStore('metadata').put({...meta,order:[...order.filter(id=>id!==operation.id),operation.id]},owner);
   await tx.done;
  }
  async acknowledge(owner:string,id:string){
   const tx=(await this.db).transaction(['pending','metadata'],'readwrite');
   await tx.objectStore('pending').delete([owner,id]);
   const meta=await tx.objectStore('metadata').get(owner);
   if(meta)await tx.objectStore('metadata').put({...meta,order:meta.order?.filter((item:string)=>item!==id)},owner);
   await tx.done;
  }
  async markBlocked(owner:string,id:string,error:string){const tx=(await this.db).transaction('pending','readwrite');const op=await tx.store.get([owner,id]);if(op)await tx.store.put({...op,blocked_error:error},[owner,id]);await tx.done}
  async retryPending(owner:string){const tx=(await this.db).transaction('pending','readwrite');let cursor=await tx.store.openCursor(IDBKeyRange.bound([owner,''],[owner,'\uffff']));while(cursor){const {blocked_error:_error,...op}=cursor.value;await cursor.update(op);cursor=await cursor.continue()}await tx.done}
  async saveAnswers(owner:string,visitaId:string,patch:Record<string,string|number|null>){
   const tx=(await this.db).transaction(['records','pending','metadata'],'readwrite');
   const record=await tx.objectStore('records').get([owner,'visitas',visitaId]);
   if(!record){await tx.done;throw new Error('Visita no disponible en este dispositivo')}
   const operation=answerOperation(record,patch);
   const state=await this.snapshot(tx,owner);
   await tx.objectStore('records').put(operation.record,[owner,'visitas',visitaId]);
   await tx.objectStore('pending').put(operation,[owner,operation.id]);
   await tx.objectStore('metadata').put({last_sync:state.last_sync,sync_cursor:state.sync_cursor,order:[...state.pending.map(op=>op.id),operation.id]},owner);
   await tx.done;
  }
  async mergeRemote(owner:string,remote:Pick<WorkspaceState,'expedientes'|'visitas'|'plantillas'>,replica?:import('@archforms/domain').ReplicaInfo){
   const tx=(await this.db).transaction(['records','pending','metadata'],'readwrite');
   const state=await this.snapshot(tx,owner),next=mergeWorkspace(state,remote,replica);
   for(const kind of ['expedientes','visitas','plantillas'] as const){
    await tx.objectStore('records').delete(IDBKeyRange.bound([owner,kind,''],[owner,kind,'\uffff']));
    for(const record of next[kind])await tx.objectStore('records').put(record,[owner,kind,record.id]);
   }
   await tx.objectStore('metadata').put({last_sync:next.last_sync,sync_cursor:next.sync_cursor,order:state.pending.map(op=>op.id)},owner);
   await tx.done;
  }
}
export class SQLiteWorkspaceRepository implements WorkspaceLocalRepository{
 private db:Promise<SQLiteDBConnection>;private tail:Promise<unknown>=Promise.resolve();
  constructor(){this.db=(async()=>{
   const db=await openNativeDatabase('archforms_workspace');
   await db.execute(`CREATE TABLE IF NOT EXISTS workspace_state (owner TEXT PRIMARY KEY, payload TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS workspace_records (owner TEXT NOT NULL, kind TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(owner,kind,id));
    CREATE TABLE IF NOT EXISTS workspace_pending (owner TEXT NOT NULL, id TEXT NOT NULL, position INTEGER NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(owner,id));
    CREATE TABLE IF NOT EXISTS workspace_metadata (owner TEXT PRIMARY KEY, last_sync TEXT);
    CREATE TABLE IF NOT EXISTS workspace_cursor(owner TEXT PRIMARY KEY,revision INTEGER NOT NULL);`);
   const legacy=await db.query('SELECT owner,payload FROM workspace_state WHERE owner NOT IN (SELECT owner FROM workspace_metadata)');
   for(const row of legacy.values??[]){
    const state=JSON.parse(row.payload) as WorkspaceState;
    await this.writeSnapshot(db,row.owner,state);
   }
   return db;
  })()}
 private serial<T>(fn:()=>Promise<T>):Promise<T>{const next=this.tail.then(fn);this.tail=next.catch(()=>undefined);return next}
  private async raw(owner:string){
   const db=await this.db,state=emptyWorkspace();
   const records=await db.query('SELECT kind,payload FROM workspace_records WHERE owner = ?',[owner]);
   for(const row of records.values??[]){if(row.kind==='expedientes'||row.kind==='visitas'||row.kind==='plantillas')(state[row.kind as 'visitas'] as unknown[]).push(JSON.parse(row.payload))}
   const pending=await db.query('SELECT payload FROM workspace_pending WHERE owner = ? ORDER BY position',[owner]);
   state.pending=(pending.values??[]).map(row=>JSON.parse(row.payload));
   const meta=await db.query('SELECT last_sync FROM workspace_metadata WHERE owner = ?',[owner]);
   state.last_sync=meta.values?.[0]?.last_sync??null;
   const cursor=await db.query('SELECT revision FROM workspace_cursor WHERE owner=?',[owner]);
   if(cursor.values?.[0])state.sync_cursor=cursor.values[0].revision;
   return state;
  }
  private async writeSnapshot(db:SQLiteDBConnection,owner:string,state:WorkspaceState){
   const statements:{statement:string;values:(string|number|null)[]}[]=[
    {statement:'DELETE FROM workspace_records WHERE owner = ?',values:[owner]},
    {statement:'DELETE FROM workspace_pending WHERE owner = ?',values:[owner]},
   ];
   for(const kind of ['expedientes','visitas','plantillas'] as const)for(const record of state[kind])statements.push({statement:'INSERT INTO workspace_records(owner,kind,id,payload) VALUES(?,?,?,?)',values:[owner,kind,record.id,JSON.stringify(record)]});
   state.pending.forEach((op,position)=>statements.push({statement:'INSERT INTO workspace_pending(owner,id,position,payload) VALUES(?,?,?,?)',values:[owner,op.id,position,JSON.stringify(op)]}));
   statements.push({statement:'INSERT INTO workspace_metadata(owner,last_sync) VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET last_sync=excluded.last_sync',values:[owner,state.last_sync]});
   if(state.sync_cursor!==undefined)statements.push({statement:'INSERT INTO workspace_cursor(owner,revision) VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET revision=excluded.revision',values:[owner,state.sync_cursor]});
   await db.executeSet(statements,true);
  }
 read(owner:string){return this.serial(()=>this.raw(owner))}
  private change(owner:string,fn:(state:WorkspaceState)=>WorkspaceState){return this.serial(async()=>{const db=await this.db;await this.writeSnapshot(db,owner,fn(await this.raw(owner)))})}
  save(owner:string,operation:WorkspacePending){return this.serial(async()=>{
   const db=await this.db;
   const previous=await db.query('SELECT payload FROM workspace_records WHERE owner=? AND kind=? AND id=?',[owner,kindOf(operation.entity),operation.record.id]);
   operation=prepareMutation(operation,previous.values?.[0]?JSON.parse(previous.values[0].payload):undefined);
   await db.executeSet([
    {statement:'INSERT INTO workspace_records(owner,kind,id,payload) VALUES(?,?,?,?) ON CONFLICT(owner,kind,id) DO UPDATE SET payload=excluded.payload',values:[owner,kindOf(operation.entity),operation.record.id,JSON.stringify(operation.record)]},
    {statement:'INSERT INTO workspace_pending(owner,id,position,payload) VALUES(?,?,(SELECT COALESCE(MAX(position),-1)+1 FROM workspace_pending WHERE owner=?),?) ON CONFLICT(owner,id) DO UPDATE SET payload=excluded.payload',values:[owner,operation.id,owner,JSON.stringify(operation)]},
    {statement:'INSERT OR IGNORE INTO workspace_metadata(owner,last_sync) VALUES(?,NULL)',values:[owner]},
   ],true);
  })}
  acknowledge(owner:string,id:string){return this.serial(async()=>{await (await this.db).run('DELETE FROM workspace_pending WHERE owner=? AND id=?',[owner,id])})}
  markBlocked(owner:string,id:string,error:string){return this.serial(async()=>{const db=await this.db,rows=await db.query('SELECT payload FROM workspace_pending WHERE owner=? AND id=?',[owner,id]);if(rows.values?.[0])await db.run('UPDATE workspace_pending SET payload=? WHERE owner=? AND id=?',[JSON.stringify({...JSON.parse(rows.values[0].payload),blocked_error:error}),owner,id])})}
  retryPending(owner:string){return this.serial(async()=>{const db=await this.db;const rows=await db.query('SELECT id,payload FROM workspace_pending WHERE owner=?',[owner]);for(const row of rows.values??[]){const {blocked_error:_error,...op}=JSON.parse(row.payload);await db.run('UPDATE workspace_pending SET payload=? WHERE owner=? AND id=?',[JSON.stringify(op),owner,row.id])}})}
  saveAnswers(owner:string,visitaId:string,patch:Record<string,string|number|null>){return this.serial(async()=>{
   const state=await this.raw(owner),record=state.visitas.find(item=>item.id===visitaId);
   if(!record)throw new Error('Visita no disponible en este dispositivo');
   const operation=answerOperation(record,patch);
   await this.writeSnapshot(await this.db,owner,{...state,visitas:state.visitas.map(item=>item.id===visitaId?operation.record as Visita:item),pending:[...state.pending,operation]});
  })}
 mergeRemote(owner:string,remote:Pick<WorkspaceState,'expedientes'|'visitas'|'plantillas'>,replica?:import('@archforms/domain').ReplicaInfo){return this.change(owner,state=>mergeWorkspace(state,remote,replica))}
}

// ── Media Outbox Repository (Iteración 4) ─────────────────────────────────────
// Only implemented for SQLite native (Android). Media capture runs only on device.

const OUTBOX_DDL=[
 `CREATE TABLE IF NOT EXISTS media_outbox (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  grupo_id TEXT NOT NULL,
  visita_id TEXT NOT NULL,
  local_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  checksum TEXT NOT NULL,
  bucket_path TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_retry TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
 )`,
 `CREATE TABLE IF NOT EXISTS entity_outbox (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  depends_on TEXT NOT NULL DEFAULT '[]',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_retry TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
 )`,
];

export class SQLiteMediaOutboxRepository implements MediaOutboxRepository {
 private db:Promise<SQLiteDBConnection>;
 private tail:Promise<unknown>=Promise.resolve();
 constructor(){
  this.db=(async()=>{
   const db=await openNativeDatabase('archforms');
   for(const stmt of OUTBOX_DDL){await db.execute(stmt+';');}
   return db;
  })();
 }
 private serial<T>(fn:()=>Promise<T>):Promise<T>{
  const next=this.tail.then(fn);this.tail=next.catch(()=>undefined);return next;
 }
 private async q(sql:string,params:unknown[]=[]){return (await (await this.db).query(sql,params)).values??[];}
 private async run(sql:string,params:unknown[]=[]){await (await this.db).run(sql,params);}

 async pendingMedia(now:string):Promise<MediaOutboxItem[]>{
  const rows=await this.q(
   `SELECT * FROM media_outbox WHERE status IN ('pending','error') AND (next_retry IS NULL OR next_retry <= ?) ORDER BY created_at ASC LIMIT 5`,
   [now]
  );
  return rows.map(r=>({...r,size_bytes:Number(r.size_bytes),attempts:Number(r.attempts)})) as MediaOutboxItem[];
 }
 markMediaUploading(id:string){return this.serial(()=>this.run(`UPDATE media_outbox SET status='uploading' WHERE id=?`,[id]))}
 markMediaSynced(id:string,bucketPath:string){return this.serial(()=>this.run(`UPDATE media_outbox SET status='synced', bucket_path=?, attempts=0, last_error=NULL, next_retry=NULL WHERE id=?`,[bucketPath,id]))}
 markMediaError(id:string,error:string,nextRetry:string){return this.serial(()=>this.run(`UPDATE media_outbox SET status='error', attempts=attempts+1, last_error=?, next_retry=? WHERE id=?`,[error,nextRetry,id]))}

 async pendingEntities(now:string):Promise<EntityOutboxItem[]>{
  // Only return entities whose media dependencies are all synced
  const rows=await this.q(`
   SELECT e.* FROM entity_outbox e
   WHERE e.status IN ('pending','error')
     AND (e.next_retry IS NULL OR e.next_retry <= ?)
     AND NOT EXISTS (
      SELECT 1 FROM media_outbox m
      WHERE instr(e.depends_on, m.id) > 0
        AND m.status != 'synced'
     )
   ORDER BY e.created_at ASC LIMIT 10
  `,[now]);
  return rows.map(r=>({...r,depends_on:JSON.parse(r.depends_on as string) as string[],attempts:Number(r.attempts)})) as EntityOutboxItem[];
 }
 markEntitySyncing(id:string){return this.serial(()=>this.run(`UPDATE entity_outbox SET status='syncing' WHERE id=?`,[id]))}
  markEntitySynced(id:string,expectedPayload?:string){return this.serial(async()=>{
   if(expectedPayload===undefined){await this.run('DELETE FROM entity_outbox WHERE id=?',[id]);return}
   await this.run('DELETE FROM entity_outbox WHERE id=? AND payload=?',[id,expectedPayload]);
   await this.run("UPDATE entity_outbox SET status='pending',next_retry=NULL WHERE id=? AND payload<>?",[id,expectedPayload]);
  })}
 markEntityError(id:string,error:string,nextRetry:string){return this.serial(()=>this.run(`UPDATE entity_outbox SET status='error', attempts=attempts+1, last_error=?, next_retry=? WHERE id=?`,[error,nextRetry,id]))}

 async mediaStatus(id:string):Promise<MediaOutboxItem|null>{
  const rows=await this.q('SELECT * FROM media_outbox WHERE id=?',[id]);
  if(!rows.length)return null;
  const r=rows[0];
  return {...r,size_bytes:Number(r.size_bytes),attempts:Number(r.attempts)} as MediaOutboxItem;
 }

 async entityStatus(id:string):Promise<EntityOutboxItem|null>{
  const rows=await this.q('SELECT * FROM entity_outbox WHERE id=?',[id]);
  if(!rows.length)return null;
  const r=rows[0];
  return {...r,depends_on:JSON.parse(r.depends_on as string) as string[],attempts:Number(r.attempts)} as EntityOutboxItem;
 }

 /** Manual retry from the debug panel: skips backoff, keeps last_error for display. */
 forceRetry(ids:string[]){
  if(!ids.length)return Promise.resolve();
  const placeholders=ids.map(()=>'?').join(',');
  return this.serial(async()=>{
   await this.run(`UPDATE media_outbox SET status='pending', attempts=0, next_retry=NULL WHERE id IN (${placeholders})`,ids);
   await this.run(`UPDATE entity_outbox SET status='pending', attempts=0, next_retry=NULL WHERE id IN (${placeholders})`,ids);
  });
 }

 /** Insert a media item into the outbox. Called atomically from saveCaptureGroup. */
 async enqueueMedia(item:Omit<MediaOutboxItem,'attempts'|'last_error'|'next_retry'|'status'>):Promise<void>{
  await this.serial(()=>this.run(
   `INSERT OR IGNORE INTO media_outbox(id,entity_type,entity_id,grupo_id,visita_id,local_path,mime_type,size_bytes,checksum,bucket_path,attempts,last_error,next_retry,status,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,NULL,0,NULL,NULL,'pending',?)`,
   [item.id,item.entity_type,item.entity_id,item.grupo_id,item.visita_id,item.local_path,item.mime_type,item.size_bytes,item.checksum,item.created_at]
  ));
 }

 /** Insert a grupo entity into the outbox with its media dependencies. */
 async enqueueEntity(item:Omit<EntityOutboxItem,'attempts'|'last_error'|'next_retry'|'status'>):Promise<void>{
  await this.serial(()=>this.run(
    `INSERT INTO entity_outbox(id,entity_type,payload,depends_on,attempts,last_error,next_retry,status,created_at)
     VALUES(?,?,?,?,0,NULL,NULL,'pending',?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,depends_on=excluded.depends_on,status='pending',attempts=0,last_error=NULL,next_retry=NULL WHERE entity_outbox.payload<>excluded.payload`,
   [item.id,item.entity_type,item.payload,JSON.stringify(item.depends_on),item.created_at]
  ));
 }

  /** Uploaded originals remain needed for offline use. No implicit age eviction. */
  collectGarbage(_now:string):Promise<string[]>{return Promise.resolve([])}

 /** Requeue items left in transient states by an abrupt close (crash/kill). */
 resetStuck(){
  return this.serial(async()=>{
   await this.run(`UPDATE media_outbox SET status='pending', next_retry=NULL WHERE status='uploading'`);
   await this.run(`UPDATE entity_outbox SET status='pending', next_retry=NULL WHERE status='syncing'`);
  });
 }

 /** Get outbox stats for a visita (for UI badges). */
 async statsForVisita(visitaId:string):Promise<{pending:number;uploading:number;synced:number;error:number}>{
  const rows=await this.q(
   `SELECT status, COUNT(*) as cnt FROM media_outbox WHERE visita_id=? GROUP BY status`,
   [visitaId]
  );
  const map:Record<string,number>={};
  for(const r of rows)map[r.status as string]=Number(r.cnt);
  return {pending:map['pending']??0,uploading:map['uploading']??0,synced:map['synced']??0,error:map['error']??0};
 }
}

/** No-op implementation for web environments (capture is native-only). */
export class NoopMediaOutboxRepository implements MediaOutboxRepository {
 pendingMedia(){return Promise.resolve([])}
 markMediaUploading(){return Promise.resolve()}
 markMediaSynced(){return Promise.resolve()}
 markMediaError(){return Promise.resolve()}
 pendingEntities(){return Promise.resolve([])}
 markEntitySyncing(){return Promise.resolve()}
 markEntitySynced(){return Promise.resolve()}
 markEntityError(){return Promise.resolve()}
 mediaStatus(){return Promise.resolve(null)}
 entityStatus(){return Promise.resolve(null)}
 forceRetry(){return Promise.resolve()}
 enqueueMedia(){return Promise.resolve()}
 enqueueEntity(){return Promise.resolve()}
 collectGarbage(){return Promise.resolve([] as string[])}
 resetStuck(){return Promise.resolve()}
}

/** IndexedDB media outbox for web. Same contract as the SQLite one. */
export class IndexedMediaOutboxRepository implements MediaOutboxRepository {
 private db:Promise<IDBPDatabase>;
 constructor(name='archforms-media-outbox-v1'){
  this.db=openDB(name,1,{upgrade(db){db.createObjectStore('media');db.createObjectStore('entities')}});
 }
 private async allMedia():Promise<MediaOutboxItem[]>{return (await (await this.db).getAll('media')) as MediaOutboxItem[]}
 private async allEntities():Promise<EntityOutboxItem[]>{return (await (await this.db).getAll('entities')) as EntityOutboxItem[]}
 private due<T extends {status:string;next_retry:string|null;created_at:string}>(rows:T[],now:string,valid:string[]){
  return rows.filter(r=>valid.includes(r.status)&&(!r.next_retry||r.next_retry<=now)).sort((a,b)=>a.created_at<b.created_at?-1:1);
 }

 async pendingMedia(now:string):Promise<MediaOutboxItem[]>{
  return this.due(await this.allMedia(),now,['pending','error']).slice(0,5);
 }
 private async patchMedia(id:string,patch:Partial<MediaOutboxItem>){
  const db=await this.db;const cur=await db.get('media',id) as MediaOutboxItem|undefined;if(!cur)return;
  await db.put('media',{...cur,...patch},id);
 }
 markMediaUploading(id:string){return this.patchMedia(id,{status:'uploading'})}
 markMediaSynced(id:string,bucketPath:string){return this.patchMedia(id,{status:'synced',bucket_path:bucketPath,attempts:0,last_error:null,next_retry:null})}
 async markMediaError(id:string,error:string,nextRetry:string){
  const db=await this.db;const cur=await db.get('media',id) as MediaOutboxItem|undefined;if(!cur)return;
  await db.put('media',{...cur,status:'error',attempts:cur.attempts+1,last_error:error,next_retry:nextRetry} as MediaOutboxItem,id);
 }

 async pendingEntities(now:string):Promise<EntityOutboxItem[]>{
  const mediaById=new Map((await this.allMedia()).map(m=>[m.id,m.status]));
  return this.due(await this.allEntities(),now,['pending','error'])
   .filter(e=>e.depends_on.every(dep=>mediaById.get(dep)==='synced'))
   .slice(0,10);
 }
 private async patchEntity(id:string,patch:Partial<EntityOutboxItem>){
  const db=await this.db;const cur=await db.get('entities',id) as EntityOutboxItem|undefined;if(!cur)return;
  await db.put('entities',{...cur,...patch},id);
 }
 markEntitySyncing(id:string){return this.patchEntity(id,{status:'syncing'})}
  async markEntitySynced(id:string,expectedPayload?:string){
   const tx=(await this.db).transaction('entities','readwrite');const item=await tx.store.get(id);
   if(item){if(expectedPayload===undefined||item.payload===expectedPayload)await tx.store.delete(id);else await tx.store.put({...item,status:'pending',next_retry:null},id)}
   await tx.done;
  }
 async markEntityError(id:string,error:string,nextRetry:string){
  const db=await this.db;const cur=await db.get('entities',id) as EntityOutboxItem|undefined;if(!cur)return;
  await db.put('entities',{...cur,status:'error',attempts:cur.attempts+1,last_error:error,next_retry:nextRetry} as EntityOutboxItem,id);
 }

 async mediaStatus(id:string):Promise<MediaOutboxItem|null>{
  return (await (await this.db).get('media',id) as MediaOutboxItem|undefined)??null;
 }

 async entityStatus(id:string):Promise<EntityOutboxItem|null>{
  return (await (await this.db).get('entities',id) as EntityOutboxItem|undefined)??null;
 }

 async forceRetry(ids:string[]){
  const db=await this.db;
  for(const id of ids){
   const m=await db.get('media',id) as MediaOutboxItem|undefined;
   if(m)await db.put('media',{...m,status:'pending',attempts:0,next_retry:null} as MediaOutboxItem,id);
   const e=await db.get('entities',id) as EntityOutboxItem|undefined;
   if(e)await db.put('entities',{...e,status:'pending',attempts:0,next_retry:null} as EntityOutboxItem,id);
  }
 }

 async enqueueMedia(item:Omit<MediaOutboxItem,'attempts'|'last_error'|'next_retry'|'status'>){
  const db=await this.db;if(await db.get('media',item.id))return;
  await db.add('media',{...item,attempts:0,last_error:null,next_retry:null,status:'pending'} as MediaOutboxItem,item.id);
 }

 async enqueueEntity(item:Omit<EntityOutboxItem,'attempts'|'last_error'|'next_retry'|'status'>){
   const tx=(await this.db).transaction('entities','readwrite');const existing=await tx.store.get(item.id);
   if(!existing||existing.payload!==item.payload)await tx.store.put({...item,attempts:0,last_error:null,next_retry:null,status:'pending'} as EntityOutboxItem,item.id);
   await tx.done;
 }

  collectGarbage(_now:string):Promise<string[]>{return Promise.resolve([])}

 async resetStuck(){
  const db=await this.db;
  for(const m of await this.allMedia())if(m.status==='uploading')await db.put('media',{...m,status:'pending',next_retry:null} as MediaOutboxItem,m.id);
  for(const e of await this.allEntities())if(e.status==='syncing')await db.put('entities',{...e,status:'pending',next_retry:null} as EntityOutboxItem,e.id);
 }
}
