import {describe,it,expect} from 'vitest';
import {initReportDocument,parseReportDocument,setReportSigners,setTextContent,type ChecklistSchema} from '@archforms/domain';
import {buildExpediente,buildVisita} from '@archforms/application';
import {mergeVisitEdit} from '../apps/client/src/features/merge-visit-edit';
import {reportSource} from '../apps/client/src/features/report-source';

const schema:ChecklistSchema={version:2,sections:[{id:'base',title:'Base',fields:[{id:'note',type:'text',label:'Nota'}]}]};
function fixtures(){const form=new FormData();form.set('nro_expediente','E-1');form.set('ubicacion','Lima');const expediente=buildExpediente('owner',form,schema);const visita={...buildVisita(expediente,2,'2026-11-13'),documento_json:initReportDocument([]) as unknown as Record<string,unknown>};return {expediente,visita}}

describe('edición integral del informe',()=>{
 it('conserva firmantes al parsear y editar conclusiones; rechaza imágenes externas y sobredimensionadas',()=>{
  const original=initReportDocument([]);
  const signed=setReportSigners(original,[{id:'s',nombre:'Ana',cargo:'Arquitecta',colegiatura:'CAP 1',image:'data:image/png;base64,AAAA'}]);
  const parsed=parseReportDocument(JSON.parse(JSON.stringify(signed)))!;
  expect(parsed.signers?.[0].nombre).toBe('Ana');
  const conclusions=parsed.blocks.find(b=>b.type==='conclusions')!;
  expect(setTextContent(parsed,conclusions.id,'Revisado').signers).toEqual(signed.signers);
  expect(original.signers).toBeUndefined();
  expect(()=>setReportSigners(original,[{...signed.signers![0],image:'https://example.com/signature.png'}])).toThrow();
  expect(()=>setReportSigners(original,[{...signed.signers![0],image:`data:image/png;base64,${'A'.repeat(160001)}`}])).toThrow();
 });
 it('rebasa cambios independientes sin borrar respuestas, esquema ni firmantes recientes',()=>{
  const {visita}=fixtures();const doc=parseReportDocument(visita.documento_json)!;
  const stored={...visita,checklist_respuestas_json:{note:'Respuesta nueva'},checklist_nombre:'Esquema nuevo',documento_json:setReportSigners(doc,[{id:'s',nombre:'Ana',cargo:'Arq.',colegiatura:''}]) as unknown as Record<string,unknown>};
  const block=doc.blocks.find(b=>b.type==='conclusions')!;
  const edited={...visita,documento_json:setTextContent(doc,block.id,'Conclusión nueva') as unknown as Record<string,unknown>};
  const merged=mergeVisitEdit(visita,edited,stored);
  expect(merged.checklist_respuestas_json).toEqual({note:'Respuesta nueva'});
  expect(merged.checklist_nombre).toBe('Esquema nuevo');
  const mergedDoc=parseReportDocument(merged.documento_json)!;
  expect(mergedDoc.signers?.[0].nombre).toBe('Ana');
  expect(mergedDoc.blocks.find(b=>b.type==='conclusions')).toMatchObject({content:'Conclusión nueva'});
 });
 it('invalida el PDF por cabecera, planificación o respuestas, sin depender de la revisión del documento',()=>{
  const {expediente,visita}=fixtures();const doc=parseReportDocument(visita.documento_json)!;
  const before=reportSource(doc,visita,expediente,null);
  expect(reportSource(doc,{...visita,checklist_respuestas_json:{note:'Cambio'}},expediente,null)).not.toBe(before);
  expect(reportSource(doc,visita,{...expediente,total_visitas_programadas:8},null)).not.toBe(before);
  expect(reportSource(doc,visita,{...expediente,propietario:'Nuevo'},null)).not.toBe(before);
  expect(reportSource(doc,{...visita,updated_at:'otra fecha'},{...expediente,updated_at:'otra fecha'},null)).toBe(before);
 });
});
