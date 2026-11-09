import 'fake-indexeddb/auto';
import {describe,expect,it} from 'vitest';
import {IndexedWorkspaceRepository} from '@archforms/data-local';
import {buildExpediente,buildVisita,workspaceOperation,WorkspaceSyncEngine,type WorkspaceRemoteRepository} from '@archforms/application';
import type {ChecklistSchema,WorkspacePending,WorkspaceState} from '@archforms/domain';

const owner='00000000-0000-0000-0000-000000000001';
const schema:ChecklistSchema={version:1,sections:[{id:'base',title:'Base',fields:[{id:'licencia',label:'Licencia',type:'boolean'}]}]};
function expediente(){const data=new FormData();data.set('nro_expediente','EXP-1');data.set('ubicacion','Lima');data.set('checklist_nombre','Base');return buildExpediente(owner,data,schema)}
class Remote implements WorkspaceRemoteRepository{
 state:Pick<WorkspaceState,'expedientes'|'visitas'|'plantillas'>={expedientes:[],visitas:[],plantillas:[]};calls:string[]=[];
 async fetchAll(){return this.state}
 async push(operation:WorkspacePending){this.calls.push(operation.id);if(operation.entity==='expediente')this.state.expedientes=[operation.record as never];else this.state.visitas=[operation.record as never]}
}
describe('workspace offline',()=>{
  it('reabre las respuestas guardadas y conserva una edición nueva frente a confirmaciones anteriores',async()=>{
   const name=`workspace-${crypto.randomUUID()}`;
   const local=new IndexedWorkspaceRepository(name);
   const visit=buildVisita(expediente(),1,'2026-09-17');
   const first=workspaceOperation('visita',{...visit,checklist_respuestas_json:{licencia:'si'}});
   const latest=workspaceOperation('visita',{...visit,checklist_respuestas_json:{licencia:'no'}});
   await local.save(owner,first);
   await local.save(owner,latest);
   await local.acknowledge(owner,first.id);
   await local.mergeRemote(owner,{expedientes:[],visitas:[first.record as typeof visit],plantillas:[]});
   const reopened=await new IndexedWorkspaceRepository(name).read(owner);
   expect(reopened.visitas[0].checklist_respuestas_json).toEqual({licencia:'no'});
   expect(reopened.pending.map(op=>op.id)).toEqual([latest.id]);
  });
 it('guarda expediente y outbox juntos, y sincroniza sin duplicar',async()=>{const local=new IndexedWorkspaceRepository(`workspace-${crypto.randomUUID()}`),record=expediente(),operation=workspaceOperation('expediente',record);await local.save(owner,operation);expect(await local.read(owner)).toMatchObject({expedientes:[{id:record.id}],pending:[{id:operation.id}]});const remote=new Remote(),engine=new WorkspaceSyncEngine(local,remote,owner);await Promise.all([engine.run(),engine.run()]);expect(remote.calls).toEqual([operation.id]);expect((await local.read(owner)).pending).toEqual([])});
 it('la visita conserva una copia independiente del checklist',()=>{const record=expediente(),visit=buildVisita(record,1,'2026-09-17');record.checklist_esquema_json.sections[0].fields[0].label='Modificado después';expect(visit.checklist_esquema_json.sections[0].fields[0].label).toBe('Licencia')});
 it('descarta la operacion duplicada sin bloquear el resto de la cola',async()=>{
  const local=new IndexedWorkspaceRepository(`workspace-${crypto.randomUUID()}`),record=expediente();
  // Doble tap: dos visitas con el mismo nro_visita pero distinto id.
  const v1=buildVisita(record,18,'2026-10-10'),v2=buildVisita(record,18,'2026-10-10');
  const op1=workspaceOperation('visita',v1),op2=workspaceOperation('visita',v2);
  await local.save(owner,op1);await local.save(owner,op2);
  const remote=new Remote(),realPush=remote.push.bind(remote);
  remote.push=async(op:WorkspacePending)=>{
   if(op.id===op1.id)throw new Error('duplicate key value violates unique constraint "visita_expediente_id_nro_visita"');
   return realPush(op);
  };
  await new WorkspaceSyncEngine(local,remote,owner).run();
  expect(remote.calls).toEqual([op2.id]);
  expect((await local.read(owner)).pending).toEqual([]);
 });
});
