import {parseReportDocument,type Visita} from '@archforms/domain';

/** Rebase de ediciones de tarjetas independientes sobre la última copia local. */
export function mergeVisitEdit(base:Visita,edited:Visita,stored:Visita):Visita{
 const patch=Object.fromEntries(Object.entries(edited).filter(([key,value])=>key!=='checklist_respuestas_json'&&JSON.stringify(value)!==JSON.stringify(base[key as keyof Visita])));
 const before=parseReportDocument(base.documento_json),after=parseReportDocument(edited.documento_json),latest=parseReportDocument(stored.documento_json);
 if(patch.documento_json&&after&&latest){
  patch.documento_json={...latest,
   ...(JSON.stringify(before?.blocks)!==JSON.stringify(after.blocks)?{blocks:after.blocks}:{}),
   ...(JSON.stringify(before?.signers)!==JSON.stringify(after.signers)?{signers:after.signers}:{}),
   revision:Math.max(after.revision,latest.revision+1),
  };
 }
 return {...stored,...patch,checklist_respuestas_json:stored.checklist_respuestas_json};
}
