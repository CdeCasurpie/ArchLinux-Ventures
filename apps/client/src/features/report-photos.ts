import type { ReportDocumentV1 } from '@archforms/domain';

/** Resolve only referenced photos; never silently omit an unavailable image. */
export async function loadReportPhotos(
  document: ReportDocumentV1,
  groups: {photos:{id:string;path:string;mimeType:string}[]}[],
  read:(path:string,mime:string)=>Promise<string>,
):Promise<Record<string,string>>{
  const referenced=new Set(document.blocks.flatMap(block=>block.type==='capture-group'?block.photoIds:[]));
  const available=new Map(groups.flatMap(group=>group.photos).map(photo=>[photo.id,photo]));
  const result:Record<string,string>={};
  for(const id of referenced){
    const photo=available.get(id);
    if(!photo)throw new Error(`Falta descargar una fotografía del informe (${id}). Conecta y descarga la visita antes de generar el PDF.`);
    try{result[id]=await read(photo.path,photo.mimeType)}
    catch{throw new Error(`No se pudo leer la fotografía ${id}. Descarga la visita de nuevo antes de generar el PDF.`)}
  }
  return result;
}
