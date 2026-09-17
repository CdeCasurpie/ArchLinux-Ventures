import { openDB, type IDBPDatabase } from 'idb';
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';
import { type LocalRepository,type WorkspaceLocalRepository,queuedState,acknowledgedState } from '@archforms/application';
import type {LocalState,Profile,ProfileEdit,Pending,WorkspaceState,WorkspacePending} from '@archforms/domain';
const empty=():LocalState=>({profile:null,pending:null});
const sqliteManager=new SQLiteConnection(CapacitorSQLite);
async function openNativeDatabase(name:string){
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
function applyOperation(state:WorkspaceState,operation:WorkspacePending):WorkspaceState{
 const key=operation.entity==='expediente'?'expedientes':'visitas';
 const records=state[key].filter(item=>item.id!==operation.record.id);
 return {...state,[key]:[operation.record,...records],pending:[...state.pending.filter(item=>item.id!==operation.id),operation]};
}
function mergeWorkspace(state:WorkspaceState,remote:Pick<WorkspaceState,'expedientes'|'visitas'|'plantillas'>):WorkspaceState{
 const pendingCases=new Map(state.pending.filter(item=>item.entity==='expediente').map(item=>[item.record.id,item.record]));
 const pendingVisits=new Map(state.pending.filter(item=>item.entity==='visita').map(item=>[item.record.id,item.record]));
 return {expedientes:[...pendingCases.values(),...remote.expedientes.filter(item=>!pendingCases.has(item.id))] as WorkspaceState['expedientes'],visitas:[...pendingVisits.values(),...remote.visitas.filter(item=>!pendingVisits.has(item.id))] as WorkspaceState['visitas'],plantillas:remote.plantillas,pending:state.pending,last_sync:new Date().toISOString()};
}
export class IndexedWorkspaceRepository implements WorkspaceLocalRepository{
 private db:Promise<IDBPDatabase>;
 constructor(name='archforms-workspace-v1'){this.db=openDB(name,1,{upgrade(db){db.createObjectStore('workspace')}})}
 async read(owner:string):Promise<WorkspaceState>{return (await (await this.db).get('workspace',owner))??emptyWorkspace()}
 private async change(owner:string,fn:(state:WorkspaceState)=>WorkspaceState){const tx=(await this.db).transaction('workspace','readwrite');const state=(await tx.store.get(owner))??emptyWorkspace();await tx.store.put(fn(state),owner);await tx.done}
 save(owner:string,operation:WorkspacePending){return this.change(owner,state=>applyOperation(state,operation))}
 acknowledge(owner:string,id:string){return this.change(owner,state=>({...state,pending:state.pending.filter(item=>item.id!==id)}))}
 mergeRemote(owner:string,remote:Pick<WorkspaceState,'expedientes'|'visitas'|'plantillas'>){return this.change(owner,state=>mergeWorkspace(state,remote))}
}
export class SQLiteWorkspaceRepository implements WorkspaceLocalRepository{
 private db:Promise<SQLiteDBConnection>;private tail:Promise<unknown>=Promise.resolve();
 constructor(){this.db=(async()=>{const db=await openNativeDatabase('archforms_workspace');await db.execute('CREATE TABLE IF NOT EXISTS workspace_state (owner TEXT PRIMARY KEY, payload TEXT NOT NULL);');return db})()}
 private serial<T>(fn:()=>Promise<T>):Promise<T>{const next=this.tail.then(fn);this.tail=next.catch(()=>undefined);return next}
 private async raw(owner:string){const rows=await (await this.db).query('SELECT payload FROM workspace_state WHERE owner = ?',[owner]);return rows.values?.[0]?JSON.parse(rows.values[0].payload) as WorkspaceState:emptyWorkspace()}
 read(owner:string){return this.serial(()=>this.raw(owner))}
 private change(owner:string,fn:(state:WorkspaceState)=>WorkspaceState){return this.serial(async()=>{const db=await this.db,next=fn(await this.raw(owner));await db.run('INSERT INTO workspace_state(owner,payload) VALUES(?,?) ON CONFLICT(owner) DO UPDATE SET payload=excluded.payload',[owner,JSON.stringify(next)])})}
 save(owner:string,operation:WorkspacePending){return this.change(owner,state=>applyOperation(state,operation))}
 acknowledge(owner:string,id:string){return this.change(owner,state=>({...state,pending:state.pending.filter(item=>item.id!==id)}))}
 mergeRemote(owner:string,remote:Pick<WorkspaceState,'expedientes'|'visitas'|'plantillas'>){return this.change(owner,state=>mergeWorkspace(state,remote))}
}
