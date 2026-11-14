import {describe,expect,it} from 'vitest';
import {inflateSync} from 'node:zlib';
import {pdf} from '@react-pdf/renderer';
import {buildInformeDoc,informeFileName,stampPageNumbers} from '@archforms/report-pdf';
import {initReportDocument,setReportSigners} from '@archforms/domain';
import type {Expediente,Visita,Profile} from '@archforms/domain';

const expediente:Expediente={
 id:'exp-1',profesional_id:'owner-1',nro_expediente:'EXP-2026-001',nro_licencia:'LIC-1',
 modalidad:'A',entidad_destinataria:'Muni',fecha_emision_licencia:null,vigencia_desde:null,
 vigencia_hasta:null,propietario:'Propietario Test',ubicacion:'Av. Test 123',distrito:'Lima',
 provincia:'Lima',departamento:'Lima',tipo_obra:'Vivienda',uso_predio:'Residencial',detalle_obra:null,
 valor_obra:null,total_visitas_programadas:3,responsable_obra_nombre:'Residente',
 responsable_obra_colegiatura:'CIP 1',poliza_car_json:null,datos_cabecera_extra:null,
 checklist_nombre:'Checklist',checklist_esquema_json:{version:1,sections:[]},checklist_template_id:null,activo:true,
 created_at:'2026-09-23T00:00:00Z',updated_at:'2026-09-23T00:00:00Z',
};
const visita:Visita={
 id:'vis-1',expediente_id:'exp-1',nro_visita:2,codigo_informe:null,fecha:'2026-09-23',
 estado:'BORRADOR',checklist_nombre:'Checklist',
 checklist_esquema_json:{version:2,sections:[{id:'s',title:'Seguridad',fields:[
  {id:'epp',label:'EPP completo',type:'boolean'},
  {id:'avance_obra',label:'Avance de obra',type:'percent',required:true},
  {id:'estado',label:'Estado del elemento',type:'select',options:['Bueno','Regular','Malo']},
  {id:'altura',label:'Altura de muro levantado',type:'number',unit:'m'},
  {id:'nota',label:'Observación técnica',type:'textarea'},
 ]}]},
 checklist_respuestas_json:{epp:'si',avance_obra:40,estado:'Regular',altura:2.4,nota:'Muro con panda en esquina NE.'},checklist_completado:true,checklist_template_id:null,documento_json:{},
 estado_documento:'BORRADOR',pdf_archivo_id:null,responsable_obra_nombre:'Residente',
 responsable_obra_colegiatura:'CIP 1',created_at:'2026-09-23T00:00:00Z',updated_at:'2026-09-23T00:00:00Z',
};
const profesional:Profile={id:'owner-1',email:'a@t.test',nombre_completo:'Arq. Test',cargo:'Proyectista',nro_colegiatura:'CAP 1',updated_at:'2026-09-23T00:00:00Z'};

describe('report-pdf',()=>{
 it('nombre de archivo estable',()=>{
  expect(informeFileName(expediente,visita)).toBe('Informe-EXP-2026-001-V02.pdf');
  expect(informeFileName({...expediente,nro_expediente:'EXP 12/34'},visita)).toBe('Informe-EXP_12_34-V02.pdf');
 });

 it('mapea todos los bloques del documento',()=>{
  const doc=initReportDocument([{id:'g-1',photoIds:['p-1'],comment:'Fisura'}]);
  const el=buildInformeDoc({doc,visita,expediente,profesional,photos:{}}) as unknown as {props:{children:{props:{children:[unknown[],unknown]}}}};
  // Document -> Page -> blocks (+ footer legacy). El map es un solo hijo array.
  const kids = el.props.children.props.children as unknown[];
  const blocks = (Array.isArray(kids[0]) ? kids[0] : kids) as unknown[];
  expect(blocks.length).toBe(5);
 });

 it('renderiza a bytes sin romperse (vacío y completo)',async()=>{
  const tiny='data:image/jpeg;base64,'+btoa('x'.repeat(100));
  for(const doc of [
   initReportDocument([]),
   initReportDocument([{id:'g-1',photoIds:['p-1','p-2'],comment:'Fisura en viga'},{id:'g-2',photoIds:['p-3'],comment:''}]),
  ]){
   const blob=await pdf(buildInformeDoc({doc,visita,expediente,profesional,photos:{'p-1':tiny,'p-2':tiny,'p-3':tiny}})).toBlob();
   const bytes=new Uint8Array(await blob.arrayBuffer());
   expect(bytes.byteLength).toBeGreaterThan(1000);
  }
 },30_000);

 /** Texto del PDF (hex dentro de streams Flate) + conteo de páginas. */
 function pdfText(bytes:Uint8Array):{text:string;pages:number}{
  const raw=Buffer.from(bytes).toString('latin1');
  const out:string[]=[];
  for(const m of raw.matchAll(/stream\r?\n([\s\S]*?)endstream/g)){
   try{
    const dec=inflateSync(Buffer.from(m[1],'latin1')).toString('latin1');
    for(const hx of dec.matchAll(/<([0-9A-Fa-f]+)>/g)){
     out.push(Buffer.from(hx[1],'hex').toString('latin1'));
    }
   }catch{/* stream no comprimido: se ignora */}
  }
  return {text:out.join(''),pages:(raw.match(/\/Type\s*\/?Pages?\b/g) ?? []).filter(s=>!/Pages/.test(s)).length};
 }

  it('el pie con numeración aparece en cada página (vía stampPageNumbers)',async()=>{
  const groups=Array.from({length:10},(_,i)=>({id:`g-${i}`,photoIds:[],comment:`C${i} `.repeat(30)}));
  const doc=initReportDocument(groups);
  const blob=await pdf(buildInformeDoc({doc,visita,expediente,profesional,photos:{}})).toBlob();
  const stamped=await stampPageNumbers(
    new Uint8Array(await blob.arrayBuffer()),
    (p,t)=>`Pág. ${p}/${t} · Rev. ${doc.revision} · EXP-2026-001`,
    'ARCHFORMS',
    {useObjectStreams:false},
  );
  const {text,pages}=pdfText(stamped);
  expect(pages).toBeGreaterThanOrEqual(1);
  // 'Pág. N/M' en hex fragmentado: se busca la cola estable 'g. N/M'.
  const marks=text.match(/g\. \d+\/\d+/g) ?? [];
  expect(marks.length).toBeGreaterThanOrEqual(pages);
  expect(new Set(marks).size).toBe(marks.length);
  },30_000);

  it('incluye el total programado y los firmantes con su imagen en el PDF',async()=>{
   const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
   const doc=setReportSigners(initReportDocument([]),[{id:'ana',nombre:'Ana Supervisora',cargo:'Arquitecta',colegiatura:'CAP 123',image}]);
   const blob=await pdf(buildInformeDoc({doc,visita,expediente,profesional,photos:{}})).toBlob();
   const bytes=new Uint8Array(await blob.arrayBuffer());
   const {text}=pdfText(bytes);
   expect(text).toContain('02/3');
   expect(text).toContain('Ana Supervisora');
   expect(Buffer.from(bytes).toString('latin1')).toContain('/Subtype /Image');
  },30000);
});
