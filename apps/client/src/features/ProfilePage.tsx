import {useState,type FormEvent} from 'react';
import type {Session} from '@supabase/supabase-js';
import type {LocalState,ReportSigner} from '@archforms/domain';
import {saveProfile} from '@archforms/application';
import {local,supabase} from '../platform';
import {SignersEditor} from './Signers';

export function ProfilePage({owner,session,state,onRefresh,onToast}:{owner:string;session:Session;state:LocalState;onRefresh:()=>Promise<void>;onToast:(text:string)=>void}){
 const [signer,setSigner]=useState<ReportSigner>({id:owner,nombre:state.profile?.nombre_completo??'',cargo:state.profile?.cargo??'',colegiatura:state.profile?.nro_colegiatura??'',image:state.profile?.firma_imagen??undefined});
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(event:FormEvent){event.preventDefault();setBusy(true);setError('');try{await saveProfile(local,owner,{nombre_completo:signer.nombre,cargo:signer.cargo,nro_colegiatura:signer.colegiatura,firma_imagen:signer.image??null},crypto.randomUUID());await onRefresh();onToast('Perfil y firma guardados localmente')}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
 return <div className="page-enter"><header className="page-heading"><div><p className="eyebrow">IDENTIDAD PROFESIONAL</p><h1>Mi perfil</h1><p>Guarda tus datos y firma para añadirte a cualquier visita con un toque.</p></div></header><section className="card profile-form"><h2>Datos y firma del profesional</h2><p>{session.user.email}</p>{error&&<p className="alert error" role="alert">{error}</p>}<form onSubmit={submit}><SignersEditor profileMode signers={[signer]} onChange={next=>setSigner(next[0]??{...signer,image:undefined})}/><div className="form-actions"><button className="btn btn-primary" disabled={busy}>{busy?'Guardando…':'Guardar perfil y firma'}</button><button type="button" className="btn btn-ghost" onClick={()=>void supabase.auth.signOut({scope:'local'})}>Cerrar sesión</button></div></form></section></div>;
}
