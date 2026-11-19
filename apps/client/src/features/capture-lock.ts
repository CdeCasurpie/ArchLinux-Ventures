const writes=new Map<string,Promise<unknown>>();
/** Downloads and edits serialize their read/commit cycle per visit. */
export async function withCaptureLock<T>(id:string,task:()=>Promise<T>):Promise<T>{
 const pending=(writes.get(id)??Promise.resolve()).catch(()=>{}).then(task);
 writes.set(id,pending);
 try{return await pending}finally{if(writes.get(id)===pending)writes.delete(id)}
}
