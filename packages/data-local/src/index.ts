import { openDB, type IDBPDatabase } from 'idb';
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite';
import { type LocalRepository,queuedState,acknowledgedState } from '@archforms/application';
import type {LocalState,Profile,ProfileEdit,Pending} from '@archforms/domain';
const empty=():LocalState=>({profile:null,pending:null});
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
   const manager=new SQLiteConnection(CapacitorSQLite);
   const db=await manager.createConnection('archforms',false,'no-encryption',1,false);
   await db.open();
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
