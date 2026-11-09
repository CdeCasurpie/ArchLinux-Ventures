import { openDB, type IDBPDatabase } from 'idb';
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';
import { type LocalRepository,type WorkspaceLocalRepository,queuedState,acknowledgedState,type MediaOutboxRepository } from '@archforms/application';
import type {LocalState,Profile,ProfileEdit,Pending,WorkspaceState,WorkspacePending,MediaOutboxItem,EntityOutboxItem} from '@archforms/domain';
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
function mergeWorkspace(state:WorkspaceState,remote:Pick<WorkspaceState,'expedientes'|'visitas'|'plantillas'>):WorkspaceState{
 const pendingCases=new Map(state.pending.filter(item=>item.entity==='expediente').map(item=>[item.record.id,item.record]));
 const pendingVisits=new Map(state.pending.filter(item=>item.entity==='visita').map(item=>[item.record.id,item.record]));
 return {expedientes:[...pendingCases.values(),...remote.expedientes.filter(item=>!pendingCases.has(item.id))] as WorkspaceState['expedientes'],visitas:[...pendingVisits.values(),...remote.visitas.filter(item=>!pendingVisits.has(item.id))] as WorkspaceState['visitas'],plantillas:remote.plantillas,pending:state.pending,last_sync:new Date().toISOString()};
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
   return state;
  }
  async read(owner:string):Promise<WorkspaceState>{
   const tx=(await this.db).transaction(['records','pending','metadata']);
   const state=await this.snapshot(tx,owner);await tx.done;return state;
  }
  async save(owner:string,operation:WorkspacePending){
   const tx=(await this.db).transaction(['records','pending','metadata'],'readwrite');
   await tx.objectStore('records').put(operation.record,[owner,operation.entity==='expediente'?'expedientes':'visitas',operation.record.id]);
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
  async mergeRemote(owner:string,remote:Pick<WorkspaceState,'expedientes'|'visitas'|'plantillas'>){
   const tx=(await this.db).transaction(['records','pending','metadata'],'readwrite');
   const state=await this.snapshot(tx,owner),next=mergeWorkspace(state,remote);
   for(const kind of ['expedientes','visitas','plantillas'] as const){
    await tx.objectStore('records').delete(IDBKeyRange.bound([owner,kind,''],[owner,kind,'\uffff']));
    for(const record of next[kind])await tx.objectStore('records').put(record,[owner,kind,record.id]);
   }
   await tx.objectStore('metadata').put({last_sync:next.last_sync,order:state.pending.map(op=>op.id)},owner);
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
    CREATE TABLE IF NOT EXISTS workspace_metadata (owner TEXT PRIMARY KEY, last_sync TEXT);`);
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
   await db.executeSet(statements,true);
  }
 read(owner:string){return this.serial(()=>this.raw(owner))}
  private change(owner:string,fn:(state:WorkspaceState)=>WorkspaceState){return this.serial(async()=>{const db=await this.db;await this.writeSnapshot(db,owner,fn(await this.raw(owner)))})}
  save(owner:string,operation:WorkspacePending){return this.serial(async()=>{
   const db=await this.db;
   await db.executeSet([
    {statement:'INSERT INTO workspace_records(owner,kind,id,payload) VALUES(?,?,?,?) ON CONFLICT(owner,kind,id) DO UPDATE SET payload=excluded.payload',values:[owner,operation.entity==='expediente'?'expedientes':'visitas',operation.record.id,JSON.stringify(operation.record)]},
    {statement:'INSERT INTO workspace_pending(owner,id,position,payload) VALUES(?,?,(SELECT COALESCE(MAX(position),-1)+1 FROM workspace_pending WHERE owner=?),?) ON CONFLICT(owner,id) DO UPDATE SET payload=excluded.payload',values:[owner,operation.id,owner,JSON.stringify(operation)]},
    {statement:'INSERT OR IGNORE INTO workspace_metadata(owner,last_sync) VALUES(?,NULL)',values:[owner]},
   ],true);
  })}
  acknowledge(owner:string,id:string){return this.serial(async()=>{await (await this.db).run('DELETE FROM workspace_pending WHERE owner=? AND id=?',[owner,id])})}
 mergeRemote(owner:string,remote:Pick<WorkspaceState,'expedientes'|'visitas'|'plantillas'>){return this.change(owner,state=>mergeWorkspace(state,remote))}
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
 markEntitySynced(id:string){return this.serial(()=>this.run(`DELETE FROM entity_outbox WHERE id=?`,[id]))}
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
   `INSERT OR IGNORE INTO entity_outbox(id,entity_type,payload,depends_on,attempts,last_error,next_retry,status,created_at)
    VALUES(?,?,?,?,0,NULL,NULL,'pending',?)`,
   [item.id,item.entity_type,item.payload,JSON.stringify(item.depends_on),item.created_at]
  ));
 }

 /** Delete synced media older than 7 days. Returns local_path list for file deletion. */
 async collectGarbage(now:string):Promise<string[]>{
  const cutoff=new Date(new Date(now).getTime()-7*24*60*60*1000).toISOString();
  const rows=await this.q(`SELECT id,local_path FROM media_outbox WHERE status='synced' AND created_at < ?`,[cutoff]);
  if(!rows.length)return [];
  const ids=rows.map((r:Record<string,unknown>)=>r.id as string);
  const placeholders=ids.map(()=>'?').join(',');
  await this.serial(()=>this.run(`DELETE FROM media_outbox WHERE id IN (${placeholders})`,ids));
  return rows.map((r:Record<string,unknown>)=>r.local_path as string);
 }

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
 async markEntitySynced(id:string){await (await this.db).delete('entities',id)}
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
  const db=await this.db;if(await db.get('entities',item.id))return;
  await db.add('entities',{...item,attempts:0,last_error:null,next_retry:null,status:'pending'} as EntityOutboxItem,item.id);
 }

 async collectGarbage(now:string):Promise<string[]>{
  const cutoff=new Date(new Date(now).getTime()-7*24*60*60*1000).toISOString();
  const db=await this.db;const stale=(await this.allMedia()).filter(m=>m.status==='synced'&&m.created_at<cutoff);
  await Promise.all(stale.map(m=>db.delete('media',m.id)));
  return stale.map(m=>m.local_path);
 }

 async resetStuck(){
  const db=await this.db;
  for(const m of await this.allMedia())if(m.status==='uploading')await db.put('media',{...m,status:'pending',next_retry:null} as MediaOutboxItem,m.id);
  for(const e of await this.allEntities())if(e.status==='syncing')await db.put('entities',{...e,status:'pending',next_retry:null} as EntityOutboxItem,e.id);
 }
}
