import type {MediaOutboxRepository} from './index';

/** Legacy physical outbox is shared; only dispatch tasks owned by this account. */
export function scopeMediaOutbox(repository:MediaOutboxRepository,owner:string,visitIds:()=>Promise<Set<string>>,legacy?:(id:string)=>Promise<string|null>):MediaOutboxRepository{
  return new Proxy(repository,{
    get(target,key){
      if(key==='pendingMedia')return async(now:string)=>{
        const rows=await target.pendingMedia(now);if(!rows.length)return [];
        const allowed=await visitIds();
        return rows.filter(item=>allowed.has(item.visita_id));
      };
      if(key==='pendingEntities')return async(now:string)=>{
        const rows=await target.pendingEntities(now);if(!rows.length)return [];
        const allowed=await visitIds();
        const result=[];
        for(const item of rows){
          try{
            let payload=JSON.parse(item.payload);
            if(!payload.visita_id&&legacy){
              const frozen=await legacy(item.id);if(!frozen)continue;
              payload=JSON.parse(frozen);
              if(!allowed.has(payload.visita_id)||payload.profesional_id!==owner)continue;
              await target.enqueueEntity({...item,payload:frozen});item.payload=frozen;
            }
            if(allowed.has(payload.visita_id)&&payload.profesional_id===owner)result.push(item);
          }catch{/* Legacy/foreign work remains untouched until its owner can recover it. */}
        }
        return result;
      };
      if(key==='collectGarbage')return async()=>[];
      const value=Reflect.get(target,key,target);
      return typeof value==='function'?value.bind(target):value;
    },
  });
}
