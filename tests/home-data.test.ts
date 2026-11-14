import {describe,expect,it} from 'vitest';
import type {Expediente,Visita} from '@archforms/domain';
import {obraTitle,openFieldVisits,recentWorks,visitsToReview} from '../apps/client/src/features/home-data';
const obra=(id:string,activo=true)=>({id,activo,detalle_obra:`Obra ${id}`,nro_expediente:id,created_at:`2026-11-${id.padStart(2,'0')}`} as Expediente);
const visita=(id:string,expediente_id:string,fecha:string,estado:Visita['estado']='BORRADOR')=>({id,expediente_id,fecha,created_at:`${fecha}T12:00:00Z`,estado} as Visita);
describe('navegación de inicio',()=>{
 it('ordena por la última visita de cada obra, sin duplicarlas y dejando las no visitadas al final',()=>{
  const obras=[obra('1'),obra('2'),obra('3'),obra('4',false)];
  const visitas=[visita('a','1','2026-11-14'),visita('b','1','2026-11-10'),visita('c','2','2026-11-13'),visita('d','4','2026-11-15')];
  expect(recentWorks(obras,visitas).map(o=>o.id)).toEqual(['1','2','3']);
  expect(obras.map(o=>o.id)).toEqual(['1','2','3','4']);
 });
 it('no confunde campo terminado con PDF generado y permite revisar informes concluidos',()=>{
  const visitas=[visita('a','1','2026-11-10'),visita('b','1','2026-11-12','FINALIZADA'),visita('c','1','2026-11-14','ARCHIVADA')];
  expect(openFieldVisits(visitas).map(v=>v.id)).toEqual(['a']);
  expect(visitsToReview(visitas).map(v=>v.id)).toEqual(['b','a']);
 });
 it('resuelve títulos con compatibilidad para expedientes existentes',()=>{
  expect(obraTitle(obra('1'))).toBe('Obra 1');
  expect(obraTitle({...obra('1'),detalle_obra:'',propietario:'Ana'})).toBe('Ana');
  expect(obraTitle({...obra('1'),detalle_obra:'',propietario:null})).toBe('Expediente 1');
 });
});
