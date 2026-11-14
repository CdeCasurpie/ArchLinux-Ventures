import { SyncStatus } from "./features/SyncStatus";
import { VisitSummary } from "./features/Summary";
import { SerialAutosave, type SaveStatus } from './features/serial-autosave';
import { SaveBarrier } from './features/save-barrier';
import {BackNavigation,BackButton} from './features/back-navigation';
import { transcriptionService } from "./features/transcription-service";
import { VisitCapture } from "./features/Capture";
import { VisitReport } from "./features/Report";
import { MediaSyncManager } from "./features/media-sync";
import { createDownloadService } from "./features/download-service";
import { VisitDownload } from "./features/VisitDownload";
import { TemplateLibrary, TemplateEditor, type TemplateEditorResult, type TemplateReturnDraft } from "./features/library";
import { ChecklistForm } from "./features/checklist";
import {mergeVisitEdit} from './features/merge-visit-edit';
import {useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState,type FormEvent} from 'react';
import {Capacitor} from '@capacitor/core';
import { App as NativeApp } from '@capacitor/app';
import type {Session} from '@supabase/supabase-js';
import {buildExpediente,buildVisita,buildTemplateFromExpediente,workspaceOperation,WorkspaceSyncEngine,SyncEngine,SyncCoordinator} from '@archforms/application';
import {SupabaseProfileRepository,SupabaseWorkspaceRepository} from '@archforms/data-supabase';
import {checklistStats,withAvanceObra,type ChecklistSchema,ChecklistTemplate,Expediente,LocalState,Visita,WorkspaceState} from '@archforms/domain';
import {supabase,local,workspaceLocal,mediaOutbox,configured} from './platform';
import {ProfilePage as SignatureProfilePage} from './features/ProfilePage';
import {ProfileSignerContext} from './features/profile-signer';
import {ExpedienteDetail} from './features/ExpedienteDetail';
import {deleteVisitCapture} from './features/lab-storage';
import {visitDocument} from './features/visit-document';
import {informeFileName} from '@archforms/domain';
import {Directory,Filesystem} from '@capacitor/filesystem';

/** Lupa del buscador: el glifo ⌕ no está en todas las fuentes. */
function SearchIcon(){
 return <span className="search-glyph" aria-hidden="true">
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
   <circle cx="7" cy="7" r="4.4" stroke="currentColor" strokeWidth="1.6"/>
   <path d="M10.4 10.4 14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
  </svg>
 </span>;
}

type View='dashboard'|'expedientes'|'crear'|'detalle'|'visita'|'informe'|'plantillas'|'perfil';
type NavigationFrame={view:View;selectedId:string|null;visitId:string|null;scroll:number};
type NavigationOptions={allowDirty?:boolean;visitId?:string;restoreIndex?:number};
function restoredNavigation(owner:string):{frames:NavigationFrame[];index:number}{
 try{
  const parsed=JSON.parse(sessionStorage.getItem(`archforms-navigation:${owner}`)??'null');
  const views:View[]=['dashboard','expedientes','crear','detalle','visita','informe','plantillas','perfil'];
  if(parsed&&Array.isArray(parsed.frames)&&Number.isInteger(parsed.index)&&parsed.index>=0&&parsed.index<parsed.frames.length&&parsed.frames.every((frame:NavigationFrame)=>frame&&views.includes(frame.view)&&(frame.selectedId===null||typeof frame.selectedId==='string')&&(frame.visitId===null||typeof frame.visitId==='string')&&Number.isFinite(frame.scroll)))return parsed;
 }catch{/* El historial es auxiliar: una entrada inválida no bloquea los datos locales. */}
 return {frames:[{view:'dashboard',selectedId:null,visitId:null,scroll:0}],index:0};
}
const blankWorkspace:WorkspaceState={expedientes:[],visitas:[],plantillas:[],pending:[],last_sync:null};
const fallbackTemplates:ChecklistTemplate[]=[
  {id:'local-g050',codigo:'G050',nombre:'Verificación técnica · G.050',version:1,profesional_id:null,esquema:{version:2,sections:[{id:'documentos',title:'Exigencias obligatorias en obra',fields:[{id:'licencia',label:'Licencia de edificación disponible',description:'Documento vigente en obra',type:'boolean',required:true},{id:'planos',label:'Planos aprobados y resellados',type:'boolean'},{id:'cuaderno',label:'Cuaderno de obra actualizado',type:'boolean'},{id:'epi',label:'Personal con EPP completo',type:'boolean'},{id:'orden',label:'Orden y limpieza en zona de trabajo',type:'boolean'},{id:'observacion',label:'Observaciones de la plantilla',type:'textarea'}]}]}},
 {id:'local-supervision',codigo:'SUPERVISION',nombre:'Supervisión general de obra',version:1,profesional_id:null,esquema:{version:2,sections:[{id:'avance',title:'Avance y calidad',fields:[{id:'calidad',label:'Trabajos ejecutados según planos',type:'boolean'},{id:'seguridad',label:'Condiciones de seguridad adecuadas',type:'boolean'},{id:'observaciones',label:'Observaciones técnicas',type:'textarea'}]}]}},
  {id:'local-vacio',codigo:'VACIO',nombre:'Plantilla básica',version:1,profesional_id:null,esquema:{version:2,sections:[{id:'general',title:'Verificación general',fields:[{id:'observaciones',label:'Observaciones de la visita',type:'textarea'}]}]}}
];
const msg=(error:unknown)=>error instanceof Error?error.message:String(error);
const initials=(name?:string)=>name?.split(/\s+/).slice(0,2).map(word=>word[0]).join('').toUpperCase()||'AF';
const dateLabel=(value:string)=>new Intl.DateTimeFormat('es-PE',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(`${value}T12:00:00`));

export function App(){
 const [session,setSession]=useState<Session|null>(null),[loading,setLoading]=useState(true);
 const [startupError,setStartupError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{
  let active=true;
  setLoading(true);setStartupError('');
  const timeout=setTimeout(()=>{if(active){setLoading(false);setStartupError('No se pudo recuperar la sesión. Comprueba la conexión y reintenta.')}},12000);
  void supabase.auth.getSession().then(({data,error})=>{
   if(!active)return;
   clearTimeout(timeout);setLoading(false);
   if(error){setStartupError(msg(error));return}
   setStartupError('');setSession(data.session);
  }).catch(error=>{if(active){clearTimeout(timeout);setLoading(false);setStartupError(msg(error))}});
   const {data}=supabase.auth.onAuthStateChange((_event,next)=>{if(active){clearTimeout(timeout);setStartupError('');setSession(next);setLoading(false)}});
  return()=>{active=false;clearTimeout(timeout);data.subscription.unsubscribe()};
 },[attempt]);
 if(!configured)return <main className="auth simple"><h1>Configura ArchForms</h1><p>Falta la conexión Supabase de este entorno.</p></main>;
 if(loading)return <main className="auth simple"><p>Abriendo tu espacio…</p></main>;
  if(startupError)return <main className="auth simple"><p role="alert">{startupError}</p><button className="btn btn-primary" onClick={()=>setAttempt(value=>value+1)}>Reintentar</button><button className="btn btn-secondary" onClick={()=>{setSession(null);setStartupError('')}}>Volver al inicio de sesión</button><p>Los datos locales no se han eliminado.</p></main>;
 return session?<Workspace key={session.user.id} session={session}/>:<Auth/>;
}

function Brand({mobile=false}:{mobile?:boolean}){return <span className={mobile?'mobile-brand':'brand'}><img src="/archforms-mark.png" alt=""/><span><strong>ARCH</strong>FORMS</span></span>}
function Auth(){
 const [register,setRegister]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  async function submit(event:FormEvent<HTMLFormElement>){
   event.preventDefault();setBusy(true);setError('');setNotice('');
   const data=new FormData(event.currentTarget),email=String(data.get('email')),password=String(data.get('password'));
   try{const result=register?await supabase.auth.signUp({email,password,options:{data:{nombre_completo:String(data.get('name'))}}}):await supabase.auth.signInWithPassword({email,password});if(result.error)setError(result.error.message);else if(register&&!result.data.session)setNotice('Revisa tu correo para confirmar la cuenta.')}
   catch(error){setError(msg(error))}finally{setBusy(false)}
  }
  return <div className="auth-layout"><section className="auth-story"><Brand/><span className="eyebrow">DE LA OBRA AL INFORME</span><h1>Tu visita de obra,<br/><em>lista antes de llegar a casa.</em></h1><p>Captura evidencias, completa plantillas y conserva todo tu trabajo en un mismo lugar.</p></section><main className="auth"><span className="eyebrow">BIENVENIDO A ARCHFORMS</span><h2>{register?'Crea tu espacio':'Qué bueno verte.'}</h2><p>Ingresa para continuar con tu trabajo.</p><form onSubmit={submit}>{register&&<label>Nombre completo<input className="field" name="name" required minLength={2} autoComplete="name" placeholder="Nombre y apellido"/></label>}<label>Correo electrónico<input className="field" name="email" type="email" required autoComplete="email" placeholder="tucorreo@ejemplo.com"/></label><label>Contraseña<input className="field" name="password" type="password" minLength={8} required autoComplete="current-password" placeholder="Mínimo 8 caracteres"/></label>{error&&<div className="alert error">{error}</div>}{notice&&<div className="alert notice">{notice}</div>}<button className="btn btn-primary btn-lg" disabled={busy}>{busy?'Un momento…':register?'Crear cuenta':'Entrar a mi espacio'} →</button></form><button className="text-button" onClick={()=>setRegister(!register)}>{register?'Ya tengo cuenta':'Crear una cuenta'}</button></main></div>;
}

function Workspace({session}:{session:Session}){
 const owner=session.user.id;
 const initialNavigation=useMemo(()=>restoredNavigation(owner),[owner]);
 const initialFrame=initialNavigation.frames[initialNavigation.index];
 const saveBarrier=useMemo(()=>new SaveBarrier(),[owner]);
 const [view,setView]=useState<View>(initialFrame.view),[profile,setProfile]=useState<LocalState>({profile:null,pending:null}),[data,setData]=useState<WorkspaceState>(blankWorkspace);
 const [selectedId,setSelectedId]=useState<string|null>(initialFrame.selectedId),[visitId,setVisitId]=useState<string|null>(initialFrame.visitId),[online,setOnline]=useState(navigator.onLine),[syncing,setSyncing]=useState(false),[error,setError]=useState(''),[toast,setToast]=useState('');
 const [creatingVisit,setCreatingVisit]=useState(false),[publishing,setPublishing]=useState(false);
 const [syncError,setSyncError]=useState('');
 // Hilo C: borrador del expediente mientras se crea una plantilla en la
 // biblioteca. El retorno automático solo existe si se vino desde el expediente.
 const [templateReturn,setTemplateReturn]=useState<TemplateReturnDraft|null>(null);
 // La copia del expediente exige «Guardar cambios»: si se intenta salir con
 // cambios pendientes, se ofrece guardar o descartar explícitamente.
  const [expedienteDirty,setExpedienteDirty]=useState(false),[pendingNavigation,setPendingNavigation]=useState<{next:View;id?:string;options?:NavigationOptions}|null>(null);
  const navigation=useRef(initialNavigation);
  const navigateRef=useRef<(next:View,id?:string,options?:NavigationOptions)=>Promise<void>>(async()=>{});
  const localWrites=useRef<Promise<void>>(Promise.resolve());
  const [hydrated,setHydrated]=useState(false);
 const saveExpedienteRef=useRef<(()=>void)|null>(null);
 const registerExpedienteSave=useCallback((save:(()=>void)|null)=>{saveExpedienteRef.current=save},[]);
 const remote=useMemo(()=>new SupabaseWorkspaceRepository(supabase),[]),engine=useMemo(()=>new WorkspaceSyncEngine(workspaceLocal,remote,owner),[remote,owner]);
 const profileRemote=useMemo(()=>new SupabaseProfileRepository(supabase),[]),profileEngine=useMemo(()=>new SyncEngine(local,profileRemote,owner),[profileRemote,owner]);
 const mediaSyncManager=useMemo(()=>new MediaSyncManager(mediaOutbox,owner),[owner]);
 const downloadService=useMemo(()=>createDownloadService(owner),[owner]);
 const selected=data.expedientes.find(item=>item.id===selectedId)??null,visit=data.visitas.find(item=>item.id===visitId)??null;
 const numberProvisional=Boolean(visit&&data.pending.some(op=>op.entity==='visita'&&op.record.id===visit.id&&(op.workspace_mutation?.type==='create'||(!op.workspace_mutation&&!op.answer_patch))));
  async function refresh(){setData(await workspaceLocal.read(owner));setProfile(await local.read(owner));setHydrated(true)}
  useLayoutEffect(()=>{if(hydrated)window.scrollTo(0,initialFrame.scroll)},[hydrated]);
  useEffect(()=>{
    let timer:ReturnType<typeof setTimeout>|undefined;
    const scroll=()=>{clearTimeout(timer);timer=setTimeout(()=>{navigation.current.frames[navigation.current.index].scroll=window.scrollY;sessionStorage.setItem(`archforms-navigation:${owner}`,JSON.stringify(navigation.current))},150)};
    window.addEventListener('scroll',scroll,{passive:true});return()=>{clearTimeout(timer);window.removeEventListener('scroll',scroll)};
  },[owner]);
 const coordinator=useMemo(()=>new SyncCoordinator([
  {name:'Datos',run:()=>engine.run()},
  {name:'Perfil',run:()=>profileEngine.run()},
  {name:'Multimedia',background:true,run:()=>mediaSyncManager.sync()},
  {name:'Descargas',background:true,run:()=>downloadService.run()},
  {name:'Actualizar dispositivo',run:refresh},
 ],()=>navigator.onLine),[engine,profileEngine,mediaSyncManager,downloadService,owner]);
 async function sync(){await coordinator.request()}
 async function retrySync(){await workspaceLocal.retryPending(owner);await coordinator.request()}
 useEffect(()=>{
  let disposed=false;
  void refresh().catch(error=>setError(msg(error)));
  const unsubscribe=coordinator.subscribe(state=>{setSyncing(state.running);setSyncError(state.error??'')});
  const network=()=>{setOnline(navigator.onLine);if(navigator.onLine)void coordinator.request()};
  const foreground=()=>{if(document.visibilityState==='visible')void coordinator.request()};
  window.addEventListener('online',network);
  window.addEventListener('offline',network);
  document.addEventListener('visibilitychange',foreground);
  let removeNative:(()=>void)|undefined;
  void NativeApp.addListener('appStateChange',({isActive})=>{if(isActive)void coordinator.request()}).then(handle=>{
   if(disposed)void handle.remove();else removeNative=()=>{void handle.remove()};
  }).catch(console.error);
  coordinator.start();
  return()=>{disposed=true;coordinator.stop();unsubscribe();removeNative?.();window.removeEventListener('online',network);window.removeEventListener('offline',network);document.removeEventListener('visibilitychange',foreground)};
 },[coordinator]);
  // Account-scoped executors share the coordinator's lifecycle and reconnect events.
 useEffect(()=>{mediaSyncManager.start(()=>coordinator.request());void downloadService.start().catch(console.error);transcriptionService.start();return()=>{mediaSyncManager.stop();downloadService.stop()}},[mediaSyncManager,downloadService,coordinator]);
 useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(''),2600);return()=>clearTimeout(timer)},[toast]);
  async function proceed(next:View,id?:string,options?:NavigationOptions){
    try{await saveBarrier.flush()}catch(error){setError(msg(error));return}
    const history=navigation.current;
    history.frames[history.index]={view,selectedId,visitId,scroll:window.scrollY};
    const restored=options?.restoreIndex===undefined?undefined:history.frames[options.restoreIndex];
    const frame=restored??{view:next,selectedId:next==='crear'?(id??null):(id??selectedId),visitId:options?.visitId??visitId,scroll:0};
    if(restored){history.index=options!.restoreIndex!;window.history.replaceState({archforms:owner,index:history.index},'')}
    else{history.frames=history.frames.slice(0,history.index+1);history.frames.push(frame);history.index++;window.history.pushState({archforms:owner,index:history.index},'')}
    // Salir del circuito expediente↔plantillas descarta el borrador pendiente.
    if(next!=='plantillas'&&next!=='crear')setTemplateReturn(null);
    // «Nuevo expediente» nunca reabre el seleccionado; editar pasa el id explícito.
    setSelectedId(frame.selectedId);setVisitId(frame.visitId);setView(frame.view);
    sessionStorage.setItem(`archforms-navigation:${owner}`,JSON.stringify(history));
    requestAnimationFrame(()=>window.scrollTo({top:frame.scroll,behavior:'instant'}));
  }
  async function navigate(next:View,id?:string,options?:NavigationOptions){
    if(view==='plantillas'&&templateReturn?.dirty&&!['crear','plantillas'].includes(next)&&!options?.allowDirty){
      await proceed('crear',templateReturn.existing?.id);setPendingNavigation({next,id,options});return;
    }
    if(view==='crear'&&expedienteDirty&&!options?.allowDirty){setPendingNavigation({next,id,options});return}
    await proceed(next,id,options);
  }
  navigateRef.current=navigate;
  useEffect(()=>{
    if(view!=='plantillas'||!templateReturn?.dirty)return;
    const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''};
    window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);
  },[view,templateReturn?.dirty]);
  async function goBack(){if(navigation.current.index>0)window.history.back();else await navigate('dashboard')}
  useEffect(()=>{
    window.history.replaceState({archforms:owner,index:navigation.current.index},'');
    const back=(event:PopStateEvent)=>{
      const target=event.state;
      if(target?.archforms!==owner||!Number.isInteger(target.index))return;
      if(target.index===navigation.current.index)return;
      const frame=navigation.current.frames[target.index];if(!frame)return;
      const previous=navigation.current.index;
      void navigateRef.current(frame.view,frame.selectedId??undefined,{restoreIndex:target.index,visitId:frame.visitId??undefined}).then(()=>{
        if(navigation.current.index===previous&&previous!==target.index)window.history.go(previous-target.index);
      });
    };
    window.addEventListener('popstate',back);
    let remove:(()=>void)|undefined;
    let disposed=false;
    void NativeApp.addListener('backButton',()=>{if(navigation.current.index>0)window.history.back();else void NativeApp.minimizeApp()}).then(handle=>{if(disposed)void handle.remove();else remove=()=>{void handle.remove()}}).catch(console.error);
    return()=>{disposed=true;remove?.();window.removeEventListener('popstate',back)};
  },[owner]);
  function discardExpedienteDraft(){
    const pending=pendingNavigation;
    setPendingNavigation(null);setExpedienteDirty(false);setTemplateReturn(null);
    if(pending?.options?.restoreIndex!==undefined){window.history.go(pending.options.restoreIndex-navigation.current.index);return}
    if(pending)void proceed(pending.next,pending.id,pending.options);
  }
  function serialLocal(write:()=>Promise<void>){const task=localWrites.current.then(write);localWrites.current=task.catch(()=>{});return task}
  async function queue(entity:'expediente'|'visita'|'plantilla',record:Expediente|Visita|ChecklistTemplate){
   const base=entity==='visita'?data.visitas.find(v=>v.id===record.id):undefined;
   await serialLocal(async()=>{
    let next=record;
    if(base){const latest=(await workspaceLocal.read(owner)).visitas.find(v=>v.id===record.id);if(latest)next=mergeVisitEdit(base,record as Visita,latest)}
    await workspaceLocal.save(owner,workspaceOperation(entity,next));
    // Un esquema nuevo puede añadir obligatorios sin cambiar respuestas. El patch
    // vacío recalcula completitud local y remota usando el protocolo existente.
    if(base&&JSON.stringify(base.checklist_esquema_json)!==JSON.stringify((next as Visita).checklist_esquema_json))await workspaceLocal.saveAnswers(owner,record.id,{});
    await refresh();
   });
    if(navigator.onLine)void sync();
  }
  async function queueAnswers(id:string,patch:Record<string,string|number|null>){await serialLocal(async()=>{await workspaceLocal.saveAnswers(owner,id,patch);await refresh()});if(navigator.onLine)void sync()}
  async function deleteRecords(entity:'expediente'|'visita',ids:string[]){
   await saveBarrier.flush();
   const state=await workspaceLocal.read(owner);
   const visits=state.visitas.filter(v=>entity==='expediente'?ids.includes(v.expediente_id):ids.includes(v.id));
   await mediaSyncManager.pause();
   try{await downloadService.remove(visits.map(v=>v.id));await serialLocal(async()=>{
    for(const id of ids){
     const record=(entity==='expediente'?state.expedientes:state.visitas).find(row=>row.id===id);if(!record)continue;
     await workspaceLocal.save(owner,{...workspaceOperation(entity,record),workspace_mutation:{type:'delete',payload:{}}});
    }
    await mediaOutbox.removeVisits?.(visits.map(v=>v.id));
    for(const visita of visits){
     await deleteVisitCapture(visita.id);
     const expediente=state.expedientes.find(e=>e.id===visita.expediente_id);
     if(expediente&&Capacitor.isNativePlatform())await Filesystem.deleteFile({path:`ArchForms/${informeFileName(expediente,visita)}`,directory:Directory.Documents}).catch(()=>undefined);
     sessionStorage.removeItem(`archforms-tab:${owner}:${visita.id}`);
    }
    await refresh();
   })}finally{mediaSyncManager.start(()=>coordinator.request());void downloadService.start().catch(console.error)}
   if(entity==='expediente')await navigate('expedientes');
   setToast(entity==='expediente'?'Expediente eliminado':'Visitas eliminadas');
   if(navigator.onLine)void sync();
  }
  async function newVisit(expediente:Expediente){
  // Guardia anti-doble-tap + lectura fresca del storage (el estado React puede
  // estar desactualizado ante toques rápidos y calcularía el mismo nro_visita).
  if(creatingVisit)return;
  setCreatingVisit(true);
   try{
    await saveBarrier.flush();
   const ws=await workspaceLocal.read(owner);
   const current=ws.visitas.filter(item=>item.expediente_id===expediente.id),next=Math.max(0,...current.map(item=>item.nro_visita))+1;
   const created=buildVisita(expediente,next,new Date().toISOString().slice(0,10));
   await queue('visita',created);await navigate('visita',expediente.id,{visitId:created.id});
   }catch(error){setError(msg(error))}finally{setCreatingVisit(false)}
 }
  // Conservado para compatibilidad; la publicación ya no tiene acceso en la interfaz.
  // oxlint-disable-next-line no-unused-vars
  async function publishChecklist(expediente:Expediente){
  if(publishing)return;
  setPublishing(true);
  try{
   await queue('plantilla',buildTemplateFromExpediente(owner,expediente));
   setToast('Plantilla publicada · los expedientes existentes no cambian');
  }catch(error){setError(msg(error))}finally{setPublishing(false)}
 }
 const templates=useMemo(()=>{
  // Fallback de plataforma siempre disponible (G050/SUPERVISION/VACIO), incluso sin conexión.
  const known=new Set(data.plantillas.map(item=>item.codigo));
  return [...data.plantillas,...fallbackTemplates.filter(item=>!known.has(item.codigo))];
 },[data.plantillas]);
 // «Uso reciente»: checklists de las visitas más recientes (fecha desc). Sin
 // historial → tres predeterminadas de plataforma. El ancla (plantilla recién
 // creada/editada en el retorno desde el expediente) encabeza la lista.
 const recientes=useMemo(()=>{
  const byId=new Map(templates.map(item=>[item.id,item]));
  const ids:string[]=[];
  if(templateReturn?.anchor&&byId.has(templateReturn.anchor))ids.push(templateReturn.anchor);
  const recentVisits=[...data.visitas].sort((a,b)=>b.fecha.localeCompare(a.fecha)||b.created_at.localeCompare(a.created_at));
  for(const visita of recentVisits){
   const id=visita.checklist_template_id??templates.find(item=>item.nombre===visita.checklist_nombre)?.id;
   if(id&&byId.has(id)&&!ids.includes(id))ids.push(id);
   if(ids.length>=3)break;
  }
  for(const item of [...templates.filter(t=>t.profesional_id===null),...templates]){
   if(ids.length>=3)break;
   if(!ids.includes(item.id))ids.push(item.id);
  }
  return ids.slice(0,3).map(id=>byId.get(id)!).filter(Boolean);
 },[templates,data.visitas,templateReturn?.anchor]);
 // Hilo C: el usuario del expediente abre la biblioteca; el borrador viaja íntegro.
 function leaveToLibrary(payload:{values:Record<string,string>;schema:ChecklistSchema;checklistName:string;templateId:string|null;dirty:boolean}){
  setTemplateReturn({...payload,existing:selected,anchor:null});
  void navigate('plantillas',undefined,{allowDirty:true});
 }
 // Retorno automático: la plantilla recién creada queda seleccionada y anclada.
 function finishTemplateReturn(template:ChecklistTemplate){
  setTemplateReturn(ctx=>ctx&&{...ctx,schema:structuredClone(template.esquema),checklistName:template.nombre,templateId:template.id,anchor:template.id,dirty:true});
  void navigate('crear',templateReturn?.existing?.id);
 }
  const title={dashboard:'Inicio',expedientes:'Expedientes',crear:'Nuevo expediente',detalle:selected?.nro_expediente??'Expediente',visita:visit?`Visita ${String(visit.nro_visita).padStart(2,'0')}`:'Visita',informe:visit?`Informe V${String(visit.nro_visita).padStart(2,'0')}`:'Informe',plantillas:'Biblioteca de plantillas',perfil:'Mi perfil'}[view];
  const counts={cases:data.expedientes.filter(item=>item.activo).length,drafts:data.visitas.filter(item=>item.estado==='BORRADOR').length};
  const syncProps={online,running:syncing,pending:data.pending.length+(profile.pending?1:0),error:syncError,onRetry:()=>void retrySync()};
  if(!hydrated)return <main className="auth simple">{error?<><p role="alert">No se pudieron abrir los datos locales: {error}</p><button className="btn btn-secondary" onClick={()=>void refresh().catch(error=>setError(msg(error)))}>Reintentar apertura</button></>:<p role="status">Abriendo datos del dispositivo…</p>}</main>;
  return <ProfileSignerContext.Provider value={profile.profile?{id:owner,nombre:profile.profile.nombre_completo,cargo:profile.profile.cargo??'',colegiatura:profile.profile.nro_colegiatura??'',image:profile.profile.firma_imagen??undefined}:undefined}><BackNavigation><div className="app-shell"><aside className="sidebar">
  <button className="brand-button" onClick={()=>navigate('dashboard')}><Brand/></button>
  <nav className="sidebar-nav"><Nav active={view==='dashboard'} icon="⌂" onClick={()=>navigate('dashboard')}>Inicio</Nav><Nav active={['expedientes','crear','detalle'].includes(view)} icon="▤" count={counts.cases} onClick={()=>navigate('expedientes')}>Expedientes</Nav><Nav active={view==='plantillas'} icon="✓" onClick={()=>navigate('plantillas')}>Plantillas</Nav></nav>
  <div className="sidebar-spacer"/><div className="sidebar-sync"><SyncStatus {...syncProps}/></div>
  <button className="profile-card" onClick={()=>navigate('perfil')}><span className="avatar">{initials(profile.profile?.nombre_completo)}</span><span><strong>{profile.profile?.nombre_completo||'Profesional'}</strong><small>{profile.profile?.cargo||session.user.email}</small></span><b>•••</b></button>
 </aside><section className="app-area">
  <header className={`topbar${view==='visita'?' topbar--visit':''}`}><div className="topbar-location">
   {view!=='dashboard'?<><BackButton onBack={goBack}/><span className="mobile-page-title">{title}</span></>:<button className="mobile-brand-button" onClick={()=>navigate('dashboard')}><Brand mobile/></button>}
   <div className="breadcrumbs">Mi espacio <i>›</i> <b>{title}</b></div>
  </div><div className="topbar-actions"><div className="mobile-sync"><SyncStatus {...syncProps}/></div><button className="top-avatar" onClick={()=>navigate('perfil')}>{initials(profile.profile?.nombre_completo)}</button></div></header>
  <main className="main-content">
   {visit&&['visita','informe'].includes(view)&&<VisitDownload key={`download-${visit.id}`} visitaId={visit.id} queue={downloadService}/>}
    <div hidden className="sync-error-details">{syncError}</div>
   {error&&<div className="alert error">{error}</div>}
   {view==='dashboard'&&<Dashboard data={data} profile={profile} onNavigate={navigate} onOpen={id=>navigate('detalle',id)}/>}
   {view==='expedientes'&&<Expedientes owner={owner} data={data} onNavigate={navigate}/>}
    {view==='crear'&&<ExpedienteForm key={`${selectedId??'new'}:${navigation.current.index}`} owner={owner} templates={templates} recientes={recientes} existing={selected} draft={templateReturn} onDirtyChange={setExpedienteDirty} onRegisterSave={registerExpedienteSave} onLeaveToLibrary={leaveToLibrary} onSave={async record=>{await queue('expediente',record);setTemplateReturn(null);setExpedienteDirty(false);await navigate('detalle',record.id,{allowDirty:true})}}/>}
    {view==='detalle'&&selected&&<ExpedienteDetail key={selected.id} expediente={selected} visitas={data.visitas.filter(item=>item.expediente_id===selected.id)} onEdit={()=>navigate('crear',selected.id)} onVisit={()=>void newVisit(selected)} onDelete={deleteRecords} creating={creatingVisit} onOpenVisit={id=>navigate('visita',selected.id,{visitId:id})} onEditReport={id=>navigate('informe',selected.id,{visitId:id})}/>}
    {view==='visita'&&visit&&selected&&<VisitChecklist provisional={numberProvisional} saveBarrier={saveBarrier} key={visit.id} onDownload={()=>downloadService.request(visit.id,100)} onSaveAnswers={queueAnswers} visita={visit} expediente={selected} ownerId={owner} onSave={record=>queue('visita',record)} onEditReport={()=>navigate('informe')}/>}
    {view==='informe'&&visit&&selected&&<div className={Capacitor.isNativePlatform()?'visit-shell':'page-enter visit-shell'}><header className="visit-header"><div className="visit-title"><div><h1>Informe · Visita {String(visit.nro_visita).padStart(2,'0')}</h1><p>Exp. {selected.nro_expediente} · {dateLabel(visit.fecha)}</p></div></div></header><section className="visit-body"><VisitReport key={visit.id} provisional={numberProvisional} visita={visit} expediente={selected} profile={profile.profile} ownerId={owner} onSave={record=>queue('visita',record)} onSaveAnswers={queueAnswers} saveBarrier={saveBarrier}/></section></div>}
    {view==='plantillas'&&<TemplateLibrary owner={owner} templates={templates} pending={data.pending} returning={Boolean(templateReturn)} onSave={template=>queue('plantilla',template)} onReturn={finishTemplateReturn}/>}
    {view==='perfil'&&<SignatureProfilePage owner={owner} session={session} state={profile} onRefresh={async()=>{await refresh();if(navigator.onLine)void sync()}} onToast={setToast}/>}
  </main></section></div>
 <nav className="mobile-nav"><Nav active={view==='dashboard'} icon="⌂" onClick={()=>navigate('dashboard')}>Inicio</Nav><Nav active={['expedientes','detalle'].includes(view)} icon="▤" onClick={()=>navigate('expedientes')}>Expedientes</Nav><button className="mobile-create" onClick={()=>navigate('crear')}><span>＋</span></button><Nav active={view==='plantillas'} icon="✓" onClick={()=>navigate('plantillas')}>Plantillas</Nav><Nav active={view==='perfil'} icon="◎" onClick={()=>navigate('perfil')}>Perfil</Nav></nav>
 {pendingNavigation&&<div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="unsaved-title"><div className="card modal-card"><p className="eyebrow">CAMBIOS SIN GUARDAR</p><h2 id="unsaved-title">Hay cambios sin guardar en este expediente</h2><p>Guarda el expediente para conservar los cambios. Las visitas ya creadas no cambian.</p><div className="form-actions"><button className="btn btn-secondary" onClick={()=>setPendingNavigation(null)}>Seguir editando</button><button className="btn btn-danger" onClick={discardExpedienteDraft}>Descartar</button><button className="btn btn-primary" onClick={()=>{const save=saveExpedienteRef.current;setPendingNavigation(null);save?.()}}>Guardar cambios</button></div></div></div>}
  <div className={`toast ${toast?'show':''}`}><span>✓</span>{toast}</div></BackNavigation></ProfileSignerContext.Provider>;
}

function Nav({active,icon,count,children,onClick}:{active:boolean;icon:string;count?:number;children:React.ReactNode;onClick:()=>void}){return <button className={active?'nav-item active':'nav-item'} onClick={onClick}><span className="nav-icon">{icon}</span><span>{children}</span>{count!==undefined&&<span className="nav-count">{count}</span>}</button>}
function Dashboard({data,profile,onNavigate,onOpen}:{data:WorkspaceState;profile:LocalState;onNavigate:(view:View)=>void;onOpen:(id:string)=>void}){const cases=data.expedientes.filter(item=>item.activo),visits=data.visitas;return <div className="page-enter"><section className="hero-grid"><article className="hero-card"><p className="eyebrow">TU TRABAJO, ORGANIZADO</p><h1>Tu visita de obra, lista antes de llegar a casa.</h1><p>Captura evidencias, completa plantillas y deja preparado cada informe.</p><div className="hero-actions"><button className="btn btn-primary btn-lg" onClick={()=>onNavigate(cases.length?'expedientes':'crear')}>＋ Nueva visita</button><button className="btn btn-secondary btn-lg" onClick={()=>onNavigate('expedientes')}>Ver expedientes</button></div></article><article className="today-card"><div className="today-card-header"><h3>Tu espacio</h3><span className="date-chip">ARCHFORMS</span></div><div className="today-visit"><strong>{profile.profile?.nombre_completo||'Completa tu perfil'}</strong><span>{profile.profile?.cargo||'Profesional responsable'}</span><span>{data.pending.length?`${data.pending.length} cambios por sincronizar`:'Todo está al día'}</span></div><button className="btn btn-secondary" onClick={()=>onNavigate('perfil')}>Revisar perfil →</button></article></section><section className="metrics"><Metric label="Expedientes activos" value={cases.length}/><Metric label="Visitas creadas" value={visits.length}/><Metric label="Borradores" value={visits.filter(v=>v.estado==='BORRADOR').length}/><Metric label="Plantillas" value={data.plantillas.length||fallbackTemplates.length}/></section><div className="section-heading"><h2>Expedientes recientes</h2><button className="section-link" onClick={()=>onNavigate('expedientes')}>Ver todos →</button></div>{cases.length?<div className="project-grid">{cases.slice(0,3).map(item=><ProjectCard key={item.id} item={item} visits={visits.filter(v=>v.expediente_id===item.id).length} onOpen={()=>onOpen(item.id)}/>)}</div>:<Empty title="Aún no tienes expedientes" text="Crea el primero y deja lista la cabecera y la plantilla para todas sus visitas." action="Crear expediente" onClick={()=>onNavigate('crear')}/>}</div>}
function Metric({label,value}:{label:string;value:number}){return <article className="card metric"><div className="metric-label"><span>{label}</span><i>▤</i></div><strong>{String(value).padStart(2,'0')}</strong><small>Datos de tu espacio</small></article>}
function ProjectCard({item,visits,onOpen}:{item:Expediente;visits:number;onOpen:()=>void}){return <button className="card project-card" onClick={onOpen}><div className="project-top"><span className="project-icon">⌂</span><span className="status active">Activo</span></div><h3>{item.detalle_obra||item.propietario||`Expediente ${item.nro_expediente}`}</h3><p className="project-address">{item.ubicacion}</p><div className="project-meta"><span>Expediente<strong>{item.nro_expediente}</strong></span><span>Visitas<strong>{visits}</strong></span></div></button>}
function Empty({title,text,action,onClick}:{title:string;text:string;action:string;onClick:()=>void}){return <section className="card empty-state"><div className="empty-icon">▤</div><h2>{title}</h2><p>{text}</p><button className="btn btn-primary" onClick={onClick}>{action} →</button></section>}

function Expedientes({data,onNavigate,owner}:{data:WorkspaceState;owner:string;onNavigate:(view:View,id?:string)=>void}){
 const [search,setSearch]=useState(()=>sessionStorage.getItem(`archforms-search:${owner}`)??'');
 useEffect(()=>{sessionStorage.setItem(`archforms-search:${owner}`,search)},[owner,search]);
 const items=data.expedientes.filter(item=>item.activo&&`${item.nro_expediente} ${item.propietario} ${item.ubicacion}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="page-enter"><header className="page-heading"><div><p className="eyebrow">TU CARTERA DE OBRAS</p><h1>Expedientes</h1><p>Cada expediente conserva su propia cabecera y plantilla.</p></div><button className="btn btn-primary" onClick={()=>onNavigate('crear')}>＋ Nuevo expediente</button></header><div className="filterbar"><div className="search-field"><SearchIcon/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por número, propietario o ubicación…"/></div></div>{items.length?<div className="expedient-list">{items.map(item=><button className="expedient-row" key={item.id} onClick={()=>onNavigate('detalle',item.id)}><span className="exp-icon">▤</span><span className="exp-primary"><strong>{item.detalle_obra||item.propietario||'Obra sin título'}</strong><span>{item.ubicacion}</span></span><span className="exp-cell"><strong>{item.nro_expediente}</strong><span>N.º expediente</span></span><span className="exp-cell"><strong>{data.visitas.filter(v=>v.expediente_id===item.id).length}</strong><span>Visitas</span></span><span className="status active">Activo</span><span className="row-arrow">→</span></button>)}</div>:<Empty title="No encontramos expedientes" text="Cambia la búsqueda o crea un expediente nuevo." action="Crear expediente" onClick={()=>onNavigate('crear')}/>}</div>;
}

function ExpedienteForm({owner,templates,recientes,existing,draft,onDirtyChange,onRegisterSave,onSave,onLeaveToLibrary}:{owner:string;templates:ChecklistTemplate[];recientes:ChecklistTemplate[];existing:Expediente|null;draft:TemplateReturnDraft|null;onDirtyChange:(dirty:boolean)=>void;onRegisterSave:(save:(()=>void)|null)=>void;onSave:(item:Expediente)=>Promise<void>;onLeaveToLibrary:(payload:{values:Record<string,string>;schema:ChecklistSchema;checklistName:string;templateId:string|null;dirty:boolean})=>void}){
 const preferred=templates.find(item=>item.codigo==='G050')??templates[0];
 const [templateId,setTemplateId]=useState<string|null>(draft?draft.templateId:existing?existing.checklist_template_id:(preferred?.id??null));
 const [schema,setSchema]=useState<ChecklistSchema>(()=>draft?draft.schema:structuredClone(existing?.checklist_esquema_json??withAvanceObra(preferred.esquema)));
  const [checklistName,setChecklistName]=useState(draft?.checklistName??existing?.checklist_nombre??preferred?.nombre??'Plantilla');
 const formRef=useRef<HTMLFormElement>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const [dirty,setDirty]=useState(Boolean(draft?.dirty)),[editingChecklist,setEditingChecklist]=useState(false);
 const [formValues,setFormValues]=useState<Record<string,string>|undefined>(draft?.values);
 useEffect(()=>{onDirtyChange(dirty)},[dirty,onDirtyChange]);
 useEffect(()=>()=>onDirtyChange(false),[onDirtyChange]);
 useEffect(()=>{onRegisterSave(()=>formRef.current?.requestSubmit());return()=>onRegisterSave(null)},[onRegisterSave]);
 useEffect(()=>{if(!dirty)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)},[dirty]);
 function captureValues(){const form=formRef.current;return form?Object.fromEntries(new FormData(form).entries()) as Record<string,string>:{}}
 function selectTemplate(id:string){const template=templates.find(item=>item.id===id);if(!template)return;setTemplateId(id);setSchema(structuredClone(withAvanceObra(template.esquema)));setChecklistName(template.nombre);setDirty(true)}
 const others=templates.filter(item=>!recientes.some(recent=>recent.id===item.id));
 // Hilo C: al abrir la biblioteca el borrador del formulario viaja íntegro y vuelve intacto.
 function leaveToLibrary(){
  const values=captureValues();setFormValues(values);
  onLeaveToLibrary({values,schema,checklistName,templateId,dirty});
 }
 function openChecklistEditor(){setFormValues(captureValues());setEditingChecklist(true)}
 function applyInstance(result:TemplateEditorResult){
  if(result.kind!=='instance')return;
  setSchema(result.esquema);setChecklistName(result.nombre);setDirty(true);setEditingChecklist(false);
 }
 async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setError('');try{const form=new FormData(event.currentTarget);form.set('checklist_nombre',checklistName);setDirty(false);await onSave(buildExpediente(owner,form,schema,existing??undefined,templateId))}catch(e){setError(msg(e));setDirty(true);setBusy(false)}}
 return <>{editingChecklist&&<TemplateEditor owner={owner} source={null} mode="instance" initialName={checklistName} initialSchema={schema} onCancel={()=>setEditingChecklist(false)} onSave={applyInstance}/>}<div className="page-enter" style={{display:editingChecklist?'none':undefined}}>
  <header className="page-heading"><div><p className="eyebrow">{existing?'ACTUALIZAR CABECERA':'CONFIGURACIÓN INICIAL'}</p><h1>{existing?'Editar expediente':'Nuevo expediente'}</h1><p>Estos datos se reutilizarán en todos los informes de visita.</p></div></header>
  {error&&<div className="alert error">{error}</div>}
   <div className="form-layout"><form id="expediente-form" ref={formRef} className="card form-card" onSubmit={submit} onInput={()=>setDirty(true)}>
   <FormSection number="1" title="Licencia y expediente" text="Identificación principal de la obra."><Fields existing={existing} values={formValues}/></FormSection>
   <FormSection number="2" title="Obra y responsables" text="Datos fijos de la cabecera."><div className="form-grid">
    <Field name="propietario" label="Propietario / razón social" values={formValues} defaultValue={existing?.propietario}/><Field name="ubicacion" label="Ubicación de la obra" required values={formValues} defaultValue={existing?.ubicacion}/><Field name="distrito" label="Distrito" values={formValues} defaultValue={existing?.distrito}/><Field name="provincia" label="Provincia" values={formValues} defaultValue={existing?.provincia}/><Field name="departamento" label="Departamento" values={formValues} defaultValue={existing?.departamento}/><Field name="tipo_obra" label="Tipo de obra" values={formValues} defaultValue={existing?.tipo_obra}/><Field name="uso_predio" label="Uso del predio" values={formValues} defaultValue={existing?.uso_predio}/><Field name="valor_obra" label="Valor de obra" type="number" values={formValues} defaultValue={existing?.valor_obra}/><Field name="responsable_obra_nombre" label="Responsable de obra" values={formValues} defaultValue={existing?.responsable_obra_nombre}/><Field name="responsable_obra_colegiatura" label="CIP / colegiatura" values={formValues} defaultValue={existing?.responsable_obra_colegiatura}/><label className="form-group full">Detalle de obra<textarea name="detalle_obra" rows={3} defaultValue={formValues?.detalle_obra??existing?.detalle_obra??''}/></label>
   </div></FormSection>
   <FormSection number="3" title="Póliza y planificación" text="Vigencias y número previsto de visitas."><div className="form-grid"><Field name="poliza_compania" label="Compañía de póliza CAR" values={formValues} defaultValue={(existing?.poliza_car_json?.compania as string)??''}/><Field name="total_visitas_programadas" label="Visitas programadas" type="number" values={formValues} defaultValue={existing?.total_visitas_programadas}/><Field name="poliza_desde" label="Inicio de póliza" type="date" values={formValues} defaultValue={(existing?.poliza_car_json?.desde as string)??''}/><Field name="poliza_hasta" label="Fin de póliza" type="date" values={formValues} defaultValue={(existing?.poliza_car_json?.hasta as string)??''}/></div></FormSection>
    </form><aside className="card template-panel"><p className="eyebrow">PLANTILLA DEL EXPEDIENTE</p><h2>Elige un punto de partida</h2><p>Se copiará al expediente. Editar la plantilla aquí solo cambia este expediente; las visitas conservan copias propias e independientes.</p>{dirty&&<div className="alert notice">Cambios en la plantilla sin guardar. Pulsa «Guardar cambios» para aplicarlos a este expediente.</div>}<p className="panel-label">Uso reciente</p>{recientes.map(template=><button key={template.id} type="button" className={`template-option ${templateId===template.id?'selected':''}`} onClick={()=>selectTemplate(template.id)}><span className="template-radio"/><span className="template-copy"><strong>{template.nombre}</strong><span>{template.id===draft?.anchor?'Recién creada':'Uso reciente'}</span></span></button>)}{others.length>0&&<><p className="panel-label">Todas las plantillas</p>{others.map(template=><button key={template.id} type="button" className={`template-option compact ${templateId===template.id?'selected':''}`} onClick={()=>selectTemplate(template.id)}><span className="template-radio"/><span className="template-copy"><strong>{template.nombre}</strong><span>{template.esquema.sections.reduce((sum,s)=>sum+s.fields.length,0)} campos · Versión {template.version}</span></span></button>)}</>}<div className="library-cta"><button type="button" className="btn btn-secondary" onClick={leaveToLibrary}>＋ Crear nueva plantilla</button><button type="button" className="btn btn-ghost" onClick={openChecklistEditor}>✎ Editar plantilla de este expediente</button></div><div className="checklist-preview"><div className="checklist-preview-head"><span>Vista previa</span></div><input className="field compact" required value={checklistName} onChange={e=>{setChecklistName(e.target.value);setDirty(true)}} aria-label="Título de la plantilla"/><ChecklistForm schema={withAvanceObra(schema)} answers={{}} readonly/></div></aside></div>
   <footer className="expediente-submit"><button type="submit" form="expediente-form" className="btn btn-primary btn-lg" disabled={busy}>{busy?'Guardando…':existing?'Guardar cambios →':'Crear expediente →'}</button></footer>
  </div></>}
function Fields({existing,values}:{existing:Expediente|null;values?:Record<string,string>}){return <div className="form-grid"><Field name="nro_expediente" label="Número de expediente" required values={values} defaultValue={existing?.nro_expediente}/><Field name="nro_licencia" label="Número de licencia" values={values} defaultValue={existing?.nro_licencia}/><Field name="modalidad" label="Modalidad" values={values} defaultValue={existing?.modalidad}/><Field name="entidad_destinataria" label="Municipalidad / entidad" values={values} defaultValue={existing?.entidad_destinataria}/><Field name="fecha_emision_licencia" label="Fecha de emisión" type="date" values={values} defaultValue={existing?.fecha_emision_licencia}/><Field name="vigencia_desde" label="Vigencia desde" type="date" values={values} defaultValue={existing?.vigencia_desde}/><Field name="vigencia_hasta" label="Vigencia hasta" type="date" values={values} defaultValue={existing?.vigencia_hasta}/></div>}
function Field({name,label,type='text',required=false,defaultValue,values}:{name:string;label:string;type?:string;required?:boolean;defaultValue?:string|number|null;values?:Record<string,string>}){return <label className="form-group">{label}{required&&<span className="required"> *</span>}<input className="field" name={name} type={type} min={name==='total_visitas_programadas'?1:undefined} step={name==='total_visitas_programadas'?1:undefined} required={required} defaultValue={values?.[name]??defaultValue??''}/>{name==='total_visitas_programadas'&&<small>Opcional. Déjalo vacío si no se conoce; se conserva la numeración real aunque se supere lo previsto.</small>}</label>}
function FormSection({number,title,text,children}:{number:string;title:string;text:string;children:React.ReactNode}){return <section className="form-section"><div className="form-section-title"><span className="step-number">{number}</span><div><h3>{title}</h3><p>{text}</p></div></div>{children}</section>}


function VisitChecklist({visita,expediente,ownerId,onSave,onSaveAnswers,onEditReport,saveBarrier,onDownload,provisional=false}:{visita:Visita;expediente:Expediente;ownerId:string;onSave:(record:Visita)=>Promise<void>;onSaveAnswers:(id:string,patch:Record<string,string|number|null>)=>Promise<void>;onEditReport:()=>void;saveBarrier:SaveBarrier;onDownload:()=>Promise<void>;provisional?:boolean}){
 const [answers,setAnswers]=useState(visita.checklist_respuestas_json);
 const [saveStatus,setSaveStatus]=useState<SaveStatus>('saved');
 const [saveError,setSaveError]=useState('');
 const currentVisit=useRef(visita);
 currentVisit.current=visita;
 const savedAnswers=useRef(visita.checklist_respuestas_json);
 const persist=useRef(onSaveAnswers);
 persist.current=onSaveAnswers;
 const writer=useMemo(()=>new SerialAutosave<Record<string,unknown>>(async next=>{
   const record=currentVisit.current;
   const patch:Record<string,string|number|null>={};
   for(const [id,value] of Object.entries(next))if(value!==savedAnswers.current[id]){
    if(value!==null&&typeof value!=='string'&&typeof value!=='number')throw new Error('Respuesta inválida');
    patch[id]=value;
   }
   if(Object.keys(patch).length)await persist.current(record.id,patch);
   savedAnswers.current=next;
 },setSaveStatus),[visita.id]);
 useEffect(()=>saveBarrier.register(()=>writer.flush()),[saveBarrier,writer]);
  function changeAnswers(next:Record<string,unknown>){setAnswers(next);void writer.save(next)}
 useEffect(()=>{if(saveStatus==='saved'){savedAnswers.current=visita.checklist_respuestas_json;setAnswers(visita.checklist_respuestas_json)}},[visita.checklist_respuestas_json,saveStatus]);
 async function leave(action:()=>void){try{await saveBarrier.flush();setSaveError('');action()}catch(error){setSaveError(msg(error))}}
  const [tab, setActiveTab] = useState<'checklist'|'captura'|'resumen'>(()=>{const saved=sessionStorage.getItem(`archforms-tab:${ownerId}:${visita.id}`);return saved==='captura'||saved==='resumen'?saved:'checklist'});
  function setTab(next:'checklist'|'captura'|'resumen'){void leave(()=>setActiveTab(next))}
  useEffect(()=>{sessionStorage.setItem(`archforms-tab:${ownerId}:${visita.id}`,tab)},[ownerId,visita.id,tab]);
 const stats=checklistStats(visita.checklist_esquema_json,answers);
 const progress=stats.progress;
 const native=Capacitor.isNativePlatform();
 const cam=native&&tab==='captura';
 const tabOrder=['checklist','captura','resumen'] as const;
 const touch=useRef<{x:number;y:number}|null>(null);
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
 const saveLabel=saveStatus==='saving'?'Guardando…':saveStatus==='error'?'No se pudo guardar':'Guardado en este dispositivo';
  return <div className={native?(cam?'visit-shell visit-native cam':'visit-shell visit-native'):'page-enter visit-shell'}><div className="visit-top"><header className="visit-header"><div className="visit-title"><div><h1>Visita {String(visita.nro_visita).padStart(2,'0')} · {expediente.distrito||expediente.nro_expediente}</h1><p>Exp. {expediente.nro_expediente} · {dateLabel(visita.fecha)}{provisional?' · Numeración provisional':''}</p></div></div><span className="offline-pill">● Guardado local · archivos según descarga</span>{visita.estado==='FINALIZADA'&&<button className="btn btn-secondary" onClick={onEditReport}>Editar informe</button>}</header><nav className="visit-tabs"><button className={`visit-tab ${tab==='checklist'?'active':''}`} onClick={()=>setTab('checklist')}><span className="tab-num">1</span><span>Plantilla <small>· {progress}%</small></span></button><button className={`visit-tab ${tab==='captura'?'active':''}`} onClick={()=>setTab('captura')}><span className="tab-num">2</span><span>Captura <small>· Offline</small></span></button><button className={`visit-tab ${tab==='resumen'?'active':''}`} onClick={()=>setTab('resumen')}><span className="tab-num">3</span><span>Resumen</span></button></nav></div><section className={cam?'visit-body checklist-layout capture-active':'visit-body checklist-layout'} onTouchStart={native?(e=>{const t=e.touches[0];touch.current={x:t.clientX,y:t.clientY}}):undefined} onTouchEnd={native?swipeEnd:undefined}>
  <article className="card checklist-card" style={{display:tab==='checklist'?'':'none'}}><p className="eyebrow">{visita.checklist_nombre}</p><h2>Plantilla de visita</h2><p>La plantilla es una copia propia de esta visita. Puedes completarla incluso sin conexión.</p><div className="progress-line"><i style={{width:`${progress}%`}}/></div><p style={{margin:'6px 0 0 0',fontSize:12,color:'#65758b'}}>Avance global: {stats.answered} de {stats.total} · {progress}%{stats.missingRequired>0?` · Faltan ${stats.missingRequired} obligatorio${stats.missingRequired===1?'':'s'}`:''}</p><ChecklistForm schema={visita.checklist_esquema_json} answers={answers} onChange={(id,value)=>changeAnswers({...answers,[id]:value})}/>{stats.missingRequired>0&&<p role="status" style={{margin:'0 0 8px 0',fontSize:12,color:'var(--danger)'}}>Faltan {stats.missingRequired} campo{stats.missingRequired===1?'':'s'} obligatorio{stats.missingRequired===1?'':'s'} por responder.</p>}<div className="form-actions"><p role="status">{saveLabel}</p>{saveStatus==='error'&&<button className="btn btn-secondary" onClick={()=>void writer.retry()}>Reintentar guardado</button>}{saveError&&<p role="alert">{saveError}</p>}</div></article>
  <div style={{display:tab==='captura'?'':'none'}}><VisitCapture visita={visita} ownerId={ownerId} onGroupSaved={()=>{void visitDocument(currentVisit.current).then(doc=>onSave({...currentVisit.current,documento_json:doc as unknown as Record<string,unknown>,updated_at:new Date().toISOString()})).catch(error=>setSaveError(msg(error)))}} active={tab==='captura'} /></div>
  {tab==='resumen'&&<VisitSummary visita={visita} expediente={expediente} onDownload={onDownload} onSave={onSave} saveBarrier={saveBarrier} onEditReport={()=>void leave(onEditReport)} onConclude={async()=>{await saveBarrier.flush();await onSave({...currentVisit.current,checklist_respuestas_json:answers,estado:'FINALIZADA',updated_at:new Date().toISOString()});onEditReport()}} onGoChecklist={() => void leave(()=>setTab('checklist'))} />}
  <aside className="card visit-aside"><p className="eyebrow">PROGRESO</p><h3>Datos de la visita</h3><div className="aside-stat"><span>Plantilla</span><strong>{progress}% completado</strong></div><div className="aside-stat"><span>Estado</span><strong>{visita.estado}</strong></div><div className="aside-stat"><span>Persistencia</span><strong>Disponible offline</strong></div><p role="status">{saveLabel}</p></aside></section></div>
}
