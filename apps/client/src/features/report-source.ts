import type {Expediente,Profile,ReportDocumentV1,Visita} from '@archforms/domain';

/** Incluye todas las fuentes del PDF, no solo la revisión del árbol de bloques. */
export function reportSource(doc:ReportDocumentV1|null,visita:Visita,expediente:Expediente,profile:Profile|null,photos:{id:string;checksum:string}[]=[]):string{
 const {updated_at:_updated,...caseValues}=expediente;
  const selected=new Set(doc?.blocks.flatMap(block=>block.type==='capture-group'?block.photoIds:[])??[]);
  return JSON.stringify({doc,fotos:photos.filter(photo=>selected.has(photo.id)).map(photo=>({id:photo.id,checksum:photo.checksum})).sort((a,b)=>a.id.localeCompare(b.id)),expediente:caseValues,profesional:profile&&{nombre_completo:profile.nombre_completo,cargo:profile.cargo,nro_colegiatura:profile.nro_colegiatura},visita:{nro_visita:visita.nro_visita,fecha:visita.fecha,responsable_obra_nombre:visita.responsable_obra_nombre,responsable_obra_colegiatura:visita.responsable_obra_colegiatura,checklist_nombre:visita.checklist_nombre,checklist_esquema_json:visita.checklist_esquema_json,checklist_respuestas_json:visita.checklist_respuestas_json}});
}
