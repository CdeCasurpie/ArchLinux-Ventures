import {initReportDocument,parseReportDocument,type Visita} from '@archforms/domain';
import {loadCaptureGroups} from './lab-storage';

/** Crear conclusiones o firmantes no debe dejar fuera los hallazgos ya capturados. */
export async function visitDocument(visita:Visita){
 const existing=parseReportDocument(visita.documento_json);if(existing)return existing;
 const groups=await loadCaptureGroups(visita.id);
 groups.sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime());
 return initReportDocument(groups.map(group=>({id:group.id,photoIds:group.photos.map(photo=>photo.id),comment:group.transcripcion??''})));
}
