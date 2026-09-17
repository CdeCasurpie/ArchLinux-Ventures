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
 it('guarda expediente y outbox juntos, y sincroniza sin duplicar',async()=>{const local=new IndexedWorkspaceRepository(`workspace-${crypto.randomUUID()}`),record=expediente(),operation=workspaceOperation('expediente',record);await local.save(owner,operation);expect(await local.read(owner)).toMatchObject({expedientes:[{id:record.id}],pending:[{id:operation.id}]});const remote=new Remote(),engine=new WorkspaceSyncEngine(local,remote,owner);await Promise.all([engine.run(),engine.run()]);expect(remote.calls).toEqual([operation.id]);expect((await local.read(owner)).pending).toEqual([])});
 it('la visita conserva una copia independiente del checklist',()=>{const record=expediente(),visit=buildVisita(record,1,'2026-09-17');record.checklist_esquema_json.sections[0].fields[0].label='Modificado después';expect(visit.checklist_esquema_json.sections[0].fields[0].label).toBe('Licencia')});
});
