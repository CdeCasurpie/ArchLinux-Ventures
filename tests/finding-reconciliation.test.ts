import {describe,expect,it,vi} from 'vitest';
import {initReportDocument,parseReportDocument,removeReportBlock,setBlockComment,setTextContent} from '@archforms/domain';
vi.mock('../apps/client/src/features/lab-storage',()=>({loadCaptureGroups:vi.fn()}));
import {reconcileFindings} from '../apps/client/src/features/visit-document';
import {mergeVisitEdit} from '../apps/client/src/features/merge-visit-edit';
import {buildExpediente,buildVisita} from '@archforms/application';

const group=(id:string)=>({id,createdAt:'2026-11-14T12:00:00Z',photos:[{id:`photo-${id}`}],transcripcion:`Hallazgo ${id}`});
describe('hallazgos posteriores al informe',()=>{
  it('incorpora la transcripción que termina después de crear y guardar el informe',()=>{
   const pending={...group('1'),transcripcion:undefined};
   const initial=reconcileFindings(null,[pending]);
   const next=reconcileFindings(parseReportDocument(initial),[group('1')]);
   expect(next.blocks.find(b=>b.type==='capture-group')).toMatchObject({comment:'Hallazgo 1'});
   expect(next.revision).toBeGreaterThan(initial.revision);
   expect(reconcileFindings(next,[group('1')])).toBe(next);
  });
  it('preserva correcciones y borrados manuales al llegar una transcripción',()=>{
   const initial=reconcileFindings(null,[{...group('1'),transcripcion:undefined}]);
   const id=initial.blocks.find(b=>b.type==='capture-group')!.id;
   for(const comment of ['Comentario corregido','']){
    const edited=setBlockComment(initial,id,comment);
    const saved=parseReportDocument(edited)!;
    const next=reconcileFindings(saved,[group('1')]);
    expect(next.blocks.find(b=>b.id===id)).toMatchObject({comment,commentEdited:true});
    expect(next).toBe(saved);
   }
  });
 it('añade nuevos hallazgos antes de conclusiones sin perder texto, orden ni firmas',()=>{
  let doc=reconcileFindings(initReportDocument([]),[group('1')]);
  doc=setTextContent(doc,doc.blocks.find(b=>b.type==='conclusions')!.id,'Conclusiones editadas');
  doc={...doc,signers:[{id:'self',nombre:'Ana',cargo:'Supervisora',colegiatura:'CAP 123'}]};
  const next=reconcileFindings(parseReportDocument(doc),[group('1'),group('2')]);
  expect(next.blocks.map(b=>b.type)).toEqual(['header','checklist','capture-group','capture-group','conclusions','signatures']);
  expect(next.blocks.find(b=>b.type==='conclusions')).toMatchObject({content:'Conclusiones editadas'});
  expect(next.signers).toEqual(doc.signers);expect(reconcileFindings(next,[group('1'),group('2')])).toBe(next);
 });
 it('respeta hallazgos retirados a propósito y añade solo los nuevos',()=>{
  const initial=reconcileFindings(null,[group('1')]);
  const removed=removeReportBlock(initial,initial.blocks.find(b=>b.type==='capture-group')!.id);
  const next=reconcileFindings(parseReportDocument(removed),[group('1'),group('2')]);
  expect(next.blocks.filter(b=>b.type==='capture-group').map(b=>b.groupId)).toEqual(['2']);
 });
 it('conserva el registro de capturas al combinar el autoguardado con otras ediciones de la visita',()=>{
  const form=new FormData();form.set('nro_expediente','TEST');form.set('ubicacion','Lima');
  const visit=buildVisita(buildExpediente('owner',form,{version:2,sections:[{id:'s',title:'Base',fields:[]}]}),1,'2026-11-14');
  const before=reconcileFindings(null,[group('1')]);visit.documento_json=before as unknown as Record<string,unknown>;
  const after=reconcileFindings(before,[group('1'),group('2')]);
  const merged=mergeVisitEdit(visit,{...visit,documento_json:after as unknown as Record<string,unknown>},{...visit,estado:'FINALIZADA'});
  expect(parseReportDocument(merged.documento_json)?.knownCaptureGroups).toEqual(['1','2']);expect(merged.estado).toBe('FINALIZADA');
 });
});
