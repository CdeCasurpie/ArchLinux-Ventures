import {describe,expect,it} from 'vitest';
import {initReportDocument,parseReportDocument,moveReportBlock,removeReportBlock,restoreGroupBlock,addTextBlock,setBlockPhotos,setBlockComment,setTextContent,isPdfStale} from '@archforms/domain';

const groups=[{id:'g-1',photoIds:['p-1','p-2'],comment:'Fisura en viga'},{id:'g-2',photoIds:['p-3'],comment:'Humedad'}];

describe('ReportDocumentV1',()=>{
 it('inicializa fijos + un bloque por grupo',()=>{
  const doc=initReportDocument(groups);
  expect(doc.schemaVersion).toBe(1);expect(doc.revision).toBe(1);
  expect(doc.blocks.map(b=>b.type)).toEqual(['header','checklist','capture-group','capture-group','conclusions','signatures']);
 });

 it('valida y rechaza documentos corruptos',()=>{
  const doc=initReportDocument(groups);
  expect(parseReportDocument(JSON.parse(JSON.stringify(doc)))?.revision).toBe(1);
  expect(parseReportDocument(null)).toBeNull();
  expect(parseReportDocument({schemaVersion:2,revision:1,blocks:[]})).toBeNull();
  expect(parseReportDocument({schemaVersion:1,revision:1,blocks:[{id:'x',type:'raro'}]})).toBeNull();
  expect(parseReportDocument({schemaVersion:1,revision:1,blocks:[]})).toBeNull();
 });

 it('mueve solo bloques no-locked y respeta bordes',()=>{
  const doc=initReportDocument(groups);
  const g1=doc.blocks[2].id,g2=doc.blocks[3].id,head=doc.blocks[0].id;
  const moved=moveReportBlock(doc,g1,1);
  expect(moved.blocks.map(b=>b.id)).toEqual([doc.blocks[0].id,doc.blocks[1].id,g2,g1,doc.blocks[4].id,doc.blocks[5].id]);
  expect(moved.revision).toBe(2);
  expect(moveReportBlock(doc,head,1)).toBe(doc);
  expect(moveReportBlock(doc,g1,-1)).toBe(doc);
 });

 it('elimina no-locked, nunca fijos; restaura grupos',()=>{
  const doc=initReportDocument(groups);
  expect(removeReportBlock(doc,doc.blocks[0].id)).toBe(doc);
  const cut=removeReportBlock(doc,doc.blocks[2].id);
  expect(cut.blocks).toHaveLength(5);
  const back=restoreGroupBlock(cut,'g-1',['p-1','p-2'],'Fisura en viga');
  expect(back.blocks.filter(b=>b.type==='capture-group')).toHaveLength(2);
  expect(restoreGroupBlock(back,'g-1',['p-1'],'x')).toBe(back);
 });

 it('edita fotos, comentarios y textos sumando revisión',()=>{
  const doc=initReportDocument(groups);
  const g1=doc.blocks[2].id;
  const edited=setBlockPhotos(setBlockComment(doc,g1,'Nuevo texto'),g1,['p-2']);
  const g=edited.blocks.find(b=>b.id===g1);
  expect(g).toMatchObject({comment:'Nuevo texto',photoIds:['p-2']});
  expect(edited.revision).toBe(doc.revision+2);
  const conc=edited.blocks.find(b=>b.type==='conclusions')!;
  expect(setTextContent(edited,conc.id,'Cierre').blocks.find(b=>b.id===conc.id)).toMatchObject({content:'Cierre'});
 });

 it('añade texto y detecta PDF desactualizado',()=>{
  const doc=initReportDocument(groups);
  const withText=addTextBlock(doc);
  expect(withText.blocks.some(b=>b.type==='text')).toBe(true);
  expect(isPdfStale(withText,'BORRADOR')).toBe(false);
  const gen={...withText,generatedRevision:withText.revision};
  expect(isPdfStale(gen,'GENERADO')).toBe(false);
  expect(isPdfStale(addTextBlock(gen),'GENERADO')).toBe(true);
 });
});
