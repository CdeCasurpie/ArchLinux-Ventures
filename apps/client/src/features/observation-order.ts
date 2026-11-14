import type {ReportDocumentV1} from '@archforms/domain';

/** El orden guardado manda; los hallazgos sin posición conservan su cronología. */
export function orderObservations<T extends {id:string;createdAt:string}>(groups:readonly T[],doc:ReportDocumentV1|null=null):T[]{
 const rank=new Map<string,number>();
 for(const block of doc?.blocks??[])if(block.type==='capture-group')rank.set(block.groupId,rank.size);
 return [...groups].sort((a,b)=>{
  const ra=rank.get(a.id),rb=rank.get(b.id);
  if(ra!==undefined&&rb!==undefined)return ra-rb;
  if(ra!==undefined)return -1;
  if(rb!==undefined)return 1;
  return Date.parse(a.createdAt)-Date.parse(b.createdAt)||a.id.localeCompare(b.id);
 });
}
