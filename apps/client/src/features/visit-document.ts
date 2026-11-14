import {initReportDocument,parseReportDocument,type Visita} from '@archforms/domain';
import {loadCaptureGroups} from './lab-storage';
import {orderObservations} from './observation-order';

/** Crear conclusiones o firmantes no debe dejar fuera los hallazgos ya capturados. */
export async function visitDocument(visita:Visita){
 const existing=parseReportDocument(visita.documento_json);if(existing)return existing;
 const groups=await loadCaptureGroups(visita.id);
 return initReportDocument(orderObservations(groups).map(group=>({id:group.id,photoIds:group.photos.map(photo=>photo.id),comment:group.transcripcion??''})));
}
