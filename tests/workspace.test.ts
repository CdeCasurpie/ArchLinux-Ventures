import 'fake-indexeddb/auto';
import {openDB} from 'idb';
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
  it('quarantines permanent validation failures until an explicit retry',async()=>{
   const local=new IndexedWorkspaceRepository(`blocked-${crypto.randomUUID()}`),record=expediente();
   await local.save(owner,workspaceOperation('expediente',record));
   const remote=new Remote();let attempts=0;
   remote.push=async()=>{attempts++;throw {code:'22023',message:'Invalid field'}};
   const engine=new WorkspaceSyncEngine(local,remote,owner);
   await expect(engine.run()).rejects.toThrow('Invalid field');
   await expect(engine.run()).rejects.toThrow('Invalid field');
   expect(attempts).toBe(1);
   expect((await local.read(owner)).pending[0].blocked_error).toContain('Invalid field');
   await local.retryPending(owner);
   await expect(engine.run()).rejects.toThrow();expect(attempts).toBe(2);
  });
  it('aplica deltas y cursor juntos y reaplica solo respuestas locales pendientes',async()=>{
   const local=new IndexedWorkspaceRepository(`delta-${crypto.randomUUID()}`),record=expediente(),visit=buildVisita(record,1,'2026-09-17');
   await local.mergeRemote(owner,{expedientes:[record],visitas:[visit],plantillas:[]},{cursor:10,partial:false,deleted:[]});
   await local.saveAnswers(owner,visit.id,{licencia:'no'});
   await local.mergeRemote(owner,{expedientes:[],visitas:[{...visit,checklist_respuestas_json:{licencia:'si',otro:'remoto'}}],plantillas:[]},{cursor:20,partial:true,deleted:[]});
   expect(await local.read(owner)).toMatchObject({sync_cursor:20,visitas:[{checklist_respuestas_json:{licencia:'no',otro:'remoto'}}]});
   await local.saveAnswers(owner,visit.id,{licencia:'na'});
   expect((await local.read(owner)).sync_cursor).toBe(20);
   for(const op of (await local.read(owner)).pending)await local.acknowledge(owner,op.id);
   await local.mergeRemote(owner,{expedientes:[],visitas:[],plantillas:[]},{cursor:30,partial:true,deleted:[{entity:'expediente',id:record.id}]});
   expect(await local.read(owner)).toMatchObject({sync_cursor:30,expedientes:[],visitas:[]});
  });
  it('guarda parches de respuestas conservando otros campos y pendientes',async()=>{
   const name=`answers-${crypto.randomUUID()}`,record=expediente(),visit=buildVisita(record,1,'2026-09-17');
   const local=new IndexedWorkspaceRepository(name);
   await local.save(owner,workspaceOperation('visita',visit));
   await Promise.all([local.saveAnswers(owner,visit.id,{licencia:'si'}),local.saveAnswers(owner,visit.id,{otro:'texto'})]);
   const state=await new IndexedWorkspaceRepository(name).read(owner);
   expect(state.visitas[0].checklist_respuestas_json).toEqual({licencia:'si',otro:'texto'});
   expect(state.pending.slice(1).map(op=>op.answer_patch)).toEqual([{licencia:'si'},{otro:'texto'}]);
   await expect(local.saveAnswers(owner,'missing',{licencia:'no'})).rejects.toThrow();
   expect((await local.read(owner)).pending).toHaveLength(3);
  });
  it('migra v1 preservando datos, orden y copia de recuperación sin volver a importarla',async()=>{
   const name=`legacy-${crypto.randomUUID()}`,record=expediente();
   const visit=buildVisita(record,1,'2026-09-17');
   const first=workspaceOperation('expediente',record),second=workspaceOperation('visita',visit);
   first.created_at=second.created_at;
   const legacy=await openDB(name,1,{upgrade(db){db.createObjectStore('workspace')}});
   await legacy.put('workspace',{expedientes:[record],visitas:[visit],plantillas:[],pending:[first,second],last_sync:null},owner);
   legacy.close();
   const local=new IndexedWorkspaceRepository(name);
   expect((await local.read(owner)).pending.map(op=>op.id)).toEqual([first.id,second.id]);
   await local.acknowledge(owner,first.id);
   expect((await new IndexedWorkspaceRepository(name).read(owner)).pending.map(op=>op.id)).toEqual([second.id]);
   const migrated=await openDB(name,2);
   expect((await migrated.get('workspace',owner)).pending).toHaveLength(2);
   migrated.close();
  });
  it('reabre las respuestas guardadas y conserva una edición nueva frente a confirmaciones anteriores',async()=>{
   const name=`workspace-${crypto.randomUUID()}`;
   const local=new IndexedWorkspaceRepository(name);
   const visit=buildVisita(expediente(),1,'2026-09-17');
   const first=workspaceOperation('visita',{...visit,checklist_respuestas_json:{licencia:'si'}});
   await local.save(owner,first);
   await local.saveAnswers(owner,visit.id,{licencia:'no'});
   const latest=(await local.read(owner)).pending[1];
   await local.acknowledge(owner,first.id);
   await local.mergeRemote(owner,{expedientes:[],visitas:[first.record as typeof visit],plantillas:[]});
   const reopened=await new IndexedWorkspaceRepository(name).read(owner);
   expect(reopened.visitas[0].checklist_respuestas_json).toEqual({licencia:'no'});
   expect(reopened.pending.map(op=>op.id)).toEqual([latest.id]);
  });
 it('guarda expediente y outbox juntos, y sincroniza sin duplicar',async()=>{const local=new IndexedWorkspaceRepository(`workspace-${crypto.randomUUID()}`),record=expediente(),operation=workspaceOperation('expediente',record);await local.save(owner,operation);expect(await local.read(owner)).toMatchObject({expedientes:[{id:record.id}],pending:[{id:operation.id}]});const remote=new Remote(),engine=new WorkspaceSyncEngine(local,remote,owner);await Promise.all([engine.run(),engine.run()]);expect(remote.calls).toEqual([operation.id]);expect((await local.read(owner)).pending).toEqual([])});
 it('la visita conserva una copia independiente del checklist',()=>{const record=expediente(),visit=buildVisita(record,1,'2026-09-17');record.checklist_esquema_json.sections[0].fields[0].label='Modificado después';expect(visit.checklist_esquema_json.sections[0].fields[0].label).toBe('Licencia')});
  it('conserva trabajo y operaciones cuando el servidor rechaza una colisión de numeración',async()=>{
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
   await expect(new WorkspaceSyncEngine(local,remote,owner).run()).rejects.toThrow('duplicate key');
   expect(remote.calls).toEqual([op2.id]);
   expect((await local.read(owner)).pending.map(op=>op.id)).toEqual([op1.id]);
   expect((await local.read(owner)).visitas).toHaveLength(2);
 });
});
