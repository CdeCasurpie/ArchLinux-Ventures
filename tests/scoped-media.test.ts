import 'fake-indexeddb/auto';
import {describe,expect,it} from 'vitest';
import {IndexedMediaOutboxRepository} from '@archforms/data-local';
import {scopeMediaOutbox} from '@archforms/application';

describe('account-scoped multimedia dispatch',()=>{
  it('never dispatches another account media or group',async()=>{
    const repository=new IndexedMediaOutboxRepository(`scope-${crypto.randomUUID()}`);
    for(const [id,visit,owner] of [['a','visit-a','owner-a'],['b','visit-b','owner-b']]){
      await repository.enqueueMedia({id,entity_id:id,entity_type:'foto',grupo_id:id,visita_id:visit,local_path:id,mime_type:'image/jpeg',size_bytes:1,checksum:id,bucket_path:null,created_at:new Date().toISOString()});
      await repository.enqueueEntity({id,entity_type:'grupo_captura',payload:JSON.stringify({visita_id:visit,profesional_id:owner}),depends_on:[],created_at:new Date().toISOString()});
    }
    const scoped=scopeMediaOutbox(repository,'owner-a',async()=>new Set(['visit-a']));
    expect((await scoped.pendingMedia(new Date().toISOString())).map(row=>row.id)).toEqual(['a']);
    expect((await scoped.pendingEntities(new Date().toISOString())).map(row=>row.id)).toEqual(['a']);
    expect(await repository.entityStatus('b')).not.toBeNull();
  });
  it('an old acknowledgement cannot remove a newer transcription payload',async()=>{
    const repository=new IndexedMediaOutboxRepository(`ack-${crypto.randomUUID()}`);
    const row={id:'g',entity_type:'grupo_captura' as const,payload:'old',depends_on:[],created_at:new Date().toISOString()};
    await repository.enqueueEntity(row);await repository.markEntitySyncing('g');
    await repository.enqueueEntity({...row,payload:'new'});
    await repository.markEntitySynced('g','old');
    expect(await repository.entityStatus('g')).toMatchObject({payload:'new',status:'pending'});
    await repository.markEntitySynced('g','new');expect(await repository.entityStatus('g')).toBeNull();
  });
});
