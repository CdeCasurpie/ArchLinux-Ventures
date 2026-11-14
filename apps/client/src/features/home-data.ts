import type {Expediente,Visita} from '@archforms/domain';

export const obraTitle=(obra:Expediente)=>obra.detalle_obra?.trim()||obra.propietario?.trim()||`Expediente ${obra.nro_expediente}`;
export function recentWorks(obras:Expediente[],visitas:Visita[]){
 const latest=new Map<string,string>();
 for(const visita of visitas){
  const stamp=`${visita.fecha}:${visita.created_at}`;
  if(stamp>(latest.get(visita.expediente_id)??''))latest.set(visita.expediente_id,stamp);
 }
 return obras.filter(o=>o.activo).slice().sort((a,b)=>(latest.get(b.id)??'').localeCompare(latest.get(a.id)??'')||b.created_at.localeCompare(a.created_at)||a.id.localeCompare(b.id));
}
/** FINALIZADA cierra campo, no acredita impresión ni generación de PDF. */
export const openFieldVisits=(visitas:Visita[])=>visitas.filter(v=>!['FINALIZADA','ARCHIVADA'].includes(v.estado));
export const visitsToReview=(visitas:Visita[])=>visitas.filter(v=>v.estado!=='ARCHIVADA').slice().sort((a,b)=>b.fecha.localeCompare(a.fecha)||b.created_at.localeCompare(a.created_at));
