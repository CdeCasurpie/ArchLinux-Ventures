import {useState} from 'react';
import type {ReportSigner} from '@archforms/domain';

/** Normaliza las imágenes antes de incluirlas en el documento sincronizable. */
async function signatureImage(file:File):Promise<string>{
 if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Selecciona una imagen PNG, JPEG o WebP');
 if(file.size>12*1024*1024)throw new Error('La imagen supera los 12 MB');
 const url=URL.createObjectURL(file);
 try{
  const image=new Image();image.src=url;await image.decode();
  const scale=Math.min(1,640/image.width,240/image.height);
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
  const context=canvas.getContext('2d');if(!context)throw new Error('No se pudo preparar la imagen');
  context.fillStyle='white';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
  const result=canvas.toDataURL('image/jpeg',.8);
  if(result.length>160000)throw new Error('La firma es demasiado grande; recorta la imagen e inténtalo de nuevo');
  return result;
 }finally{URL.revokeObjectURL(url)}
}

export function SignersEditor({signers,onChange}:{signers:ReportSigner[];onChange:(signers:ReportSigner[])=>void}){
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const update=(id:string,patch:Partial<ReportSigner>)=>onChange(signers.map(s=>s.id===id?{...s,...patch}:s));
 const upload=async(id:string,input:HTMLInputElement)=>{
  const file=input.files?.[0];input.value='';if(!file)return;
  setBusy(true);setError('');
  try{update(id,{image:await signatureImage(file)})}catch(error){setError(error instanceof Error?error.message:String(error))}finally{setBusy(false)}
 };
 return <section className="signers-editor"><p>Firma manuscrita opcional: adjunta una fotografía o imagen escaneada, o deja el espacio vacío para firmar en papel. No constituye una firma digital certificada.</p>
  {error&&<p role="alert" className="alert error">{error}</p>}
  {signers.map(s=><fieldset key={s.id} disabled={busy} className="signer-card"><legend>{s.nombre||'Nuevo firmante'}</legend><div className="form-grid">
   <label>Nombre completo<input className="field" value={s.nombre} onChange={e=>update(s.id,{nombre:e.target.value})}/></label>
   <label>Cargo<input className="field" value={s.cargo} onChange={e=>update(s.id,{cargo:e.target.value})}/></label>
   <label>Colegiatura / identificación<input className="field" value={s.colegiatura} onChange={e=>update(s.id,{colegiatura:e.target.value})}/></label>
   </div><div className="signature-preview"><div className="signature-paper"><div className="signature-space">{s.image?<img src={s.image} alt={`Firma de ${s.nombre||'firmante'}`}/>:null}</div><div className="signature-line">{s.nombre||'Firma'}</div></div></div>
   {!s.image&&<p>Espacio en blanco para firmar en papel.</p>}
   <label className="signature-upload">Adjuntar imagen de firma<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>void upload(s.id,e.currentTarget)}/></label>
   <label className="signature-upload">Tomar foto de la firma<input type="file" accept="image/*" capture="environment" onChange={e=>void upload(s.id,e.currentTarget)}/></label>
   <button type="button" className="btn btn-secondary" disabled={!s.image} onClick={()=>update(s.id,{image:undefined})}>Dejar en blanco para firmar en papel</button>
   <button type="button" className="btn btn-danger" onClick={()=>onChange(signers.filter(item=>item.id!==s.id))}>Quitar firmante</button></fieldset>)}
  <button className="btn btn-secondary" disabled={busy||signers.length>=6} onClick={()=>onChange([...signers,{id:crypto.randomUUID(),nombre:'',cargo:'',colegiatura:''}])}>{busy?'Preparando imagen…':'＋ Añadir firmante'}</button>
 </section>;
}
