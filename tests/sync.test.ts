import 'fake-indexeddb/auto';
import {beforeEach,describe,expect,it} from 'vitest';
import {IndexedRepository} from '@archforms/data-local';
import {saveProfile,SyncEngine,type RemoteRepository} from '@archforms/application';
import type {Pending,Profile} from '@archforms/domain';

const owner='00000000-0000-0000-0000-000000000001';
const original:Profile={id:owner,email:'a@archforms.test',nombre_completo:'Arquitecta Uno',cargo:null,nro_colegiatura:null,updated_at:'2026-01-01T00:00:00.000001+00:00'};

class Remote implements RemoteRepository{
 profile={...original}; calls=0;
 async fetch(){return this.profile}
 async push(operation:Pending){this.calls+=1;this.profile={...this.profile,...operation.edit,updated_at:'2026-01-01T00:00:01.000002+00:00'};return this.profile}
}

describe('outbox local del perfil',()=>{
 let local:IndexedRepository;
 beforeEach(async()=>{local=new IndexedRepository(`test-${crypto.randomUUID()}`);await local.acceptRemote(owner,original)});
 it('guarda perfil y operación juntos y sincroniza una sola vez',async()=>{
  await saveProfile(local,owner,{nombre_completo:'Arquitecta Editada',cargo:'Inspectora',nro_colegiatura:'CAP 1'},'op-1');
  expect((await local.read(owner)).pending?.id).toBe('op-1');
  const remote=new Remote();const engine=new SyncEngine(local,remote,owner);
  await Promise.all([engine.run(),engine.run()]);
  expect(remote.calls).toBe(1);
  expect(await local.read(owner)).toEqual({profile:remote.profile,pending:null});
 });
 it('conserva una edición más nueva mientras confirma la anterior',async()=>{
  await saveProfile(local,owner,{nombre_completo:'Primera',cargo:null,nro_colegiatura:null},'op-1');
  const first=(await local.read(owner)).pending!;
  await saveProfile(local,owner,{nombre_completo:'Segunda',cargo:null,nro_colegiatura:null},'op-2');
  await local.acknowledge(owner,first,{...original,nombre_completo:'Primera',updated_at:'2026-01-01T00:00:02.000003+00:00'});
  const state=await local.read(owner);
  expect(state.profile?.nombre_completo).toBe('Segunda');
  expect(state.pending).toMatchObject({id:'op-2',base:'2026-01-01T00:00:02.000003+00:00'});
 });
});
