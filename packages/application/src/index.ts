import { type Profile,type ProfileEdit,type LocalState,type Pending,validateProfile } from '@archforms/domain';
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
