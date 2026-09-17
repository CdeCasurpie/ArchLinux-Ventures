import {useEffect,useState,useMemo,type FormEvent} from 'react';
import type {Session} from '@supabase/supabase-js';
import {SyncEngine,saveProfile} from '@archforms/application';
import {SupabaseProfileRepository} from '@archforms/data-supabase';
import {ConflictError,type LocalState} from '@archforms/domain';
import {supabase,local,configured} from './platform';
const message=(e:unknown)=>e instanceof Error?e.message:String(e);
export function App(){
 const [session,setSession]=useState<Session|null>(null),[loading,setLoading]=useState(true);
 useEffect(()=>{
  supabase.auth.getSession().then(({data})=>{setSession(data.session);setLoading(false)});
  const {data}=supabase.auth.onAuthStateChange((_event,next)=>{setSession(next);setLoading(false)});
  return ()=>data.subscription.unsubscribe();
 },[]);
 if(!configured)return <main className="auth"><h1>Configura ArchForms</h1><p>Falta configurar la conexión de este entorno. Consulta el README del proyecto.</p></main>;
 if(loading)return <main className="auth"><p role="status">Abriendo tu espacio…</p></main>;
 return session?<Workspace key={session.user.id} session={session}/>:<Auth/>;
}
function Auth(){
 const [register,setRegister]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);setError('');setNotice('');
  const data=new FormData(event.currentTarget);
  const email=String(data.get('email')),password=String(data.get('password'));
  const result=register?await supabase.auth.signUp({email,password,options:{data:{nombre_completo:String(data.get('name'))}}}):await supabase.auth.signInWithPassword({email,password});
  if(result.error)setError(result.error.message);
  else if(register&&!result.data.session)setNotice('Revisa tu correo para confirmar tu cuenta y luego inicia sesión.');
  setBusy(false);
 }
 return <div className="auth-layout"><section className="auth-story"><Brand/><span className="eyebrow">DE LA OBRA AL INFORME</span><h1>Tu trabajo de campo.<br/><em>Todo en su lugar.</em></h1><p>Un espacio para tus expedientes, tus visitas y la información que hace cada informe.</p><div className="story-footer">ARCHFORMS <span>Hecho para el trabajo real.</span></div></section><main className="auth"><span className="eyebrow">BIENVENIDO A ARCHFORMS</span><h2>{register?'Crea tu cuenta':'Qué bueno verte.'}</h2><p className="muted">{register?'Tu espacio de trabajo comienza aquí.':'Ingresa para continuar con tu trabajo.'}</p><form onSubmit={submit}>{register&&<label>Nombre completo<input name="name" required minLength={2} maxLength={160} autoComplete="name"/></label>}<label>Correo electrónico<input name="email" type="email" required autoComplete="email" placeholder="tu@correo.com"/></label><label>Contraseña<input name="password" type="password" required minLength={8} autoComplete={register?'new-password':'current-password'}/></label>{error&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status" className="notice">{notice}</p>}<button className="primary" disabled={busy}>{busy?'Un momento…':register?'Crear cuenta':'Entrar a mi espacio'} <span>→</span></button></form><button className="text-button" onClick={()=>{setRegister(!register);setError('');setNotice('')}}>{register?'Ya tengo cuenta. Iniciar sesión':'Crear una cuenta'}</button><small>El primer inicio de sesión necesita conexión.</small></main></div>;
}
function Workspace({session}:{session:Session}){
 const owner=session.user.id;
 const [state,setState]=useState<LocalState>({profile:null,pending:null});
 const [section,setSection]=useState<'home'|'profile'>('home');
 const [online,setOnline]=useState(navigator.onLine),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [conflict,setConflict]=useState(false);
 const remote=useMemo(()=>new SupabaseProfileRepository(supabase),[]);
 const engine=useMemo(()=>new SyncEngine(local,remote,owner),[remote,owner]);
 async function refresh(){setState(await local.read(owner));}
 async function sync(){
  setBusy(true);setError('');setNotice('');
  try{await engine.run();setConflict(false);setNotice('Tus cambios están sincronizados.');}
  catch(e){setConflict(e instanceof ConflictError);setError(message(e));}
  finally{await refresh();setBusy(false);}
 }
 useEffect(()=>{
  let active=true;
  local.read(owner).then(s=>{if(active)setState(s)});
  const update=()=>{setOnline(navigator.onLine);if(navigator.onLine)void sync();};
  window.addEventListener('online',update);window.addEventListener('offline',update);
  if(navigator.onLine)void sync();
  return()=>{active=false;window.removeEventListener('online',update);window.removeEventListener('offline',update)};
 // This owner-keyed workspace owns exactly one sync engine.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[engine,owner]);
 async function save(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setError('');
  const data=new FormData(event.currentTarget);
  try{
   await saveProfile(local,owner,{nombre_completo:String(data.get('name')),cargo:String(data.get('role')),nro_colegiatura:String(data.get('license'))},crypto.randomUUID());
   await refresh();setNotice('Guardado en este dispositivo.');
   if(navigator.onLine)void sync();
  }catch(e){setError(message(e));}
 }
 const profile=state.profile;
 return <div className="app-layout"><aside className="sidebar"><Brand/><div className="nav-title">TU ESPACIO</div><nav aria-label="Navegación principal"><button className={section==='home'?'selected':''} onClick={()=>setSection('home')}>⌂ <span>Inicio</span></button><button className={section==='profile'?'selected':''} onClick={()=>setSection('profile')}>◎ <span>Mi perfil</span></button></nav><div className="sidebar-bottom"><span className="avatar">{profile?.nombre_completo.slice(0,1)||'A'}</span><div><strong>{profile?.nombre_completo||'Profesional'}</strong><small>Mi espacio de trabajo</small></div></div></aside><main className="workspace"><header className="topbar"><div className="breadcrumb">Mi espacio <span>/</span> {section==='home'?'Inicio':'Mi perfil'}</div><div className={'connection '+(online?'':'offline')}><i/>{online?'Con conexión':'Sin conexión'}</div></header><div className="page"><div className="page-heading"><div><span className="eyebrow">TU TRABAJO, ORGANIZADO</span><h1>{section==='home'?'Hola, '+(profile?.nombre_completo.split(' ')[0]||'bienvenido')+'.':'Mi perfil profesional'}</h1><p className="muted">{section==='home'?'Deja todo listo para tu próxima visita.':'Estos datos identifican tu trabajo y tus informes.'}</p></div><button className="secondary" disabled={busy||!online} onClick={()=>void sync()}>{busy?'Sincronizando…':'↻ Sincronizar'}</button></div>{error&&<div role="alert" className="error">{error}{conflict&&<p>Tu edición sigue guardada en este dispositivo. El conflicto debe resolverse antes de continuar la sincronización.</p>}</div>}{notice&&<p role="status" className="notice">{notice}</p>}{section==='home'?<><section className="welcome-card"><div><span className="eyebrow">EMPIEZA POR LO ESENCIAL</span><h2>Tu experiencia.<br/>Tu firma. Tu espacio.</h2><p>Completa tus datos profesionales para preparar tu espacio de inspecciones.</p><button className="primary" onClick={()=>setSection('profile')}>Completar mi perfil <span>↗</span></button></div><div className="architecture" aria-hidden="true"><div/><div/><div/><span>A</span></div></section><div className="cards"><article className="card"><span className="card-icon">↻</span><h3>Guardado y sincronización</h3><p>{state.pending?'Tienes cambios guardados en este dispositivo, pendientes de enviar.':'Tu perfil está disponible para continuar trabajando.'}</p><span className="pill">{state.pending?'Cambios pendientes':profile?'Al día':'Cargando perfil'}</span></article><article className="card"><span className="card-icon violet">▤</span><h3>Tus expedientes</h3><p>La creación de expedientes y sus checklists llegará en la siguiente entrega.</p><span className="pill subtle">Próximamente</span></article></div></>:<section className="profile-card"><div className="profile-title"><span className="avatar large">{profile?.nombre_completo.slice(0,1)||'A'}</span><div><h2>Datos del profesional</h2><p className="muted">{session.user.email}</p></div></div>{profile?<form key={profile.id} onSubmit={save}><label>Nombre completo<input name="name" required minLength={2} maxLength={160} defaultValue={profile.nombre_completo}/></label><div className="form-grid"><label>Cargo<input name="role" maxLength={160} defaultValue={profile.cargo||''} placeholder="Arquitecto / Inspector"/></label><label>Número de colegiatura<input name="license" maxLength={40} defaultValue={profile.nro_colegiatura||''} placeholder="CAP…"/></label></div><p className="muted">Puedes guardar sin conexión. Sincronizaremos al recuperarla.</p><button className="primary" disabled={busy}>Guardar mi perfil <span>✓</span></button></form>:<p role="status">Conéctate para cargar tu perfil por primera vez.</p>}</section>}<footer><span>ArchForms · Primera entrega</span><button className="text-button" onClick={async()=>{if(state.pending&&!window.confirm('Hay cambios pendientes. Se conservarán para esta cuenta. ¿Cerrar sesión?'))return;await supabase.auth.signOut({scope:'local'})}}>Cerrar sesión</button></footer></div></main></div>;
}
function Brand(){return <div className="brand"><span className="brand-mark">A</span><strong><span>ARCH</span>FORMS</strong></div>}
