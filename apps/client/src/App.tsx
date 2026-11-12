import { VisitSummary } from "./features/Summary";
import { transcriptionService } from "./features/transcription-service";
import { VisitCapture } from "./features/Capture";
import { VisitReport } from "./features/Report";
import { MediaSyncManager, pullVisitaFromCloud } from "./features/media-sync";
import { SupabaseCaptureReader } from "@archforms/data-supabase";
import {lazy,Suspense,useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState,type FormEvent,type ReactNode} from 'react';
import {flushSync} from 'react-dom';
import {Capacitor} from '@capacitor/core';
import {App as NativeApp} from '@capacitor/app';
import type {Session} from '@supabase/supabase-js';
import {saveProfile,buildExpediente,buildVisita,workspaceOperation,WorkspaceSyncEngine,SyncEngine} from '@archforms/application';
import {SupabaseProfileRepository,SupabaseWorkspaceRepository} from '@archforms/data-supabase';
import type {ChecklistField,ChecklistSchema,ChecklistTemplate,Expediente,LocalState,Visita,WorkspaceState} from '@archforms/domain';
import {supabase,local,workspaceLocal,mediaOutbox,configured} from './platform';
import {Icon,type IconName} from './ui/Icon';

const Landing=lazy(()=>import('./landing/Landing'));

type View='dashboard'|'expedientes'|'crear'|'detalle'|'visita'|'informe'|'plantillas'|'perfil';
type Route={view:View;selectedId:string|null;visitId:string|null};
const tabViews:View[]=['dashboard','expedientes','plantillas','perfil'];
const blankWorkspace:WorkspaceState={expedientes:[],visitas:[],plantillas:[],pending:[],last_sync:null};
const fallbackTemplates:ChecklistTemplate[]=[
 {id:'local-g050',codigo:'G050',nombre:'Verificación técnica · G.050',version:1,profesional_id:null,esquema:{version:1,sections:[{id:'documentos',title:'Exigencias obligatorias en obra',fields:[{id:'licencia',label:'Licencia de edificación disponible',description:'Documento vigente en obra',type:'boolean',required:true},{id:'planos',label:'Planos aprobados y resellados',type:'boolean'},{id:'cuaderno',label:'Cuaderno de obra actualizado',type:'boolean'},{id:'epi',label:'Personal con EPP completo',type:'boolean'},{id:'orden',label:'Orden y limpieza en zona de trabajo',type:'boolean'},{id:'observacion',label:'Observaciones del checklist',type:'text'}]}]}},
 {id:'local-supervision',codigo:'SUPERVISION',nombre:'Supervisión general de obra',version:1,profesional_id:null,esquema:{version:1,sections:[{id:'avance',title:'Avance y calidad',fields:[{id:'avance',label:'Avance general observado (%)',type:'number'},{id:'calidad',label:'Trabajos ejecutados según planos',type:'boolean'},{id:'seguridad',label:'Condiciones de seguridad adecuadas',type:'boolean'},{id:'observaciones',label:'Observaciones técnicas',type:'text'}]}]}},
 {id:'local-vacio',codigo:'VACIO',nombre:'Checklist básico',version:1,profesional_id:null,esquema:{version:1,sections:[{id:'general',title:'Verificación general',fields:[{id:'observaciones',label:'Observaciones de la visita',type:'text'}]}]}}
];
const msg=(error:unknown)=>error instanceof Error?error.message:String(error);
const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const initials=(name?:string)=>name?.split(/\s+/).slice(0,2).map(word=>word[0]).join('').toUpperCase()||'AF';
const dateLabel=(value:string)=>new Intl.DateTimeFormat('es-PE',{day:'numeric',month:'long',year:'numeric'}).format(new Date(`${value}T12:00:00`));
const shortDate=(value:string)=>new Intl.DateTimeFormat('es-PE',{day:'numeric',month:'short'}).format(new Date(`${value}T12:00:00`)).replace('.','');
const pad2=(n:number)=>String(n).padStart(2,'0');
const isAnswered=(value:unknown)=>value!==undefined&&value!==null&&value!=='';
const obraTitle=(e:Expediente)=>{const first=(e.detalle_obra??'').split('\n')[0].trim();return (first.length>90?`${first.slice(0,88)}…`:first)||e.propietario||`Expediente ${e.nro_expediente}`};
const visitState:Record<Visita['estado'],{label:string;tone:string}>={BORRADOR:{label:'En curso',tone:'badge-draft'},EN_CAMPO:{label:'En campo',tone:'badge-draft'},EN_REVISION:{label:'En revisión',tone:'badge-info'},FINALIZADA:{label:'Concluida',tone:'badge-done'},ARCHIVADA:{label:'Archivada',tone:''}};
const fieldTypeLabel:Record<ChecklistField['type'],string>={boolean:'Sí / No / N.A.',text:'Texto',number:'Número',date:'Fecha'};
const fieldCount=(schema:ChecklistSchema)=>schema.sections.reduce((sum,s)=>sum+s.fields.length,0);
const pointsLabel=(n:number)=>`${n} ${n===1?'punto':'puntos'}`;
const checklistDone=(v:Visita)=>{const fields=v.checklist_esquema_json.sections.flatMap(s=>s.fields);return {done:fields.filter(f=>isAnswered(v.checklist_respuestas_json[f.id])).length,total:fields.length}};
// Los mensajes de Supabase llegan en inglés; se traducen los que un usuario puede provocar.
function authErrorText(text:string){
 if(/invalid login credentials/i.test(text))return 'El correo o la contraseña no coinciden.';
 if(/email not confirmed/i.test(text))return 'Aún no confirmas tu correo. Abre el enlace que te enviamos.';
 if(/already registered/i.test(text))return 'Ya existe una cuenta con ese correo.';
 if(/fetch|network/i.test(text))return 'Sin conexión. Para ingresar la primera vez necesitas internet.';
 return text;
}
const OFFLINE_SYNC='Sin conexión con la nube. Tu trabajo está guardado en este dispositivo y se subirá solo.';
function syncErrorText(text:string){
 if(/fetch|network|timeout/i.test(text))return OFFLINE_SYNC;
 return `No se pudo sincronizar (${text}). Tu trabajo sigue guardado en este dispositivo.`;
}
// Transición entre pantallas con View Transitions (si el navegador la soporta).
function transition(update:()=>void,direction:'forward'|'back'='forward'){
 const doc=document as Document&{startViewTransition?:(cb:()=>void)=>unknown};
 const reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 if(!doc.startViewTransition||reduce||document.body.classList.contains('camera-active')){update();return}
 const root=document.documentElement;
 root.dataset.nav=direction;
 // El nombre de transición solo existe mientras dura la animación (no altera capas fijas como la cámara).
 const vt=doc.startViewTransition(()=>flushSync(update)) as {finished?:Promise<unknown>};
 void vt.finished?.finally(()=>{delete root.dataset.nav});
}

export function App(){
 const native=Capacitor.isNativePlatform();
 const [session,setSession]=useState<Session|null>(null),[boot,setBoot]=useState<'loading'|'ready'|'error'>('loading');
 const authHash=()=>location.hash==='#ingresar'||location.hash==='#crear-cuenta';
 const [wantsLogin,setWantsLogin]=useState(()=>native||authHash());
 const load=useCallback(()=>{
  setBoot('loading');
  // getSession puede quedarse colgado si falla la renovación del token: se corta a los 12 s.
  const timeout=new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('timeout')),12000));
  Promise.race([supabase.auth.getSession(),timeout]).then(({data})=>{setSession(data.session);setBoot('ready')}).catch(()=>setBoot('error'));
 },[]);
 useEffect(()=>{load();const {data}=supabase.auth.onAuthStateChange((_event,next)=>{setSession(next);setBoot('ready')});return()=>data.subscription.unsubscribe()},[load]);
 useEffect(()=>{if(native)return;const onHash=()=>setWantsLogin(location.hash==='#ingresar'||location.hash==='#crear-cuenta');window.addEventListener('hashchange',onHash);return()=>window.removeEventListener('hashchange',onHash)},[native]);
 if(!configured)return <main className="center-screen"><h1>Falta configurar ArchForms</h1><p>Este entorno no tiene la conexión a Supabase.</p></main>;
 if(boot==='loading')return <main className="center-screen" aria-busy="true"><span className="spinner lg"/><p>Abriendo tu espacio…</p></main>;
 if(boot==='error')return <main className="center-screen"><h1>No pudimos abrir tu sesión</h1><p>Lo guardado en este dispositivo no se ha perdido. Revisa la conexión e inténtalo otra vez.</p><button className="btn btn-primary btn-lg" onClick={load}><Icon name="refresh"/>Reintentar</button><button className="link-button" onClick={()=>{void supabase.auth.signOut({scope:'local'}).finally(()=>{setSession(null);setBoot('ready')})}}>Ingresar de nuevo</button></main>;
 if(session)return <Workspace key={session.user.id} session={session}/>;
 if(!wantsLogin)return <Suspense fallback={null}><Landing onEnter={mode=>{location.hash=mode==='register'?'crear-cuenta':'ingresar';window.scrollTo({top:0})}}/></Suspense>;
 return <Auth key={location.hash} startRegister={location.hash==='#crear-cuenta'} onBack={native?undefined:()=>{history.replaceState(null,'',location.pathname);setWantsLogin(false)}}/>;
}

function Brand({compact=false}:{compact?:boolean}){return <span className="brand"><img src="/archforms-mark.png" alt=""/>{!compact&&<span>ArchForms</span>}</span>}
function Auth({onBack,startRegister=false}:{onBack?:()=>void;startRegister?:boolean}){
 const [register,setRegister]=useState(startRegister),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[showPassword,setShowPassword]=useState(false);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);setError('');setNotice('');
  const data=new FormData(event.currentTarget),email=String(data.get('email')).trim(),password=String(data.get('password'));
  try{
   const result=register?await supabase.auth.signUp({email,password,options:{data:{nombre_completo:String(data.get('name'))}}}):await supabase.auth.signInWithPassword({email,password});
   if(result.error)setError(authErrorText(result.error.message));else if(register&&!result.data.session)setNotice('Te enviamos un correo. Ábrelo para confirmar tu cuenta.');
  }catch(e){setError(authErrorText(msg(e)))}finally{setBusy(false)}
 }
 return <div className="auth-screen">
  {onBack&&<button className="link-button auth-back" onClick={onBack}><Icon name="back" size={18}/>ArchForms</button>}
  <main className="auth">
   <Brand compact/>
   <h1>{register?'Crea tu cuenta':'Bienvenido de nuevo'}</h1>
   <p>{register?'Empieza a registrar tus visitas de obra.':'Ingresa para continuar con tus visitas.'}</p>
   <form onSubmit={submit}>
    {register&&<label className="form-group">Nombre completo<input className="field" name="name" required minLength={2} autoComplete="name"/></label>}
    <label className="form-group">Correo<input className="field" name="email" type="email" inputMode="email" required autoComplete="email" autoCapitalize="none"/></label>
    <label className="form-group">Contraseña
     <span className="password-field"><input className="field" name="password" type={showPassword?'text':'password'} minLength={8} required autoComplete={register?'new-password':'current-password'}/><button type="button" onClick={()=>setShowPassword(!showPassword)} aria-label={showPassword?'Ocultar contraseña':'Mostrar contraseña'} aria-pressed={showPassword}><Icon name={showPassword?'eyeOff':'eye'}/></button></span>
     {register&&<span className="input-hint">Mínimo 8 caracteres.</span>}
    </label>
    {error&&<div className="alert error" role="alert"><Icon name="alert" size={20}/><span>{error}</span></div>}
    {notice&&<div className="alert notice" role="status"><span>{notice}</span></div>}
    <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy?'Un momento…':register?'Crear cuenta':'Ingresar'}</button>
   </form>
   <p className="auth-switch">{register?'¿Ya tienes cuenta?':'¿Aún no tienes cuenta?'} <button className="link-button" onClick={()=>{setRegister(!register);setError('');setNotice('')}}>{register?'Ingresar':'Crear una'}</button></p>
  </main>
 </div>;
}

function Workspace({session}:{session:Session}){
 const owner=session.user.id;
 const [route,setRoute]=useState<Route>({view:'dashboard',selectedId:null,visitId:null});
 const {view,selectedId,visitId}=route;
 const [profile,setProfile]=useState<LocalState>({profile:null,pending:null}),[data,setData]=useState<WorkspaceState>(blankWorkspace);
 const [online,setOnline]=useState(navigator.onLine),[syncing,setSyncing]=useState(false),[error,setError]=useState(''),[toast,setToast]=useState('');
 const [creatingVisit,setCreatingVisit]=useState(false),[picker,setPicker]=useState(false);
 const syncLock=useRef(false),syncAgain=useRef(false);
 const routeRef=useRef(route),stack=useRef<Route[]>([]);
 useEffect(()=>{routeRef.current=route});
 const remote=useMemo(()=>new SupabaseWorkspaceRepository(supabase),[]),engine=useMemo(()=>new WorkspaceSyncEngine(workspaceLocal,remote,owner),[remote,owner]);
 const profileRemote=useMemo(()=>new SupabaseProfileRepository(supabase),[]),profileEngine=useMemo(()=>new SyncEngine(local,profileRemote,owner),[profileRemote,owner]);
 const mediaSyncManager=useMemo(()=>new MediaSyncManager(mediaOutbox,owner),[owner]);
 const selected=data.expedientes.find(item=>item.id===selectedId)??null,visit=data.visitas.find(item=>item.id===visitId)??null;
 async function refresh(){setData(await workspaceLocal.read(owner));setProfile(await local.read(owner))}
 async function runSync(retryJwt=true):Promise<void>{
  try{await Promise.all([engine.run(),profileEngine.run()])}
  catch(e){
   // Tolerancia a desface de reloj (5s): un token recién emitido puede parecer
   // "del futuro" por segundos; se reintenta una vez en silencio antes de avisar.
   if(retryJwt&&/jwt.*future|future.*jwt|issued at future|\biat\b/i.test(msg(e))){await sleep(5000);return runSync(false)}
   throw e;
  }
 }
 // Una sola sincronización a la vez; si llegan cambios mientras corre, se repite al terminar.
 async function sync(announce=false){
  if(!navigator.onLine)return;
  if(syncLock.current){syncAgain.current=true;return}
  syncLock.current=true;setSyncing(true);setError('');
  try{await runSync();if(announce)setToast('Todo al día en la nube')}
  catch(e){setError(syncErrorText(msg(e)))}
  finally{await refresh();syncLock.current=false;setSyncing(false);if(syncAgain.current){syncAgain.current=false;void sync()}}
 }
 useEffect(()=>{let active=true;Promise.all([workspaceLocal.read(owner),local.read(owner)]).then(([workspace,user])=>{if(active){setData(workspace);setProfile(user)}});if(navigator.onLine)void sync();if(navigator.onLine){const reader=new SupabaseCaptureReader(supabase);void (async()=>{try{const ws=await workspaceLocal.read(owner);for(const v of ws.visitas){try{await pullVisitaFromCloud(mediaOutbox,reader,v.id)}catch(e){console.error(e)}}}catch(e){console.error(e)}})()}const network=()=>{setOnline(navigator.onLine);if(navigator.onLine)void sync()};window.addEventListener('online',network);window.addEventListener('offline',network);return()=>{active=false;window.removeEventListener('online',network);window.removeEventListener('offline',network)}
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[engine,owner]);
 // Start MediaSyncManager lifecycle on native; runs GC + sync on mount and on network/foreground events
 useEffect(()=>{mediaSyncManager.start();transcriptionService.start();return()=>mediaSyncManager.stop()},[mediaSyncManager]);
 useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(''),3000);return()=>clearTimeout(timer)},[toast]);

 // Navegación con historial: atrás (navegador, gesto o botón de Android) vuelve a la pantalla anterior.
 function navigate(next:View,target:{id?:string;visit?:string}={}){
  const current=routeRef.current;
  const nextRoute={view:next,selectedId:target.id??current.selectedId,visitId:target.visit??current.visitId};
  transition(()=>{
   if(tabViews.includes(next)){stack.current=[];history.replaceState({af:0},'')}
   else{stack.current.push(current);history.pushState({af:stack.current.length},'')}
   setRoute(nextRoute);
  });
  window.scrollTo({top:0});
 }
 function goBack(fallback:View){if(stack.current.length)history.back();else navigate(fallback)}
 useEffect(()=>{
  const onPop=()=>{const previous=stack.current.pop();if(previous){transition(()=>setRoute(previous),'back');window.scrollTo({top:0})}};
  window.addEventListener('popstate',onPop);
  let remove:(()=>void)|undefined;
  if(Capacitor.isNativePlatform()){
   void NativeApp.addListener('backButton',()=>{
    if(stack.current.length)history.back();
    else if(routeRef.current.view!=='dashboard')transition(()=>setRoute({...routeRef.current,view:'dashboard'}),'back');
    else void NativeApp.exitApp();
   }).then(handle=>{remove=()=>void handle.remove()});
  }
  return()=>{window.removeEventListener('popstate',onPop);remove?.()};
 },[]);

 async function queue(entity:'expediente'|'visita',record:Expediente|Visita,quiet=false){await workspaceLocal.save(owner,workspaceOperation(entity,record));await refresh();if(!quiet)setToast('Guardado');if(navigator.onLine)void sync()}
 async function newVisit(expediente:Expediente){
  // Guardia anti-doble-tap + lectura fresca del storage (el estado React puede
  // estar desactualizado ante toques rápidos y calcularía el mismo nro_visita).
  if(creatingVisit)return;
  setCreatingVisit(true);
  try{
   const ws=await workspaceLocal.read(owner);
   const current=ws.visitas.filter(item=>item.expediente_id===expediente.id),next=Math.max(0,...current.map(item=>item.nro_visita))+1;
   // Fecha local (no UTC): en Lima, después de las 19:00 la fecha UTC ya es el día siguiente.
   const today=new Date(),fecha=`${today.getFullYear()}-${pad2(today.getMonth()+1)}-${pad2(today.getDate())}`;
   const created=buildVisita(expediente,next,fecha);
   await queue('visita',created,true);
   setPicker(false);
   navigate('visita',{id:expediente.id,visit:created.id});
  }catch(e){setError(`No se pudo crear la visita: ${msg(e)}`)}finally{setCreatingVisit(false)}
 }
 const activeCases=data.expedientes.filter(item=>item.activo);
 function startVisit(){if(activeCases.length)setPicker(true);else navigate('crear',{id:''})}
 function openVisit(v:Visita){navigate(v.estado==='FINALIZADA'?'informe':'visita',{id:v.expediente_id,visit:v.id})}
 const templates=data.plantillas.length?data.plantillas:fallbackTemplates;
 // Registros distintos con cambios por subir (el guardado automático encola una operación por toque).
 const pending=new Set(data.pending.map(item=>item.record.id)).size;
 const syncTone=!online?'offline':pending?'pending':'';
 const syncTitle=syncing?'Sincronizando…':!online?'Sin conexión':pending?`${pending} por subir`:'Al día';
 const nav:{view:View;label:string;icon:IconName;match:View[]}[]=[
  {view:'dashboard',label:'Inicio',icon:'home',match:['dashboard']},
  {view:'expedientes',label:'Expedientes',icon:'folder',match:['expedientes','crear','detalle']},
  {view:'plantillas',label:'Plantillas',icon:'clipboard',match:['plantillas']},
  {view:'perfil',label:'Perfil',icon:'user',match:['perfil']},
 ];
 const navButton=(item:typeof nav[number])=><Nav key={item.view} active={item.match.includes(view)} icon={item.icon} onClick={()=>navigate(item.view)}>{item.label}</Nav>;
 return <><div className="app-shell">
  <aside className="sidebar">
   <button className="brand-button" onClick={()=>navigate('dashboard')} aria-label="Ir al inicio"><Brand/></button>
   <button className="btn btn-primary btn-block sidebar-cta" onClick={startVisit}><Icon name="plus"/>Nueva visita</button>
   <nav className="sidebar-nav" aria-label="Secciones">{nav.slice(0,3).map(navButton)}</nav>
   <div className="sidebar-spacer"/>
   <button className={`sync-status ${syncTone}`} onClick={()=>void sync(true)} disabled={!online||syncing} title="Sincronizar ahora">
    {syncing?<span className="spinner"/>:<span className="dot"/>}
    <span><strong>{syncTitle}</strong><small>{!online?'Se guarda en este dispositivo':pending?'Guardado aquí, falta subir':'Respaldado en la nube'}</small></span>
   </button>
   <button className={`profile-card ${view==='perfil'?'active':''}`} onClick={()=>navigate('perfil')}><span className="avatar">{initials(profile.profile?.nombre_completo)}</span><span><strong>{profile.profile?.nombre_completo||'Tu perfil'}</strong><small>{profile.profile?.cargo||session.user.email}</small></span></button>
  </aside>
  <section className="app-area">
   {view!=='visita'&&<header className="topbar">
    <button className="brand-button" onClick={()=>navigate('dashboard')} aria-label="Ir al inicio"><Brand/></button>
    <button className={`sync-pill ${syncTone}`} onClick={()=>void sync(true)} disabled={!online||syncing} aria-label={`Estado: ${syncTitle}`}>{syncing?<span className="spinner"/>:<span className="dot"/>}{syncTitle}</button>
   </header>}
   <main className="main-content">
    {error&&<div className={`alert ${error===OFFLINE_SYNC?'warn':'error'}`} role="alert"><Icon name={error===OFFLINE_SYNC?'cloudOff':'alert'} size={20}/><span>{error}</span><button className="icon-btn ghost" onClick={()=>setError('')} aria-label="Cerrar aviso"><Icon name="close" size={18}/></button></div>}
    <div className="screen" key={view}>
     {view==='dashboard'&&<Dashboard data={data} profile={profile} onStart={startVisit} onNavigate={navigate} onOpen={id=>navigate('detalle',{id})} onOpenVisit={openVisit}/>}
     {view==='expedientes'&&<Expedientes data={data} onNew={()=>navigate('crear',{id:''})} onOpen={id=>navigate('detalle',{id})}/>}
     {view==='crear'&&<ExpedienteForm owner={owner} templates={templates} existing={selected} onCancel={()=>goBack(selected?'detalle':'expedientes')} onSave={async record=>{await queue('expediente',record);if(selected){goBack('detalle')}else{// El formulario se reemplaza por el detalle: atrás vuelve a donde estaba antes de crear.
history.replaceState({af:stack.current.length},'');transition(()=>setRoute({view:'detalle',selectedId:record.id,visitId:null}))}}}/>}
     {view==='detalle'&&selected&&<ExpedienteDetail expediente={selected} visitas={data.visitas.filter(item=>item.expediente_id===selected.id)} onBack={()=>goBack('expedientes')} onEdit={()=>navigate('crear')} onVisit={()=>void newVisit(selected)} creating={creatingVisit} onOpenVisit={openVisit}/>}
     {view==='visita'&&visit&&selected&&<VisitChecklist key={visit.id} visita={visit} expediente={selected} ownerId={owner} onBack={()=>goBack('detalle')} onSave={record=>queue('visita',record,true)} onEditReport={()=>navigate('informe')}/>}
     {view==='informe'&&visit&&selected&&<div className="visit-shell"><header className="screen-head"><button className="back-link" onClick={()=>goBack('detalle')}><Icon name="back" size={20}/>Volver</button><div className="title-block"><p className="overline">Informe · Visita {pad2(visit.nro_visita)} · {dateLabel(visit.fecha)}</p><h1>{obraTitle(selected)}</h1></div></header><VisitReport visita={visit} expediente={selected} profile={profile.profile} ownerId={owner} onSave={record=>queue('visita',record)}/><button className="link-button report-back" onClick={()=>navigate('visita')}><Icon name="edit" size={18}/>Corregir checklist o fotos de la visita</button></div>}
     {view==='plantillas'&&<Templates templates={templates}/>}
     {view==='perfil'&&<ProfilePage owner={owner} session={session} state={profile} onRefresh={refresh} onToast={setToast}/>}
    </div>
   </main>
  </section>
 </div>
 <nav className="mobile-nav" aria-label="Secciones">
  {nav.slice(0,2).map(navButton)}
  <button className="nav-item nav-cta" onClick={startVisit}><span className="cta-circle"><Icon name="plus" size={26}/></span><span>Visita</span></button>
  {nav.slice(2).map(navButton)}
 </nav>
 {picker&&<VisitPicker expedientes={activeCases} visitas={data.visitas} busy={creatingVisit} onPick={expediente=>void newVisit(expediente)} onCreate={()=>{setPicker(false);navigate('crear',{id:''})}} onClose={()=>setPicker(false)}/>}
 <div className={`toast ${toast?'show':''}`} role="status" aria-live="polite">{toast&&<><Icon name="check" size={18}/>{toast}</>}</div></>;
}

function Nav({active,icon,children,onClick}:{active:boolean;icon:IconName;children:ReactNode;onClick:()=>void}){return <button className={active?'nav-item active':'nav-item'} aria-current={active?'page':undefined} onClick={onClick}><Icon name={icon} size={24}/><span>{children}</span></button>}

// Selector rápido: dos toques desde cualquier pantalla para empezar una visita.
function VisitPicker({expedientes,visitas,busy,onPick,onCreate,onClose}:{expedientes:Expediente[];visitas:Visita[];busy:boolean;onPick:(item:Expediente)=>void;onCreate:()=>void;onClose:()=>void}){
 const [search,setSearch]=useState('');
 const sheet=useRef<HTMLDivElement>(null);
 useEffect(()=>{sheet.current?.focus();const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};window.addEventListener('keydown',onKey);document.body.classList.add('sheet-open');return()=>{window.removeEventListener('keydown',onKey);document.body.classList.remove('sheet-open')}},[onClose]);
 const lastVisit=(id:string)=>visitas.filter(v=>v.expediente_id===id).sort((a,b)=>b.fecha.localeCompare(a.fecha))[0];
 const query=search.trim().toLowerCase();
 const items=[...expedientes].sort((a,b)=>(lastVisit(b.id)?.updated_at??b.updated_at).localeCompare(lastVisit(a.id)?.updated_at??a.updated_at)).filter(item=>`${item.nro_expediente} ${item.ubicacion??''} ${item.detalle_obra??''} ${item.propietario??''}`.toLowerCase().includes(query));
 return <>
  <div className="sheet-backdrop" onClick={onClose}/>
  <div className="sheet picker" role="dialog" aria-modal="true" aria-labelledby="picker-title" tabIndex={-1} ref={sheet}>
   <div className="sheet-grip"/>
   <div className="sheet-head"><div><strong id="picker-title">Nueva visita</strong><p>¿En qué obra?</p></div><button className="icon-btn ghost" onClick={onClose} aria-label="Cerrar"><Icon name="close"/></button></div>
   {expedientes.length>5&&<label className="search-field"><span className="sr-only">Buscar obra</span><Icon name="search" size={20}/><input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar obra"/></label>}
   <div className="list picker-list">
    {items.map(item=>{const last=lastVisit(item.id);return <button key={item.id} className="row" disabled={busy} onClick={()=>onPick(item)}><span className="row-icon"><Icon name="folder" size={20}/></span><span className="row-main"><strong>{obraTitle(item)}</strong><span>{last?`Última visita ${shortDate(last.fecha)} · próxima es la ${pad2(last.nro_visita+1)}`:`Exp. ${item.nro_expediente} · primera visita`}</span></span>{busy?<span className="spinner"/>:<Icon name="chevron" size={20}/>}</button>})}
    {!items.length&&<p className="list-empty">Ninguna obra coincide con «{search}».</p>}
   </div>
   <button className="btn btn-ghost btn-block" onClick={onCreate}><Icon name="plus" size={20}/>Es una obra nueva</button>
  </div>
 </>;
}

function greeting(){const h=new Date().getHours();return h<12?'Buenos días':h<19?'Buenas tardes':'Buenas noches'}
function Dashboard({data,profile,onStart,onNavigate,onOpen,onOpenVisit}:{data:WorkspaceState;profile:LocalState;onStart:()=>void;onNavigate:(view:View)=>void;onOpen:(id:string)=>void;onOpenVisit:(v:Visita)=>void}){
 const cases=data.expedientes.filter(item=>item.activo);
 const byId=new Map(data.expedientes.map(item=>[item.id,item]));
 const open=data.visitas.filter(v=>v.estado!=='FINALIZADA'&&v.estado!=='ARCHIVADA'&&byId.has(v.expediente_id)).sort((a,b)=>b.updated_at.localeCompare(a.updated_at)).slice(0,4);
 const firstName=profile.profile?.nombre_completo?.trim().split(/\s+/)[0];
 const today=new Intl.DateTimeFormat('es-PE',{weekday:'long',day:'numeric',month:'long'}).format(new Date());
 const recent=[...cases].sort((a,b)=>b.updated_at.localeCompare(a.updated_at)).slice(0,4);
 return <div className="page">
  <header className="title-block"><p className="overline">{today}</p><h1>{greeting()}{firstName?`, ${firstName}`:''}</h1></header>
  <button className="action-tile" onClick={onStart}>
   <span className="action-icon"><Icon name="plus" size={26}/></span>
   <span className="action-copy"><strong>{cases.length?'Nueva visita':'Crea tu primer expediente'}</strong><small>{cases.length?'Elige la obra y empieza. Funciona sin señal.':'Con el número de expediente y la dirección basta para empezar.'}</small></span>
   <Icon name="chevron" size={22}/>
  </button>
  {open.length>0&&<section className="group"><h2 className="group-title">Para continuar</h2>
   <div className="list">{open.map(v=>{const exp=byId.get(v.expediente_id)!;const {done,total}=checklistDone(v);return <button key={v.id} className="row" onClick={()=>onOpenVisit(v)}><span className="row-num">{pad2(v.nro_visita)}</span><span className="row-main"><strong>{obraTitle(exp)}</strong><span>{shortDate(v.fecha)} · checklist {done} de {total}</span></span><span className="progress-ring" style={{['--p' as string]:total?done/total:0}} aria-hidden="true"/><Icon name="chevron" size={20}/></button>})}</div>
  </section>}
  {recent.length>0&&<section className="group"><div className="group-head"><h2 className="group-title">Expedientes</h2><button className="link-button" onClick={()=>onNavigate('expedientes')}>Ver todos</button></div>
   <div className="list">{recent.map(item=><ExpedienteRow key={item.id} item={item} visits={data.visitas.filter(v=>v.expediente_id===item.id).length} onClick={()=>onOpen(item.id)}/>)}</div>
  </section>}
 </div>;
}
function ExpedienteRow({item,visits,onClick}:{item:Expediente;visits:number;onClick:()=>void}){
 return <button className="row" onClick={onClick}><span className="row-icon"><Icon name="folder" size={20}/></span><span className="row-main"><strong>{obraTitle(item)}</strong><span>{item.ubicacion||`Exp. ${item.nro_expediente}`}</span></span><span className="row-meta num">{visits}{item.total_visitas_programadas?`/${item.total_visitas_programadas}`:''}</span><Icon name="chevron" size={20}/></button>;
}
function Empty({icon,title,text,action,onClick}:{icon:IconName;title:string;text:string;action?:string;onClick?:()=>void}){return <section className="empty-state"><span className="empty-icon"><Icon name={icon} size={26}/></span><h2>{title}</h2><p>{text}</p>{action&&onClick&&<button className="btn btn-primary" onClick={onClick}><Icon name="plus" size={20}/>{action}</button>}</section>}

function Expedientes({data,onNew,onOpen}:{data:WorkspaceState;onNew:()=>void;onOpen:(id:string)=>void}){
 const [search,setSearch]=useState('');
 const all=data.expedientes.filter(item=>item.activo);
 const query=search.trim().toLowerCase();
 const items=all.filter(item=>`${item.nro_expediente} ${item.propietario??''} ${item.ubicacion??''} ${item.detalle_obra??''}`.toLowerCase().includes(query));
 return <div className="page">
  <header className="title-block with-action"><h1>Expedientes</h1><button className="round-btn" onClick={onNew} aria-label="Nuevo expediente"><Icon name="plus"/></button></header>
  {all.length>0&&<label className="search-field"><span className="sr-only">Buscar expediente</span><Icon name="search" size={20}/><input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por obra, número o dirección"/></label>}
  {items.length?<div className="list">{items.map(item=><ExpedienteRow key={item.id} item={item} visits={data.visitas.filter(v=>v.expediente_id===item.id).length} onClick={()=>onOpen(item.id)}/>)}</div>
   :all.length?<p className="list-empty">Ninguna obra coincide con «{search}».</p>
   :<Empty icon="folder" title="Sin expedientes" text="Cada obra es un expediente. Créalo una vez y todas sus visitas reutilizan los datos." action="Nuevo expediente" onClick={onNew}/>}
 </div>;
}

function ExpedienteForm({owner,templates,existing,onCancel,onSave}:{owner:string;templates:ChecklistTemplate[];existing:Expediente|null;onCancel:()=>void;onSave:(item:Expediente)=>Promise<void>}){
 const preferred=templates.find(item=>item.codigo==='G050')??templates[0];
 const [templateId,setTemplateId]=useState(existing?'':preferred?.id??''),[schema,setSchema]=useState<ChecklistSchema>(()=>structuredClone(existing?.checklist_esquema_json??preferred.esquema)),[checklistName,setChecklistName]=useState(existing?.checklist_nombre??preferred?.nombre??'Checklist'),[editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 function selectTemplate(id:string){const template=templates.find(item=>item.id===id);if(!template)return;setTemplateId(id);setSchema(structuredClone(template.esquema));setChecklistName(template.nombre)}
 function updateField(sectionId:string,fieldId:string,label:string){setSchema(current=>({...current,sections:current.sections.map(section=>section.id===sectionId?{...section,fields:section.fields.map(field=>field.id===fieldId?{...field,label}:field)}:section)}))}
 function addField(sectionId:string){
  setSchema(current=>{
   const sections=current.sections.map(section=>{
    if(section.id!==sectionId)return section;
    const fields=[...section.fields];
    let at=fields.length;
    while(at>0&&fields[at-1].type==='text')at--;
    fields.splice(at,0,{id:`campo_${crypto.randomUUID().slice(0,8)}`,label:'Nuevo punto a verificar',type:'boolean'});
    return {...section,fields};
   });
   return {...current,sections};
  });
 }
 function removeField(sectionId:string,fieldId:string){setSchema(current=>({...current,sections:current.sections.map(section=>section.id===sectionId?{...section,fields:section.fields.filter(field=>field.id!==fieldId)}:section)}))}
 async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError('');try{const form=new FormData(event.currentTarget);form.set('checklist_nombre',checklistName);await onSave(buildExpediente(owner,form,schema,existing??undefined))}catch(e){setError(msg(e));setBusy(false)}}
 const e=existing;
 return <div className="page narrow">
  <header className="screen-head"><button className="back-link" onClick={onCancel}><Icon name="back" size={20}/>{e?'Expediente':'Volver'}</button><div className="title-block"><h1>{e?'Editar expediente':'Nuevo expediente'}</h1>{!e&&<p>Solo lo esencial. El resto puedes completarlo después.</p>}</div></header>
  {error&&<div className="alert error" role="alert"><Icon name="alert" size={20}/><span>{error}</span></div>}
  <form className="form-stack" onSubmit={submit}>
   <section className="panel form-panel">
    <Field name="nro_expediente" label="Número de expediente" required defaultValue={e?.nro_expediente}/>
    <label className="form-group">Nombre de la obra<textarea className="field" name="detalle_obra" rows={2} defaultValue={e?.detalle_obra??''} placeholder="Ej. Vivienda multifamiliar de 5 pisos"/><span className="input-hint">La primera línea es el nombre que verás en tus listas.</span></label>
    <div className="form-grid"><Field name="ubicacion" label="Dirección" required defaultValue={e?.ubicacion}/><Field name="distrito" label="Distrito" defaultValue={e?.distrito}/></div>
   </section>
   <section className="group">
    <h2 className="group-title">Checklist de las visitas</h2>
    <div className="chips" role="radiogroup" aria-label="Plantilla de checklist">{templates.map(template=><button key={template.id} type="button" role="radio" className="chip" aria-checked={templateId===template.id} onClick={()=>selectTemplate(template.id)}>{template.nombre}</button>)}</div>
    <details className="panel disclosure" open={editing||undefined}>
     <summary><span><strong>{checklistName}</strong><small>{pointsLabel(fieldCount(schema))} · copia propia del expediente</small></span><Icon name="down" size={20}/></summary>
     <div className="disclosure-body">
      <div className="disclosure-tools"><button type="button" className="link-button" onClick={()=>setEditing(!editing)}>{editing?'Listo':'Editar puntos'}</button></div>
      {editing&&<label className="form-group">Nombre del checklist<input className="field" value={checklistName} onChange={ev=>setChecklistName(ev.target.value)}/></label>}
      {schema.sections.map(section=><div key={section.id} className="schema-section"><strong>{section.title}</strong>{section.fields.map(field=><div className="schema-field" key={field.id}>{editing?<input className="field" value={field.label} onChange={ev=>updateField(section.id,field.id,ev.target.value)} aria-label="Texto del punto"/>:<span>{field.label}</span>}{!editing&&<span className="field-type">{fieldTypeLabel[field.type]}</span>}{editing&&<button type="button" className="icon-btn ghost danger" onClick={()=>removeField(section.id,field.id)} aria-label={`Quitar «${field.label}»`}><Icon name="close" size={18}/></button>}</div>)}{editing&&<button className="link-button" type="button" onClick={()=>addField(section.id)}><Icon name="plus" size={18}/>Añadir punto</button>}</div>)}
     </div>
    </details>
   </section>
   <section className="group">
    <h2 className="group-title">Más datos <span className="muted">· opcional</span></h2>
    <div className="list">
     <Optional title="Licencia" hint="Número, modalidad y vigencia"><div className="form-grid"><Field name="nro_licencia" label="Número de licencia" defaultValue={e?.nro_licencia}/><Field name="modalidad" label="Modalidad" defaultValue={e?.modalidad}/><Field name="entidad_destinataria" label="Municipalidad o entidad" defaultValue={e?.entidad_destinataria}/><Field name="fecha_emision_licencia" label="Fecha de emisión" type="date" defaultValue={e?.fecha_emision_licencia}/><Field name="vigencia_desde" label="Vigente desde" type="date" defaultValue={e?.vigencia_desde}/><Field name="vigencia_hasta" label="Vigente hasta" type="date" defaultValue={e?.vigencia_hasta}/></div></Optional>
     <Optional title="Propietario y responsable" hint="Aparecen en la cabecera del informe"><div className="form-grid"><Field name="propietario" label="Propietario o razón social" defaultValue={e?.propietario}/><Field name="responsable_obra_nombre" label="Responsable de obra" defaultValue={e?.responsable_obra_nombre}/><Field name="responsable_obra_colegiatura" label="CIP o CAP del responsable" defaultValue={e?.responsable_obra_colegiatura}/><Field name="provincia" label="Provincia" defaultValue={e?.provincia}/><Field name="departamento" label="Departamento" defaultValue={e?.departamento}/></div></Optional>
     <Optional title="Obra" hint="Tipo, uso y valor"><div className="form-grid"><Field name="tipo_obra" label="Tipo de obra" defaultValue={e?.tipo_obra}/><Field name="uso_predio" label="Uso del predio" defaultValue={e?.uso_predio}/><Field name="valor_obra" label="Valor de obra (S/)" type="number" defaultValue={e?.valor_obra}/></div></Optional>
     <Optional title="Póliza y visitas programadas" hint="Para mostrar «Visita 3 de 8»"><div className="form-grid"><Field name="total_visitas_programadas" label="Visitas programadas" type="number" defaultValue={e?.total_visitas_programadas}/><Field name="poliza_compania" label="Aseguradora (póliza CAR)" defaultValue={(e?.poliza_car_json?.compania as string)??''}/><Field name="poliza_desde" label="Póliza desde" type="date" defaultValue={(e?.poliza_car_json?.desde as string)??''}/><Field name="poliza_hasta" label="Póliza hasta" type="date" defaultValue={(e?.poliza_car_json?.hasta as string)??''}/></div></Optional>
    </div>
   </section>
   <div className="form-actions"><button type="button" className="btn btn-ghost" onClick={onCancel}>Cancelar</button><button className="btn btn-primary btn-lg" disabled={busy}>{busy?'Guardando…':e?'Guardar cambios':'Crear expediente'}</button></div>
  </form>
 </div>;
}
function Optional({title,hint,children}:{title:string;hint:string;children:ReactNode}){return <details className="disclosure-row"><summary><span><strong>{title}</strong><small>{hint}</small></span><Icon name="down" size={20}/></summary><div className="disclosure-body">{children}</div></details>}
function Field({name,label,type='text',required=false,defaultValue}:{name:string;label:string;type?:string;required?:boolean;defaultValue?:string|number|null}){return <label className="form-group"><span>{label}{required&&<span className="required" aria-hidden="true"> *</span>}</span><input className="field" name={name} type={type} inputMode={type==='number'?'decimal':undefined} required={required} defaultValue={defaultValue??''}/></label>}

function ExpedienteDetail({expediente,visitas,onBack,onEdit,onVisit,onOpenVisit,creating}:{expediente:Expediente;visitas:Visita[];onBack:()=>void;onEdit:()=>void;onVisit:()=>void;onOpenVisit:(v:Visita)=>void;creating:boolean}){
 const vigencia=expediente.vigencia_desde||expediente.vigencia_hasta?`${expediente.vigencia_desde?shortDate(expediente.vigencia_desde):'…'} – ${expediente.vigencia_hasta?dateLabel(expediente.vigencia_hasta):'…'}`:'';
 const facts:[string,string|null|undefined][]=[['Propietario',expediente.propietario],['Licencia',[expediente.nro_licencia,expediente.modalidad].filter(Boolean).join(' · ')],['Vigencia',vigencia],['Responsable de obra',expediente.responsable_obra_nombre],['Checklist',expediente.checklist_nombre]];
 const sorted=[...visitas].sort((a,b)=>b.nro_visita-a.nro_visita);
 return <div className="page">
  <header className="screen-head"><button className="back-link" onClick={onBack}><Icon name="back" size={20}/>Expedientes</button>
   <div className="title-block"><p className="overline">Exp. {expediente.nro_expediente}</p><h1>{obraTitle(expediente)}</h1>{expediente.ubicacion&&<p>{[expediente.ubicacion,expediente.distrito].filter(Boolean).join(', ')}</p>}</div></header>
  <div className="actions-row"><button className="btn btn-primary btn-lg" disabled={creating} onClick={onVisit}><Icon name="plus"/>{creating?'Creando…':'Nueva visita'}</button><button className="btn btn-secondary btn-lg" onClick={onEdit}><Icon name="edit" size={20}/>Editar</button></div>
  <section className="group"><div className="group-head"><h2 className="group-title">Visitas</h2><span className="muted num">{visitas.length}{expediente.total_visitas_programadas?` de ${expediente.total_visitas_programadas}`:''}</span></div>
   {sorted.length?<div className="list">{sorted.map(item=>{const state=visitState[item.estado];const {done,total}=checklistDone(item);return <button className="row" key={item.id} onClick={()=>onOpenVisit(item)}><span className="row-num">{pad2(item.nro_visita)}</span><span className="row-main"><strong>{dateLabel(item.fecha)}</strong><span>{item.estado==='FINALIZADA'?'Abrir informe':`Checklist ${done} de ${total}`}</span></span><span className={`badge ${state.tone}`}>{state.label}</span><Icon name="chevron" size={20}/></button>})}</div>
    :<p className="list-empty">Aún no hay visitas. La primera copia la cabecera y el checklist del expediente.</p>}
  </section>
  <section className="group"><div className="group-head"><h2 className="group-title">Datos</h2><button className="link-button" onClick={onEdit}>Completar</button></div>
   <dl className="list facts">{facts.map(([label,value])=><div className="fact" key={label}><dt>{label}</dt><dd className={value?'':'missing'}>{value||'—'}</dd></div>)}</dl>
  </section>
 </div>;
}

type SaveState='idle'|'pending'|'saving'|'saved'|'error';
function SaveIndicator({state}:{state:SaveState}){
 if(state==='error')return <span className="save-state error" role="alert"><Icon name="alert" size={16}/>No se pudo guardar</span>;
 if(state==='pending'||state==='saving')return <span className="save-state saving" role="status"><span className="spinner"/>Guardando</span>;
 return <span className="save-state" role="status"><Icon name="check" size={16}/>{state==='saved'?'Guardado':'Se guarda solo'}</span>;
}
function VisitChecklist({visita,expediente,ownerId,onBack,onSave,onEditReport}:{visita:Visita;expediente:Expediente;ownerId:string;onBack:()=>void;onSave:(record:Visita)=>Promise<void>;onEditReport:()=>void}){
 const [answers,setAnswers]=useState(visita.checklist_respuestas_json),[saveState,setSaveState]=useState<SaveState>('idle');
 const [tab, setTab] = useState<'checklist'|'captura'|'resumen'>('checklist');
 const fields=visita.checklist_esquema_json.sections.flatMap(section=>section.fields),answered=fields.filter(field=>isAnswered(answers[field.id])).length,progress=fields.length?Math.round(answered/fields.length*100):0;
 const native=Capacitor.isNativePlatform();
 const cam=native&&tab==='captura';
 const tabOrder=['checklist','captura','resumen'] as const;
 const touch=useRef<{x:number;y:number}|null>(null);
 // Guardado automático: cada respuesta se guarda en el dispositivo ~0,6 s después del último cambio,
 // y lo pendiente se guarda al salir de la visita (volver, ir al informe, cerrar la vista).
 const dirty=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
 const latest=useRef({visita,answers,onSave});
 useEffect(()=>{latest.current={visita,answers,onSave}});
 const flush=useCallback(async(extra?:Partial<Visita>)=>{
  clearTimeout(timer.current);
  if(!dirty.current&&!extra)return true;
  dirty.current=false;
  const {visita:v,answers:a,onSave:save}=latest.current;
  const all=v.checklist_esquema_json.sections.flatMap(s=>s.fields);
  setSaveState('saving');
  try{await save({...v,...extra,checklist_respuestas_json:a,checklist_completado:all.every(f=>isAnswered(a[f.id])),updated_at:new Date().toISOString()});setSaveState('saved');return true}
  catch(e){console.error(e);dirty.current=true;setSaveState('error');return false}
 },[]);
 useEffect(()=>{if(!dirty.current)return;clearTimeout(timer.current);timer.current=setTimeout(()=>void flush(),600);return()=>clearTimeout(timer.current)},[answers,flush]);
 useEffect(()=>()=>{if(dirty.current)void flush()},[flush]);
 function answer(id:string,value:unknown){dirty.current=true;setSaveState('pending');setAnswers(current=>({...current,[id]:value}))}
 // Captura no scrollea: el scroll vive en el documento, se resetea antes del paint.
 useLayoutEffect(()=>{if(!cam)return;const sc=document.scrollingElement;if(sc)sc.scrollTop=0;window.scrollTo(0,0);},[cam]);
 function swipeEnd(e:React.TouchEvent){
  const s=touch.current;touch.current=null;if(!s)return;
  const t=e.changedTouches[0],dx=t.clientX-s.x,dy=t.clientY-s.y;
  if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.5){
   const i=tabOrder.indexOf(tab);
   setTab(dx<0?tabOrder[Math.min(2,i+1)]:tabOrder[Math.max(0,i-1)]);
  }
 }
 return <div className={native?(cam?'visit-shell visit-native cam':'visit-shell visit-native'):'visit-shell'}>
  <div className="visit-top">
   <header className="visit-header">
    <button className="back-button" onClick={onBack} aria-label="Volver al expediente"><Icon name="back"/></button>
    <div className="visit-title"><h1>{obraTitle(expediente)}</h1><p>Visita {pad2(visita.nro_visita)} · {shortDate(visita.fecha)}</p></div>
    {visita.estado==='FINALIZADA'?<button className="btn btn-secondary btn-sm" onClick={onEditReport}><Icon name="file" size={18}/>Informe</button>:<SaveIndicator state={saveState}/>}
   </header>
   <nav className="visit-tabs" aria-label="Pasos de la visita">
    <button className={`visit-tab ${tab==='checklist'?'active':''}`} aria-current={tab==='checklist'?'step':undefined} onClick={()=>setTab('checklist')}><span>Checklist</span><small className="num">{answered}/{fields.length}</small></button>
    <button className={`visit-tab ${tab==='captura'?'active':''}`} aria-current={tab==='captura'?'step':undefined} onClick={()=>setTab('captura')}><span>Fotos y voz</span></button>
    <button className={`visit-tab ${tab==='resumen'?'active':''}`} aria-current={tab==='resumen'?'step':undefined} onClick={()=>setTab('resumen')}><span>Cerrar</span></button>
   </nav>
  </div>
  <section className={cam?'visit-body capture-active':'visit-body'} onTouchStart={native?(e=>{const t=e.touches[0];touch.current={x:t.clientX,y:t.clientY}}):undefined} onTouchEnd={native?swipeEnd:undefined}>
   <div className="checklist" style={{display:tab==='checklist'?'':'none'}}>
    <div className="progress-head"><div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Avance del checklist"><i style={{width:`${progress}%`}}/></div><span className="num">{answered} de {fields.length}</span></div>
    {visita.checklist_esquema_json.sections.map(section=>{const done=section.fields.filter(f=>isAnswered(answers[f.id])).length;return <section className="group" key={section.id}><div className="group-head"><h2 className="group-title">{section.title}</h2><span className="muted num">{done}/{section.fields.length}</span></div><div className="list">{section.fields.map(field=><div className={`check-item ${field.type==='text'?'wide':''}`} key={field.id}><div className="check-label"><strong id={`q-${field.id}`}>{field.label}{field.required&&<span className="required" aria-label="obligatorio"> *</span>}</strong>{field.description&&<small>{field.description}</small>}</div>{field.type==='boolean'?<div className="segmented" role="group" aria-labelledby={`q-${field.id}`}>{[['si','Sí',''],['no','No','no'],['na','N.A.','na']].map(([value,label,tone])=><button key={value} className={tone} aria-pressed={answers[field.id]===value} onClick={()=>answer(field.id,answers[field.id]===value?'':value)}>{label}</button>)}</div>:field.type==='text'?<textarea className="field" rows={3} aria-labelledby={`q-${field.id}`} placeholder="Escribe aquí" value={String(answers[field.id]??'')} onChange={e=>answer(field.id,e.target.value)}/>:<input className="field inline-field" aria-labelledby={`q-${field.id}`} type={field.type} inputMode={field.type==='number'?'decimal':undefined} value={String(answers[field.id]??'')} onChange={e=>answer(field.id,e.target.value)}/>}</div>)}</div></section>})}
    <button className="btn btn-secondary btn-block next-step" onClick={()=>{setTab('captura');window.scrollTo({top:0})}}>Siguiente: fotos y voz<Icon name="chevron" size={20}/></button>
   </div>
   <div style={{display:tab==='captura'?'':'none'}}><VisitCapture visita={visita} ownerId={ownerId} onGroupSaved={() => {}} active={tab==='captura'} /></div>
   <div style={{display:tab==='resumen'?'':'none'}}><VisitSummary visita={{...visita,checklist_respuestas_json:answers}} onEditReport={onEditReport} onConclude={async()=>{if(await flush({estado:'FINALIZADA'}))onEditReport()}} onGoChecklist={() => {setTab('checklist');window.scrollTo({top:0})}} /></div>
  </section>
 </div>;
}

function Templates({templates}:{templates:ChecklistTemplate[]}){return <div className="page">
 <header className="title-block"><h1>Plantillas</h1><p>Puntos de partida para el checklist de cada expediente. Se copian; ajustarlas no cambia el original.</p></header>
 <div className="list">{templates.map(template=><details className="disclosure-row" key={template.id}><summary><span className="row-icon"><Icon name="clipboard" size={20}/></span><span><strong>{template.nombre}</strong><small>{pointsLabel(fieldCount(template.esquema))}</small></span><Icon name="down" size={20}/></summary><div className="disclosure-body">{template.esquema.sections.map(section=><div key={section.id} className="tpl-section"><h3>{section.title}</h3><ol>{section.fields.map(field=><li key={field.id}><span>{field.label}</span><span className="field-type">{fieldTypeLabel[field.type]}</span></li>)}</ol></div>)}</div></details>)}</div>
</div>}

function ProfilePage({owner,session,state,onRefresh,onToast}:{owner:string;session:Session;state:LocalState;onRefresh:()=>Promise<void>;onToast:(text:string)=>void}){
 async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const data=new FormData(event.currentTarget);await saveProfile(local,owner,{nombre_completo:String(data.get('name')),cargo:String(data.get('role')),nro_colegiatura:String(data.get('license'))},crypto.randomUUID());await onRefresh();onToast('Perfil guardado')}
 return <div className="page narrow">
  <header className="title-block profile-head"><span className="avatar large">{initials(state.profile?.nombre_completo)}</span><div><h1>{state.profile?.nombre_completo||'Tu perfil'}</h1><p>{session.user.email}</p></div></header>
  {state.profile?<form className="form-stack" onSubmit={submit}>
   <section className="panel form-panel"><p className="panel-note">Así apareces como profesional responsable en los informes.</p><Field name="name" label="Nombre completo" required defaultValue={state.profile.nombre_completo}/><div className="form-grid"><Field name="role" label="Cargo" defaultValue={state.profile.cargo}/><Field name="license" label="Colegiatura (CAP)" defaultValue={state.profile.nro_colegiatura}/></div></section>
   <div className="form-actions"><button type="button" className="btn btn-ghost" onClick={()=>void supabase.auth.signOut({scope:'local'})}><Icon name="logout" size={20}/>Cerrar sesión</button><button className="btn btn-primary btn-lg">Guardar</button></div>
  </form>:<p className="muted">Cargando tus datos…</p>}
 </div>;
}
