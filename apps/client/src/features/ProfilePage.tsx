import {useState,type FormEvent} from 'react';
import type {Session} from '@supabase/supabase-js';
import type {LocalState,ReportSigner} from '@archforms/domain';
import {saveProfile} from '@archforms/application';
import {local,supabase} from '../platform';
import {SignersEditor} from './Signers';
import {Modal} from './ui';
import '../styles/account.css';

export function ProfilePage({owner,session,state,onRefresh,onToast,onDelete}:{owner:string;session:Session;state:LocalState;onRefresh:()=>Promise<void>;onToast:(text:string)=>void;onDelete:(confirmation:string,progress:(text:string)=>void)=>Promise<void>}){
 const [signer,setSigner]=useState<ReportSigner>({id:owner,nombre:state.profile?.nombre_completo??'',cargo:state.profile?.cargo??'',colegiatura:state.profile?.nro_colegiatura??'',image:state.profile?.firma_imagen??undefined});
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [deleting,setDeleting]=useState(false),[deleteBusy,setDeleteBusy]=useState(false),[confirmation,setConfirmation]=useState(''),[deleteError,setDeleteError]=useState(''),[progress,setProgress]=useState('');
 async function removeAccount(){setDeleteBusy(true);setDeleteError('');try{await onDelete(confirmation,setProgress)}catch(error){setDeleteError(`No se completó el borrado. Puedes reintentarlo para continuar. ${error instanceof Error?error.message:String(error)}`)}finally{setDeleteBusy(false)}}
 async function submit(event:FormEvent){event.preventDefault();setBusy(true);setError('');try{await saveProfile(local,owner,{nombre_completo:signer.nombre,cargo:signer.cargo,nro_colegiatura:signer.colegiatura,firma_imagen:signer.image??null},crypto.randomUUID());await onRefresh();onToast('Perfil y firma guardados localmente')}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
 return <div className="page-enter">
  <header className="page-heading account-heading"><div><p className="eyebrow">IDENTIDAD PROFESIONAL</p><h1>Mi perfil</h1><p>Guarda tus datos y firma para añadirte a cualquier visita con un toque.</p></div>
   <details className="profile-options"><summary aria-label="Opciones de la cuenta" title="Opciones de la cuenta"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg></summary><div className="profile-options-menu"><button type="button" disabled={busy} onClick={event=>{event.currentTarget.closest('details')?.removeAttribute('open');setDeleting(true);setConfirmation('');setDeleteError('');setProgress('')}}>Eliminar cuenta</button></div></details>
  </header>
  <section className="card profile-form"><h2>Datos y firma del profesional</h2><p>{session.user.email}</p>{error&&<p className="alert error" role="alert">{error}</p>}<form onSubmit={submit}><SignersEditor profileMode signers={[signer]} onChange={next=>setSigner(next[0]??{...signer,image:undefined})}/><div className="form-actions"><button className="btn btn-primary" disabled={busy}>{busy?'Guardando…':'Guardar perfil y firma'}</button><button type="button" className="btn btn-ghost" onClick={()=>void supabase.auth.signOut({scope:'local'})}>Cerrar sesión</button></div></form></section>
  {deleting&&<Modal className="account-delete-dialog" labelledBy="delete-account-title" describedBy="delete-account-description" alert busy={deleteBusy} onClose={()=>setDeleting(false)}>
   <h2 id="delete-account-title">Eliminar tu cuenta de ArchForms</h2>
   <p id="delete-account-description">Esta acción no se puede deshacer. Se eliminarán tu cuenta, perfil, firma, plantillas propias, expedientes, visitas, fotos, audios y datos sincronizados.</p>
   <p>También se limpiarán los datos de esta cuenta en este dispositivo. Los PDF que hayas exportado o compartido y las copias sin conexión de otros dispositivos deben eliminarse allí.</p>
   <label>Escribe ELIMINAR para confirmar<input className="field" autoComplete="off" value={confirmation} disabled={deleteBusy} onChange={event=>setConfirmation(event.target.value)}/></label>
   {progress&&<p className="delete-progress" role="status">{progress}</p>}{deleteError&&<p role="alert" className="alert error">{deleteError}</p>}
   <div className="form-actions"><button type="button" className="btn btn-secondary" disabled={deleteBusy} onClick={()=>setDeleting(false)}>{progress?'Cerrar':'Conservar cuenta'}</button><button type="button" className="btn btn-danger" disabled={deleteBusy||confirmation!=='ELIMINAR'} onClick={()=>void removeAccount()}>{deleteBusy?'Eliminando…':'Eliminar definitivamente'}</button></div>
  </Modal>}
 </div>;
}
