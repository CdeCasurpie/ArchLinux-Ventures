import {createClient} from '@supabase/supabase-js';
import {describe,expect,it} from 'vitest';
import {platformSafetyTemplate} from '../apps/client/src/features/platform-safety-template';
const url=process.env.TEST_SUPABASE_URL,key=process.env.TEST_SUPABASE_KEY;
if(!url||!key||new URL(url).protocol!=='http:'||!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw new Error('Local integration only');
const client=()=>createClient(url!,key!,{auth:{persistSession:false,autoRefreshToken:false}});

describe('eliminación real de cuenta',()=>{
 it('elimina identidad, archivos, datos y colas; impide carreras de subida y conserva otras cuentas y plantillas generales',async()=>{
  const a=client(),b=client(),anonymous=client(),email=`erase-${crypto.randomUUID()}@archforms.test`,password='Erase-account-local-2026';
  const signup=await a.auth.signUp({email,password});expect(signup.error).toBeNull();const owner=signup.data.user!.id;
  const other=await b.auth.signUp({email:`keep-${crypto.randomUUID()}@archforms.test`,password});expect(other.error).toBeNull();
  const caseId=crypto.randomUUID(),visitId=crypto.randomUUID(),templateId=crypto.randomUUID(),otherCase=crypto.randomUUID(),fileId=crypto.randomUUID(),oldVersionId=crypto.randomUUID();
  const schema={version:2,sections:[]},paths=[`${owner}/${visitId}/${fileId}`,`${owner}/${visitId}/${oldVersionId}`];
  try{
   expect((await a.from('plantilla_checklist').insert({id:templateId,profesional_id:owner,codigo:`CUSTOM-${templateId}`,nombre:'Propia',version:1,esquema_json:schema})).error).toBeNull();
   expect((await a.from('expediente').insert({id:caseId,profesional_id:owner,nro_expediente:caseId,ubicacion:'Test',checklist_template_id:templateId,checklist_nombre:'Propia',checklist_esquema_json:schema})).error).toBeNull();
   expect((await a.from('visita').insert({id:visitId,expediente_id:caseId,nro_visita:1,fecha:'2026-11-19',checklist_nombre:'Propia',checklist_template_id:templateId,checklist_esquema_json:schema,checklist_respuestas_json:{},documento_json:{}})).error).toBeNull();
   expect((await b.from('expediente').insert({id:otherCase,profesional_id:other.data.user!.id,nro_expediente:otherCase,ubicacion:'Conservar',checklist_nombre:'Test',checklist_esquema_json:schema})).error).toBeNull();
   for(const path of paths)expect((await a.storage.from('visita-media').upload(path,new Uint8Array([1,2,3]),{contentType:'image/jpeg'})).error).toBeNull();
   for(const [i,id] of [fileId,oldVersionId].entries())expect((await a.from('archivo').insert({id,profesional_id:owner,tipo:'IMAGEN',storage_key:paths[i],mime_type:'image/jpeg'})).error).toBeNull();
   expect((await a.from('foto').insert({visita_id:visitId,archivo_id:fileId,orden_captura:1,capturada_at:new Date().toISOString()})).error).toBeNull();
   expect((await a.rpc('sync_profile_signature_v1',{operation_id:crypto.randomUUID(),nombre:'Eliminar',cargo:'Test',colegiatura:'CAP 1',firma:'data:image/jpeg;base64,AQID'})).error).toBeNull();
   expect((await a.rpc('sync_patch_answers_v1',{operation_id:crypto.randomUUID(),visita_id:visitId,patch:{}})).error).toBeNull();
   expect((await anonymous.rpc('begin_account_deletion_v1',{confirmation:'ELIMINAR'})).error).not.toBeNull();
   expect((await a.rpc('begin_account_deletion_v1',{confirmation:'wrong'})).error).not.toBeNull();
   expect((await a.rpc('delete_my_account_v1',{confirmation:'ELIMINAR'})).error).not.toBeNull();
   const start=await a.rpc('begin_account_deletion_v1',{confirmation:'ELIMINAR'});expect(start.error).toBeNull();
   expect(start.data.map((file:{path:string})=>file.path).sort()).toEqual([...paths].sort());
   expect((await a.storage.from('visita-media').upload(`${owner}/${visitId}/${crypto.randomUUID()}`,new Uint8Array([4]),{contentType:'image/jpeg'})).error).not.toBeNull();
   expect((await a.rpc('delete_my_account_v1',{confirmation:'ELIMINAR'})).error).not.toBeNull();
   // An interrupted cleanup resumes with only the objects still present.
   expect((await a.storage.from('visita-media').remove([paths[0]])).error).toBeNull();
   const resume=await a.rpc('begin_account_deletion_v1',{confirmation:'ELIMINAR'});expect(resume.error).toBeNull();expect(resume.data).toEqual([{bucket:'visita-media',path:paths[1]}]);
   expect((await a.storage.from('visita-media').remove([paths[1]])).error).toBeNull();
   const finish=await a.rpc('delete_my_account_v1',{confirmation:'ELIMINAR'});expect(finish.error).toBeNull();
   expect((await a.rpc('sync_replica_pull_v1',{after_revision:0,page_size:200})).data).toEqual([]);
   expect((await a.rpc('sync_replica_head_v1')).data).toBe(0);
   expect((await a.from('profesional').select('id').eq('id',owner)).data).toEqual([]);
   for(const table of ['archivo','expediente','visita','foto','plantilla_checklist'])expect((await a.from(table).select('id').in('id',[caseId,visitId,fileId,oldVersionId,templateId])).data).toEqual([]);
   expect((await a.auth.signInWithPassword({email,password})).error).not.toBeNull();
   expect((await b.from('expediente').select('id').eq('id',otherCase).single()).data?.id).toBe(otherCase);
   const catalog=await b.from('plantilla_checklist').select('codigo,nombre,esquema_json,version').is('profesional_id',null);expect(catalog.error).toBeNull();expect(catalog.data).toHaveLength(3);
   const safety=catalog.data!.find(template=>template.codigo==='VACIO')!;expect(safety.version).toBe(3);expect(safety.nombre).toBe('Seguridad y salud en obra');
   expect(safety.esquema_json).toEqual(platformSafetyTemplate.esquema);
   const fields=safety.esquema_json.sections.flatMap((section:{fields:{type:string;options?:string[]}[]})=>section.fields);
   expect(fields).toHaveLength(20);expect(fields.every((field:{type:string;options?:string[]})=>field.type==='boolean'&&!field.options)).toBe(true);
  }finally{
   await a.storage.from('visita-media').remove(paths);await b.from('expediente').delete().eq('id',otherCase);await a.auth.signOut();await b.auth.signOut();
  }
 },30000);
});
