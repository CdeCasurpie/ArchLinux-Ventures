import {Preferences} from '@capacitor/preferences';
import {local,workspaceLocal,mediaOutbox,supabase} from '../platform';
import {deleteVisitCapture} from './lab-storage';

/** Idempotent, resumable Storage API cleanup before atomic identity deletion. */
export async function deleteAccount(owner:string,confirmation:string,onProgress:(text:string)=>void){
 if(confirmation!=='ELIMINAR')throw new Error('Escribe ELIMINAR para confirmar.');
 if(!navigator.onLine)throw new Error('Conéctate a internet para eliminar tu cuenta.');
 const {data:identity,error:identityError}=await supabase.auth.getUser();
 if(identityError||identity.user?.id!==owner)throw new Error('Inicia sesión de nuevo antes de eliminar la cuenta.');
 const snapshot=await workspaceLocal.read(owner);
 onProgress('Eliminando archivos de la cuenta…');
 while(true){
  const {data,error}=await supabase.rpc('begin_account_deletion_v1',{confirmation});
  if(error)throw new Error(error.message);
  if(!Array.isArray(data))throw new Error('Respuesta de borrado no válida.');
  if(!data.length)break;
  const buckets=new Map<string,string[]>();
  for(const row of data){
   if(!row||typeof row!=='object'||Array.isArray(row)||typeof row.bucket!=='string'||typeof row.path!=='string')throw new Error('Referencia de archivo no válida.');
   buckets.set(row.bucket,[...(buckets.get(row.bucket)??[]),row.path]);
  }
  for(const [bucket,paths] of buckets){const {error}=await supabase.storage.from(bucket).remove(paths);if(error)throw new Error(`No se pudieron eliminar los archivos. Reintenta para completar el borrado: ${error.message}`)}
 }
 onProgress('Eliminando cuenta, expedientes y visitas…');
 const {error}=await supabase.rpc('delete_my_account_v1',{confirmation});
 if(error)throw new Error(error.message);
 onProgress('Limpiando los datos de este dispositivo…');
 try{
  for(const visit of snapshot.visitas)await deleteVisitCapture(visit.id);
  await mediaOutbox.removeVisits?.(snapshot.visitas.map(visit=>visit.id));
  await workspaceLocal.clear(owner);await local.clear(owner);
  await Preferences.remove({key:`archforms-download-journal-v1:${owner}`});
  for(const store of [localStorage,sessionStorage])for(const key of Object.keys(store))if(key.includes(owner))store.removeItem(key);
 }finally{await supabase.auth.signOut({scope:'local'})}
}
