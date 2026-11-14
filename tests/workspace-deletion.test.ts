import 'fake-indexeddb/auto';
import {describe,expect,it} from 'vitest';
import {IndexedWorkspaceRepository} from '@archforms/data-local';
import {buildExpediente,buildVisita,workspaceOperation} from '@archforms/application';

describe('eliminación offline del expediente',()=>{
 it('elimina visitas y sus ediciones pendientes, conserva otras obras y no revive al recibir una réplica antigua',async()=>{
  const owner=crypto.randomUUID(),name=`deletion-${crypto.randomUUID()}`,local=new IndexedWorkspaceRepository(name);
  const form=new FormData();form.set('nro_expediente','A');form.set('ubicacion','Lima');
  const a=buildExpediente(owner,form,{version:2,sections:[{id:'s',title:'Base',fields:[]}]}),b={...a,id:crypto.randomUUID(),nro_expediente:'B'};
  const v1=buildVisita(a,1,'2026-11-14'),v2=buildVisita(a,2,'2026-11-14'),other=buildVisita(b,1,'2026-11-14');
  const remote={expedientes:[a,b],visitas:[v1,v2,other],plantillas:[]};
  await local.mergeRemote(owner,remote);
  await local.saveAnswers(owner,v1.id,{nota:'sin subir'});
  const op={...workspaceOperation('expediente',a),workspace_mutation:{type:'delete' as const,payload:{}}};
  await local.save(owner,op);
  let state=await new IndexedWorkspaceRepository(name).read(owner);
  expect(state.expedientes.map(e=>e.id)).toEqual([b.id]);expect(state.visitas.map(v=>v.id)).toEqual([other.id]);expect(state.pending).toEqual([op]);
  await local.mergeRemote(owner,remote,{cursor:10,partial:true,deleted:[]});
  state=await local.read(owner);
  expect(state.expedientes.map(e=>e.id)).toEqual([b.id]);expect(state.visitas.map(v=>v.id)).toEqual([other.id]);
 });
 it('una eliminación remota prevalece sobre respuestas pendientes de otro dispositivo',async()=>{
  const owner=crypto.randomUUID(),local=new IndexedWorkspaceRepository(`remote-deletion-${crypto.randomUUID()}`),form=new FormData();form.set('nro_expediente','A');form.set('ubicacion','Lima');
  const record=buildExpediente(owner,form,{version:2,sections:[{id:'s',title:'Base',fields:[]}]}),visit=buildVisita(record,1,'2026-11-14');
  await local.mergeRemote(owner,{expedientes:[record],visitas:[visit],plantillas:[]});await local.saveAnswers(owner,visit.id,{note:'offline'});
  await local.mergeRemote(owner,{expedientes:[],visitas:[],plantillas:[]},{cursor:50,partial:true,deleted:[{entity:'expediente',id:record.id}]});
  expect(await local.read(owner)).toMatchObject({expedientes:[],visitas:[],pending:[],sync_cursor:50});
 });
});
