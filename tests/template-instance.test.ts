import 'fake-indexeddb/auto';
import {describe,expect,it} from 'vitest';
import {IndexedWorkspaceRepository} from '@archforms/data-local';
import {buildExpediente,buildTemplateFromExpediente,buildVisita,workspaceOperation} from '@archforms/application';
import {withAvanceObra,type ChecklistSchema,type ChecklistTemplate} from '@archforms/domain';

const owner='00000000-0000-0000-0000-000000000001';
const baseSchema=():ChecklistSchema=>({version:2,sections:[{id:'s',title:'General',fields:[{id:'estado',label:'Estado original',type:'text'}]}]});
function expediente(nro:string,templateId:string|null=null){
 const data=new FormData();
 data.set('nro_expediente',nro);data.set('ubicacion','Lima');data.set('checklist_nombre','Checklist del expediente');
 return buildExpediente(owner,data,baseSchema(),undefined,templateId);
}
function template(id=crypto.randomUUID()):ChecklistTemplate{
 return {id,codigo:`USR-${id.slice(0,8).toUpperCase()}`,nombre:'Plantilla original',version:1,esquema:withAvanceObra(baseSchema()),profesional_id:owner,activa:true};
}

describe('plantillas inmutables e instancias del expediente',()=>{
 it('publicar una instancia crea una plantilla nueva y no comparte el objeto del expediente',()=>{
  const record=expediente('EXP-1','tpl-origen'),published=buildTemplateFromExpediente(owner,record,'Checklist publicado');
  expect(published.id).not.toBe('tpl-origen');
  expect(published.codigo).toMatch(/^USR-/);
  expect(published).toMatchObject({nombre:'Checklist publicado',version:1,profesional_id:owner,activa:true});
  expect(published.esquema).toEqual(record.checklist_esquema_json);
  record.checklist_esquema_json.sections[0].fields[0].label='Cambiado después';
  expect(published.esquema.sections[0].fields[0].label).toBe('Estado original');
 });

 it('editar la copia de un expediente no cambia la plantilla ni otro expediente',async()=>{
  const local=new IndexedWorkspaceRepository(`instance-${crypto.randomUUID()}`),source=template(),a=expediente('EXP-A',source.id),b=expediente('EXP-B',source.id);
  await local.save(owner,workspaceOperation('plantilla',source));
  await local.save(owner,workspaceOperation('expediente',a));
  await local.save(owner,workspaceOperation('expediente',b));
  const edited={...a,checklist_nombre:'Checklist propio',checklist_esquema_json:withAvanceObra({version:2 as const,sections:[{id:'s',title:'General',fields:[{id:'estado',label:'Solo expediente A',type:'text' as const}]}]})};
  await local.save(owner,workspaceOperation('expediente',edited));
  const state=await local.read(owner);
  expect(state.plantillas[0].nombre).toBe('Plantilla original');
  expect(state.plantillas[0].esquema.sections[0].fields[0].label).toBe('Estado original');
  expect(state.expedientes.find(item=>item.id===a.id)?.checklist_esquema_json.sections[0].fields[0].label).toBe('Solo expediente A');
  expect(state.expedientes.find(item=>item.id===b.id)?.checklist_esquema_json.sections[0].fields[0].label).toBe('Estado original');
 });

 it('la visita copia la instancia del expediente y conserva su copia aunque el expediente cambie después',()=>{
  const source=template(),record=expediente('EXP-C',source.id);
  const visit=buildVisita(record,1,'2026-11-13');
  expect(visit.checklist_esquema_json.sections[0].fields[0].label).toBe('Estado original');
  record.checklist_esquema_json.sections[0].fields[0].label='Instancia editada después';
  expect(visit.checklist_esquema_json.sections[0].fields[0].label).toBe('Estado original');
  expect(visit.checklist_template_id).toBe(source.id);
 });

 it('la publicación y la selección en otro expediente quedan en la cola en orden, sin migración',async()=>{
  const local=new IndexedWorkspaceRepository(`publish-${crypto.randomUUID()}`),record=expediente('EXP-D','tpl-origen');
  const published=buildTemplateFromExpediente(owner,record,'Plantilla publicada');
  const other={...expediente('EXP-E',published.id),checklist_nombre:published.nombre,checklist_esquema_json:published.esquema};
  await local.save(owner,workspaceOperation('plantilla',published));
  await local.save(owner,workspaceOperation('expediente',other));
  const state=await local.read(owner);
  expect(state.pending.map(op=>op.entity)).toEqual(['plantilla','expediente']);
  expect(state.pending[0].workspace_mutation?.type).toBe('create');
  expect(state.pending[1].workspace_mutation?.type).toBe('create');
  expect(state.expedientes.find(item=>item.id===other.id)?.checklist_template_id).toBe(published.id);
 });
});
