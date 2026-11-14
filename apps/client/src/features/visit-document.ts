import {initReportDocument,parseReportDocument,restoreGroupBlock,type Visita,type ReportDocumentV1} from '@archforms/domain';
import {loadCaptureGroups} from './lab-storage';
import {orderObservations} from './observation-order';

/** Crear conclusiones o firmantes no debe dejar fuera los hallazgos ya capturados. */
export async function visitDocument(visita:Visita){
 const groups=await loadCaptureGroups(visita.id);
 return reconcileFindings(parseReportDocument(visita.documento_json),groups);
}

export function reconcileFindings(existing:ReportDocumentV1|null,groups:{id:string;photos:{id:string}[];transcripcion?:string;createdAt:string}[]):ReportDocumentV1{
 const sorted=orderObservations(groups);
 if(!existing){const doc=initReportDocument(sorted.map(group=>({id:group.id,photoIds:group.photos.map(photo=>photo.id),comment:group.transcripcion??''})));return {...doc,knownCaptureGroups:sorted.map(g=>g.id)}}
 const known=new Set(existing.knownCaptureGroups??existing.blocks.flatMap(b=>b.type==='capture-group'?[b.groupId]:[]));
  let next=existing;
  // La transcripción puede terminar después de crear el documento. Completar
  // solo comentarios pendientes; incluso un borrado manual debe conservarse.
  const byId=new Map(sorted.map(group=>[group.id,group]));
  const blocks=existing.blocks.map(block=>{
   if(block.type!=='capture-group'||block.comment||block.commentEdited)return block;
   const text=byId.get(block.groupId)?.transcripcion;
   return text?{...block,comment:text}:block;
  });
  if(blocks.some((block,index)=>block!==existing.blocks[index]))next={...existing,revision:existing.revision+1,blocks};
 for(const group of sorted)if(!known.has(group.id))next=restoreGroupBlock(next,group.id,group.photos.map(p=>p.id),group.transcripcion??'');
 const ids=[...new Set([...known,...sorted.map(g=>g.id)])];
 return JSON.stringify(ids)===JSON.stringify(existing.knownCaptureGroups)?next:{...next,revision:next===existing?next.revision+1:next.revision,knownCaptureGroups:ids};
}
