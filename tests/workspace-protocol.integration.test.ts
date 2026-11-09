import 'fake-indexeddb/auto';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { IndexedWorkspaceRepository } from '@archforms/data-local';
import { SupabaseWorkspaceRepository } from '@archforms/data-supabase';
import { buildExpediente, buildVisita, workspaceOperation, WorkspaceSyncEngine } from '@archforms/application';
import type { Database } from '@archforms/contracts';

const url=process.env.TEST_SUPABASE_URL,key=process.env.TEST_SUPABASE_KEY;
if(!url||!key||new URL(url).protocol!=='http:'||!['localhost','127.0.0.1'].includes(new URL(url).hostname))throw new Error('Local integration runner required');

describe('workspace protocol against local Postgres',()=>{
  it('creates offline, reconciles numbering, deduplicates and patches independent fields',async()=>{
    const client=createClient<Database>(url!,key!,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data,error}=await client.auth.signUp({email:`workspace-${crypto.randomUUID()}@archforms.test`,password:'Local-workspace-test-2026'});
    expect(error).toBeNull();expect(data.session).not.toBeNull();
    const owner=data.user!.id;
    const form=new FormData();form.set('nro_expediente',crypto.randomUUID());form.set('ubicacion','Original');
    const record=buildExpediente(owner,form,{version:1,sections:[{id:'s',title:'Base',fields:[{id:'note',label:'Nota',type:'text'}]}]});
    const a=new IndexedWorkspaceRepository(`workspace-a-${crypto.randomUUID()}`);
    const b=new IndexedWorkspaceRepository(`workspace-b-${crypto.randomUUID()}`);
    const remote=new SupabaseWorkspaceRepository(client);
    try{
      await a.save(owner,workspaceOperation('expediente',record));
      const command=(await a.read(owner)).pending[0];
      expect(command.workspace_mutation?.type).toBe('create');
      // Lose the reply after acceptance, then retry the same durable operation.
      let loseReply=true;
      const lossy={fetchAll:()=>remote.fetchAll(),push:async(op:typeof command)=>{
        await remote.push(op);
        if(loseReply){loseReply=false;throw new Error('reply lost')}
      }};
      await expect(new WorkspaceSyncEngine(a,lossy,owner).run()).rejects.toThrow('reply lost');
      expect((await a.read(owner)).pending).toHaveLength(1);
      await new WorkspaceSyncEngine(a,lossy,owner).run();
      expect((await client.from('expediente').select('id').eq('id',record.id)).data).toHaveLength(1);
      await b.mergeRemote(owner,await remote.fetchAll());

      await a.save(owner,workspaceOperation('expediente',{...record,ubicacion:'A cambió ubicación'}));
      await b.save(owner,workspaceOperation('expediente',{...record,propietario:'B cambió propietario'}));
      await new WorkspaceSyncEngine(a,remote,owner).run();
      await new WorkspaceSyncEngine(b,remote,owner).run();
      expect((await client.from('expediente').select('ubicacion,propietario').eq('id',record.id).single()).data).toEqual({ubicacion:'A cambió ubicación',propietario:'B cambió propietario'});

      const first=buildVisita(record,1,'2026-11-09'),second=buildVisita(record,1,'2026-11-09');
      await a.save(owner,workspaceOperation('visita',first));
      await b.save(owner,workspaceOperation('visita',second));
      await Promise.all([new WorkspaceSyncEngine(a,remote,owner).run(),new WorkspaceSyncEngine(b,remote,owner).run()]);
      const rows=await client.from('visita').select('id,nro_visita').eq('expediente_id',record.id).order('nro_visita');
      expect(rows.error).toBeNull();expect(rows.data?.map(v=>v.nro_visita)).toEqual([1,2]);
      expect(new Set(rows.data?.map(v=>v.id))).toEqual(new Set([first.id,second.id]));
      expect((await a.read(owner)).pending).toHaveLength(0);
      expect((await b.read(owner)).pending).toHaveLength(0);
      // Immutable identity and answer ownership cannot be patched through this RPC.
      const forbidden=await client.rpc('sync_workspace_v1',{operation_id:crypto.randomUUID(),entity:'visita',entity_id:first.id,mutation:'patch',payload:{checklist_respuestas_json:{note:'bypass'}}});
      expect(forbidden.error).not.toBeNull();
      const spoof=await client.rpc('sync_workspace_v1',{operation_id:crypto.randomUUID(),entity:'expediente',entity_id:record.id,mutation:'patch',payload:{profesional_id:crypto.randomUUID()}});
      expect(spoof.error).not.toBeNull();
    }finally{
      await client.from('visita').delete().eq('expediente_id',record.id);
      await client.from('expediente').delete().eq('id',record.id);
      await client.auth.signOut();
    }
  },30000);
});
