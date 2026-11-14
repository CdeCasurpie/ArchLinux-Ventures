import {describe,expect,it} from 'vitest';
import {initReportDocument,moveReportBlock} from '@archforms/domain';
import {orderObservations} from '../apps/client/src/features/observation-order';

const early={id:'early',createdAt:'2026-11-13T08:00:00Z'};
const late={id:'late',createdAt:'2026-11-13T09:00:00Z'};
describe('Orden de observaciones',()=>{
 it('inicia cronológico independientemente del orden de carga, sin mutar la captura',()=>{
  const loaded=[late,early];
  expect(orderObservations(loaded)).toEqual([early,late]);
  expect(loaded).toEqual([late,early]);
 });
 it('respeta el orden persistido por el usuario incluso tras añadir otra captura',()=>{
  const doc=initReportDocument([early,late].map(g=>({id:g.id,photoIds:[],comment:''})));
  const moved=moveReportBlock(doc,doc.blocks[2].id,1);
  const restored=JSON.parse(JSON.stringify(moved));
  const latest={id:'latest',createdAt:'2026-11-13T10:00:00Z'};
  expect(orderObservations([latest,early,late],restored)).toEqual([late,early,latest]);
 });
});
