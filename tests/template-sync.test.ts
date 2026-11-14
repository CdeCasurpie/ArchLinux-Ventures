import 'fake-indexeddb/auto';
import {describe,expect,it} from 'vitest';
import {IndexedWorkspaceRepository} from '@archforms/data-local';
import {workspaceOperation,WorkspaceSyncEngine,type WorkspaceRemoteRepository} from '@archforms/application';
import {withAvanceObra,AVANCE_OBRA_FIELD_ID,type ChecklistTemplate,type WorkspacePending,type WorkspaceState} from '@archforms/domain';

const owner='00000000-0000-0000-0000-000000000001';
const baseTemplate=():ChecklistTemplate=>({
 id:crypto.randomUUID(),codigo:'USR-A1B2C3D4',nombre:'Mi checklist',version:1,profesional_id:owner,activa:true,
 esquema:withAvanceObra({version:2,sections:[{id:'s1',title:'General',fields:[
  {id:'estado',label:'Estado del elemento',type:'select',options:['Bueno','Regular','Malo']},
 ]}]}) as ChecklistTemplate['esquema'],
});

/** Remoto falso que registra las mutaciones exactas que el repo enviaría. */
class Remote implements WorkspaceRemoteRepository{
 state:Pick<WorkspaceState,'expedientes'|'visitas'|'plantillas'>={expedientes:[],visitas:[],plantillas:[]};
 pushes:WorkspacePending[]=[];
 async fetchAll(){return this.state}
 async push(operation:WorkspacePending){
  this.pushes.push(operation);
  if(operation.entity==='plantilla')this.state.plantillas=[operation.record as ChecklistTemplate];
 }
}

describe('plantillas por el sync del workspace (B1)',()=>{
 it('quedar en la outbox local sin conexión y sube al reconectar',async()=>{
  const local=new IndexedWorkspaceRepository(`tpl-${crypto.randomUUID()}`);
  const template=baseTemplate();
  await local.save(owner,workspaceOperation('plantilla',template));
  let state=await local.read(owner);
  expect(state.plantillas).toHaveLength(1);
  expect(state.pending.map(op=>op.entity)).toEqual(['plantilla']);
  // El registro local conserva la forma de dominio (esquema), con el avance inyectado.
  expect(state.plantillas[0].esquema.sections.at(-1)!.fields.some(f=>f.id===AVANCE_OBRA_FIELD_ID)).toBe(true);

  const remote=new Remote(),engine=new WorkspaceSyncEngine(local,remote,owner);
  await engine.run();
  expect(remote.pushes.map(op=>op.entity)).toEqual(['plantilla']);
  expect((await local.read(owner)).pending).toEqual([]);
 });

 it('los cambios propios llegan por la réplica incremental sin perder los pendientes',async()=>{
  const local=new IndexedWorkspaceRepository(`tpl-replica-${crypto.randomUUID()}`);
  const template=baseTemplate();
  await local.mergeRemote(owner,{expedientes:[],visitas:[],plantillas:[template]},{cursor:5,partial:false,deleted:[]});
  // Edición local pendiente (nueva versión).
  const edited:ChecklistTemplate={...template,version:2,nombre:'Mi checklist v2'};
  await local.save(owner,workspaceOperation('plantilla',edited));
  // Llega un evento parcial que trae otra plantilla ajena al cambio local.
  const other=baseTemplate();
  await local.mergeRemote(owner,{expedientes:[],visitas:[],plantillas:[other]},{cursor:6,partial:true,deleted:[]});
  const state=await local.read(owner);
  expect(state.plantillas.map(t=>t.id).sort()).toEqual([template.id,other.id].sort());
  expect(state.plantillas.find(t=>t.id===template.id)?.version).toBe(2);
  expect(state.pending.map(op=>op.entity)).toEqual(['plantilla']);
  // Desactivación remota (tumba lógica, sin borrado físico).
  await local.acknowledge(owner,state.pending[0].id);
  await local.mergeRemote(owner,{expedientes:[],visitas:[],plantillas:[]},{cursor:7,partial:true,deleted:[{entity:'plantilla',id:other.id}]});
  expect((await local.read(owner)).plantillas.map(t=>t.id)).toEqual([template.id]);
 });
});
