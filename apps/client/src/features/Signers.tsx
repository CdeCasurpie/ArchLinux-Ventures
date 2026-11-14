import {useContext,useState} from 'react';
import type {ReportSigner} from '@archforms/domain';
import {SignatureCamera} from './SignatureCamera';
import {ProfileSignerContext} from './profile-signer';

function SignatureIcon({kind}:{kind:'person'|'camera'|'upload'|'trash'|'pen'}){
 return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  {kind==='person'&&<><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></>}
  {kind==='camera'&&<><path d="M8 5 6 8H3v12h18V8h-3l-2-3Z"/><circle cx="12" cy="13" r="3.5"/></>}
  {kind==='upload'&&<><path d="M12 16V3m-4 4 4-4 4 4M4 15v6h16v-6"/></>}
  {kind==='trash'&&<><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/></>}
  {kind==='pen'&&<><path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14Z"/><path d="M13 21h8"/></>}
 </svg>;
}

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

export function SignersEditor({signers,onChange,self,profileMode=false}:{signers:ReportSigner[];onChange:(signers:ReportSigner[])=>void;self?:ReportSigner;profileMode?:boolean}){
 const profileSigner=useContext(ProfileSignerContext);self=self??profileSigner;
 const [cameraId,setCameraId]=useState<string|null>(null);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [imageMode,setImageMode]=useState<Record<string,boolean>>({});
 const update=(id:string,patch:Partial<ReportSigner>)=>onChange(signers.map(s=>s.id===id?{...s,...patch}:s));
 const upload=async(id:string,input:HTMLInputElement)=>{
  const file=input.files?.[0];input.value='';if(!file)return;
  setBusy(true);setError('');
  try{update(id,{image:await signatureImage(file)})}catch(error){setError(error instanceof Error?error.message:String(error))}finally{setBusy(false)}
 };
   return <section className="signers-editor">
    {cameraId&&<SignatureCamera onClose={()=>setCameraId(null)} onUse={async file=>{update(cameraId,{image:await signatureImage(file)})}}/>}
    {!profileMode&&<div className="signers-intro"><p>Las personas que suscriben este informe.</p><span>{signers.length} de 6 firmantes</span></div>}
     {self&&!profileMode&&<button type="button" className="signer-self-add" disabled={busy||signers.length>=6||signers.some(s=>s.id===self.id)} onClick={()=>onChange([...signers,structuredClone(self)])}><span className="signer-self-icon"><SignatureIcon kind="person"/></span><span>Añadirme como firmante</span><span className="signer-self-plus" aria-hidden="true">＋</span></button>}
   {error&&<p role="alert" className="alert error">{error}</p>}
   {!signers.length&&<div className="signers-empty"><span className="signers-empty-icon"><SignatureIcon kind="person"/></span><div><strong>¿Quiénes firman el informe?</strong><p>Añade sus datos y elige cómo aparecerá cada firma.</p></div></div>}
   {signers.map((s,index)=>{
    const withImage=Boolean(s.image)||Boolean(imageMode[s.id]);
    return <fieldset key={s.id} disabled={busy} className="signer-card" aria-label={`Firmante ${index+1}`}>
      <div className="signer-card-heading"><span className="signer-avatar" aria-hidden="true">{s.nombre.trim()?s.nombre.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase():<SignatureIcon kind="person"/>}</span><div><span className="signer-number">{profileMode?'MI FIRMA':`FIRMANTE ${String(index+1).padStart(2,'0')}`}</span><strong>{s.nombre||(profileMode?'Tu identidad profesional':'Nuevo firmante')}</strong></div>{!profileMode&&<button type="button" className="signer-remove" aria-label={`Quitar firmante ${index+1}`} title="Quitar firmante" onClick={()=>onChange(signers.filter(item=>item.id!==s.id))}><SignatureIcon kind="trash"/></button>}</div>
     <div className="signer-card-body">
      <div className="signer-fields"><label className="signer-name">Nombre completo<input className="field" placeholder="Ej. Ana García" autoComplete="name" value={s.nombre} onChange={e=>update(s.id,{nombre:e.target.value})}/></label>
       <label>Cargo<input className="field" placeholder="Ej. Arquitecta supervisora" value={s.cargo} onChange={e=>update(s.id,{cargo:e.target.value})}/></label>
       <label>Colegiatura / identificación<input className="field" placeholder="Ej. CAP 12345" value={s.colegiatura} onChange={e=>update(s.id,{colegiatura:e.target.value})}/></label>
      </div>
      <div className="signer-signature"><div className="signature-options" role="group" aria-label={`Tipo de firma de ${s.nombre||`firmante ${index+1}`}`}>
       <button type="button" aria-pressed={!withImage} aria-label="Dejar en blanco para firmar en papel" onClick={()=>{setImageMode(current=>({...current,[s.id]:false}));if(s.image)update(s.id,{image:undefined})}}><SignatureIcon kind="pen"/>En papel</button>
       <button type="button" aria-pressed={withImage} onClick={()=>setImageMode(current=>({...current,[s.id]:true}))}><SignatureIcon kind="upload"/>Con imagen</button>
      </div>
      <div className="signature-preview"><div className="signature-paper"><div className="signature-space">{s.image?<img src={s.image} alt={`Firma de ${s.nombre||'firmante'}`}/>:<span>{withImage?'Tu imagen aparecerá aquí':'Espacio para firma manuscrita'}</span>}</div><div className="signature-line">{s.nombre||'Nombre del firmante'}</div><small>{s.cargo||'Firma'}</small></div></div>
       {withImage?<div className="signature-image-actions"><label className="signature-upload"><SignatureIcon kind="upload"/><span>Adjuntar imagen</span><input className="visually-hidden" aria-label="Adjuntar imagen de firma" type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>void upload(s.id,e.currentTarget)}/></label><button type="button" className="signature-upload" onClick={()=>setCameraId(s.id)}><SignatureIcon kind="camera"/><span>Tomar foto</span></button></div>:<p className="signature-hint">El PDF deja este espacio libre para firmar después de imprimir.</p>}
      </div>
     </div>
    </fieldset>;
   })}
    {!profileMode&&<button type="button" className="signer-add" disabled={busy||signers.length>=6} onClick={()=>onChange([...signers,{id:crypto.randomUUID(),nombre:'',cargo:'',colegiatura:''}])}><span aria-hidden="true">＋</span>{busy?'Preparando imagen…':'Añadir firmante'}</button>}
   <p className="signers-footnote">Firma manuscrita opcional · Las imágenes de firma no constituyen una firma digital certificada.</p>
  </section>;
}
