import {createClient} from '@supabase/supabase-js';
import {describe,expect,it} from 'vitest';

const url=process.env.TEST_SUPABASE_URL,key=process.env.TEST_SUPABASE_KEY;
if(!url||!key||new URL(url).protocol!=='http:'||!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw new Error('Local integration only');
describe('atomic capture acceptance',()=>{
  it('requires uploaded files, rolls back metadata failures and deduplicates retries',async()=>{
    const client=createClient(url!,key!,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data,error}=await client.auth.signUp({email:`capture-${crypto.randomUUID()}@archforms.test`,password:'Local-capture-test-2026'});
    expect(error).toBeNull();const owner=data.user!.id;
    const caseId=crypto.randomUUID(),visitId=crypto.randomUUID(),groupId=crypto.randomUUID(),audioId=crypto.randomUUID(),photoId=crypto.randomUUID();
    const stamp=new Date().toISOString();
    const paths=[audioId,photoId].map(id=>`${owner}/${visitId}/${id}`);
    const payload={id:groupId,visita_id:visitId,profesional_id:owner,iniciado_at:stamp,confirmado_at:stamp,transcripcion:'original',
      audio:{id:audioId,remote_path:paths[0],mime_type:'audio/wav',size_bytes:3,checksum:'039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',duration_ms:100},
      fotos:[{id:photoId,archivo_id:photoId,remote_path:paths[1],mime_type:'image/jpeg',size_bytes:3,checksum:'039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',orden_en_grupo:1,capturada_at:stamp}]};
    try{
      expect((await client.from('expediente').insert({id:caseId,profesional_id:owner,nro_expediente:caseId,ubicacion:'Test',checklist_nombre:'Test',checklist_esquema_json:{}})).error).toBeNull();
      expect((await client.from('visita').insert({id:visitId,expediente_id:caseId,nro_visita:1,fecha:'2026-11-10',checklist_nombre:'Test',checklist_esquema_json:{},checklist_respuestas_json:{},documento_json:{}})).error).toBeNull();
      const operationId=crypto.randomUUID();
      expect((await client.rpc('sync_capture_v1',{operation_id:operationId,payload})).error).not.toBeNull();
      for(const path of paths)expect((await client.storage.from('visita-media').upload(path,new Uint8Array([1,2,3]),{contentType:path===paths[0]?'audio/wav':'image/jpeg'})).error).toBeNull();
      const first=await client.rpc('sync_capture_v1',{operation_id:operationId,payload});expect(first.error).toBeNull();
      const failedId=crypto.randomUUID();
      const invalid={...payload,transcripcion:'must roll back',fotos:[{...payload.fotos[0],id:'invalid-uuid'}]};
      expect((await client.rpc('sync_capture_v1',{operation_id:failedId,payload:invalid})).error).not.toBeNull();
      expect((await client.from('grupo_captura').select('transcripcion_original').eq('id',groupId).single()).data?.transcripcion_original).toBe('original');
      expect((await client.rpc('sync_capture_v1',{operation_id:failedId,payload:{...payload,transcripcion:'new transcription'}})).error).toBeNull();
      expect((await client.rpc('sync_capture_v1',{operation_id:operationId,payload})).data).toEqual(first.data);
      expect((await client.from('grupo_captura').select('transcripcion_original').eq('id',groupId).single()).data?.transcripcion_original).toBe('new transcription');
      expect((await client.from('foto').select('id').eq('grupo_captura_id',groupId)).data).toHaveLength(1);
    }finally{
      await client.from('foto').delete().eq('visita_id',visitId);
      await client.from('grupo_captura').delete().eq('visita_id',visitId);
      await client.from('visita').delete().eq('id',visitId);
      await client.from('expediente').delete().eq('id',caseId);
      await client.from('archivo').delete().in('id',[audioId,photoId]);
      await client.storage.from('visita-media').remove(paths);
      await client.auth.signOut();
    }
  },30000);
});
