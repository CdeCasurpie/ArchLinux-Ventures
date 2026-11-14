import 'fake-indexeddb/auto';
import {createClient} from '@supabase/supabase-js';
import {describe,expect,it} from 'vitest';
import {SupabaseProfileRepository,SupabaseWorkspaceRepository} from '@archforms/data-supabase';
import {buildExpediente,buildVisita,workspaceOperation} from '@archforms/application';
import {IndexedWorkspaceRepository} from '@archforms/data-local';
import type {Database} from '@archforms/contracts';

const url=process.env.TEST_SUPABASE_URL,key=process.env.TEST_SUPABASE_KEY;
if(!url||!key||new URL(url).protocol!=='http:'||!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw new Error('Local integration only');
describe('firma reutilizable y eliminación en cascada',()=>{
 it('sincroniza la firma, borra una visita con sus archivos, propaga el expediente eliminado y rechaza otro propietario',async()=>{
  const client=createClient<Database>(url!,key!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await client.auth.signUp({email:`deletion-${crypto.randomUUID()}@archforms.test`,password:'Local-deletion-test-2026'});
  expect(error).toBeNull();const owner=data.user!.id;
  const remote=new SupabaseWorkspaceRepository(client),profile=new SupabaseProfileRepository(client);
  const signature='data:image/jpeg;base64,AQID';
  const pending={id:crypto.randomUUID(),owner,base:'',edit:{nombre_completo:'Ana Supervisora',cargo:'Arquitecta',nro_colegiatura:'CAP 123',firma_imagen:signature}};
  const first=await profile.push(pending);expect(first.firma_imagen).toBe(signature);
  expect(await profile.push(pending)).toEqual(first);expect((await profile.fetch()).firma_imagen).toBe(signature);
  const form=new FormData();form.set('nro_expediente',crypto.randomUUID());form.set('ubicacion','Lima');
  const record=buildExpediente(owner,form,{version:2,sections:[{id:'s',title:'General',fields:[]}]}),visit=buildVisita(record,1,'2026-11-14'),second=buildVisita(record,2,'2026-11-14');
  const local=new IndexedWorkspaceRepository(`cascade-${crypto.randomUUID()}`);
  await local.save(owner,workspaceOperation('expediente',record));await local.save(owner,workspaceOperation('visita',visit));await local.save(owner,workspaceOperation('visita',second));
  for(const op of (await local.read(owner)).pending)await remote.push(op);
  const audioId=crypto.randomUUID(),photoId=crypto.randomUUID(),groupId=crypto.randomUUID(),stamp=new Date().toISOString();
  const paths=[audioId,photoId].map(id=>`${owner}/${visit.id}/${id}`);
  try{
   for(const path of paths)expect((await client.storage.from('visita-media').upload(path,new Uint8Array([1,2,3]),{contentType:path===paths[0]?'audio/wav':'image/jpeg'})).error).toBeNull();
   const payload={id:groupId,visita_id:visit.id,profesional_id:owner,iniciado_at:stamp,confirmado_at:stamp,transcripcion:'Hallazgo',audio:{id:audioId,remote_path:paths[0],mime_type:'audio/wav',size_bytes:3,checksum:'039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',duration_ms:100},fotos:[{id:photoId,archivo_id:photoId,remote_path:paths[1],mime_type:'image/jpeg',size_bytes:3,checksum:'039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',orden_en_grupo:1,capturada_at:stamp}]};
   expect((await client.rpc('sync_capture_v1',{operation_id:crypto.randomUUID(),payload})).error).toBeNull();
   expect((await client.from('firmante_visita').insert({visita_id:visit.id,nombre_impreso:'Ana',rol:'Supervisora',orden:1})).error).toBeNull();
   expect((await client.from('adjunto').insert({expediente_id:record.id,visita_id:visit.id,archivo_id:photoId,tipo:'OTRO',titulo:'Adjunto',orden:1})).error).toBeNull();
   const initial=await remote.fetchReplica();
   const deletion={...workspaceOperation('visita',visit),workspace_mutation:{type:'delete' as const,payload:{}}};
   await remote.push(deletion);await remote.push(deletion);
   for(const table of ['foto','grupo_captura','firmante_visita','adjunto'] as const){const result=await client.from(table).select('id').eq('visita_id',visit.id);expect(result.error).toBeNull();expect(result.data).toHaveLength(0)}
   expect((await client.from('archivo').select('id').in('id',[audioId,photoId])).data).toHaveLength(0);
   expect((await client.storage.from('visita-media').list(`${owner}/${visit.id}`)).data).toHaveLength(0);
   expect((await client.from('visita').select('id').eq('id',second.id)).data).toHaveLength(1);
   const other=createClient<Database>(url!,key!,{auth:{persistSession:false,autoRefreshToken:false}});
   expect((await other.auth.signUp({email:`other-${crypto.randomUUID()}@archforms.test`,password:'Local-deletion-test-2026'})).error).toBeNull();
   expect((await other.rpc('sync_delete_workspace_v1',{operation_id:crypto.randomUUID(),entity:'expediente',entity_id:record.id})).error?.code).toBe('42501');await other.auth.signOut();
   await remote.push({...workspaceOperation('expediente',record),workspace_mutation:{type:'delete',payload:{}}});
   const delta=await remote.fetchReplica(initial.replica.cursor);
   expect(delta.replica.deleted).toContainEqual({entity:'expediente',id:record.id});
   expect((await client.from('visita').select('id').eq('expediente_id',record.id)).data).toHaveLength(0);
   expect((await profile.fetch()).firma_imagen).toBe(signature);
  }finally{await client.from('expediente').delete().eq('id',record.id);await client.storage.from('visita-media').remove(paths);await client.auth.signOut()}
 },30000);
});
