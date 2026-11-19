import {useEffect,useRef,useState} from 'react';
import type {Expediente,Visita} from '@archforms/domain';
import {obraTitle,openFieldVisits,recentWorks,visitsToReview} from './home-data';
import {useBackAction} from './back-navigation';

export type HomeDestination='expedientes'|'plantillas'|'pendientes'|'mas'|'crear'|'nueva-visita'|'perfil';
export function HomeIcon({kind}:{kind:'obra'|'pending'|'template'|'more'|'person'|'spark'}){
 const paths={obra:<path d="M4 21V7l8-4 8 4v14M9 21v-5h6v5M8 8h2m4 0h2M8 12h2m4 0h2M2 21h20"/>,pending:<><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V2h6v2M9 10h6m-6 4h6m-6 4h3"/></>,template:<><rect x="4" y="3" width="16" height="18" rx="2"/><path d="m7 8 1 1 2-2m2 1h5M7 13h2m3 0h5m-10 4h2m3 0h5"/></>,more:<><circle cx="12" cy="12" r="9"/><path d="M12 7v10M7 12h10"/></>,person:<><circle cx="12" cy="7" r="4"/><path d="M4 23v-3a8 8 0 0 1 16 0v3Z"/></>,spark:<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3ZM20 2v4m-2-2h4"/>};
 return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[kind]}</svg>;
}
export function MobileHome({obras,visitas,name,onNavigate,onOpen,onTutorial}:{obras:Expediente[];visitas:Visita[];name?:string;onNavigate:(view:HomeDestination)=>void;onOpen:(id:string)=>void;onTutorial:()=>void}){
 const visited=new Set(visitas.map(v=>v.expediente_id));
 const recent=recentWorks(obras,visitas).filter(o=>visited.has(o.id)).slice(0,2);
 const count=visitsToReview(visitas).filter(v=>obras.some(o=>o.activo&&o.id===v.expediente_id)).length;
 const links=[{view:'expedientes',icon:'obra',label:'Mis expedientes'},{view:'pendientes',icon:'pending',label:'Visitas pendientes'},{view:'plantillas',icon:'template',label:'Mis plantillas'},{view:'mas',icon:'more',label:'Ver más'}] as const;
 return <div className="mobile-home">
  <section className="hero-card home-mobile-blue">
    <header className="home-mobile-header"><div className="home-greeting-brand"><img src="/archforms-mark.png" alt="ArchForms"/><h1 className="home-greeting">Hola{name?.trim()?`, ${name.trim().split(/\s+/)[0]}`:''}</h1></div><div className="home-profile-actions"><button className="tutorial-trigger" aria-label="Ver tutorial" title="Ver tutorial" onClick={onTutorial}>?</button><button className="home-profile-button" aria-label="Mi perfil" onClick={()=>onNavigate('perfil')}><HomeIcon kind="person"/></button></div></header>
   <p className="home-mobile-caption">Tu próxima visita, tu próximo informe.</p>
   <nav className="home-shortcuts" aria-label="Accesos rápidos">{links.map(link=><button key={link.view} onClick={()=>onNavigate(link.view)}><span className="home-shortcut-icon"><HomeIcon kind={link.icon}/>{link.view==='pendientes'&&count>0&&<span className="home-shortcut-count">{count}</span>}</span><span>{link.label}</span></button>)}</nav>
   <aside className="home-news" aria-label="Novedades de ArchForms"><div><span className="eyebrow">NOVEDADES · ARCHFORMS</span><h2>Más tiempo en obra.<br/>Menos tiempo redactando.</h2><p>Tu trabajo de campo, listo para convertirse en informe.</p></div><span className="home-news-icon"><HomeIcon kind="spark"/></span></aside>
  </section>
  <section className="home-recent" aria-labelledby="recent-works-title"><div className="section-heading"><h2 id="recent-works-title">Últimas obras visitadas</h2><button className="section-link" onClick={()=>onNavigate('expedientes')}>Ver todas →</button></div>
   {recent.map(obra=><button className="home-recent-row" key={obra.id} onClick={()=>onOpen(obra.id)}><span className="home-work-icon"><HomeIcon kind="obra"/></span><span className="home-work-copy"><strong>{obraTitle(obra)}</strong><small>Exp. {obra.nro_expediente}</small></span><span aria-hidden="true">›</span></button>)}
   {!recent.length&&<div className="home-empty"><h3>{obras.some(o=>o.activo)?'Tu primera visita empieza aquí':'Bienvenido a tu espacio'}</h3><p>{obras.some(o=>o.activo)?'Pulsa «Nueva visita» y elige una obra. Aquí aparecerán las últimas que visites.':'Crea un expediente para configurar la obra. Después podrás iniciar sus visitas con un toque.'}</p></div>}
  </section>
 </div>;
}

export function VisitLauncher({obras,visitas,creating,onCreate,onContinue,onNewCase}:{obras:Expediente[];visitas:Visita[];creating:boolean;onCreate:(obra:Expediente)=>Promise<void>;onContinue:(visita:Visita)=>void;onNewCase:()=>void}){
 const [search,setSearch]=useState(''),[warning,setWarning]=useState<Expediente|null>(null);
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{if(warning)dialog.current?.showModal();else dialog.current?.close()},[warning]);
 useBackAction(()=>setWarning(null),Boolean(warning));
 const pending=warning?visitsToReview(openFieldVisits(visitas.filter(v=>v.expediente_id===warning.id))):[];
 const items=recentWorks(obras,visitas).filter(o=>`${obraTitle(o)} ${o.nro_expediente} ${o.ubicacion} ${o.propietario??''}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
 function choose(obra:Expediente){if(openFieldVisits(visitas.filter(v=>v.expediente_id===obra.id)).length)setWarning(obra);else void onCreate(obra)}
 return <div className="page-enter visit-launcher"><header className="page-heading"><div><p className="eyebrow">NUEVA VISITA</p><h1>¿Qué obra vas a visitar?</h1><p>Elige una obra para crear y abrir su nueva visita. Las más recientes aparecen primero.</p></div></header>
  <label className="launcher-search">Buscar obra<input className="field" type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Nombre, expediente o dirección"/></label>
  <div className="launcher-list">{items.map(obra=><button className="launcher-work" key={obra.id} disabled={creating} onClick={()=>choose(obra)}><span className="home-work-icon"><HomeIcon kind="obra"/></span><span className="home-work-copy"><strong>{obraTitle(obra)}</strong><b>Exp. {obra.nro_expediente}</b><span>{obra.ubicacion}</span>{obra.propietario&&<small>Propietario: {obra.propietario}</small>}</span><span aria-hidden="true">→</span></button>)}</div>
  {!items.length&&<p role="status">{search?'No hay obras que coincidan con la búsqueda.':'Aún no tienes expedientes activos. Crea el primero para iniciar una visita.'}</p>}
  {creating&&<p role="status">Creando visita en este dispositivo…</p>}
  <button className="btn btn-secondary" disabled={creating} onClick={onNewCase}>Crear nuevo expediente</button>
  <dialog ref={dialog} className="visit-warning" aria-labelledby="pending-visit-title" onCancel={e=>{e.preventDefault();if(!creating)setWarning(null)}}><h2 id="pending-visit-title">Hay una visita en curso</h2><p>{warning&&obraTitle(warning)} · Exp. {warning?.nro_expediente}</p><p>Puedes continuar el trabajo de campo pendiente o iniciar otra visita.</p>
   {pending.map(v=><button className="launcher-pending" key={v.id} disabled={creating} onClick={()=>{setWarning(null);onContinue(v)}}>Continuar visita {String(v.nro_visita).padStart(2,'0')} · {v.fecha}</button>)}
   <div className="form-actions"><button autoFocus className="btn btn-secondary" disabled={creating} onClick={()=>setWarning(null)}>Cancelar</button><button className="btn btn-primary" disabled={creating} onClick={()=>{if(warning)void onCreate(warning).then(()=>setWarning(null))}}>{creating?'Creando…':'Crear otra visita'}</button></div>
  </dialog>
 </div>;
}

export function PendingVisits({obras,visitas,onOpen}:{obras:Expediente[];visitas:Visita[];onOpen:(v:Visita)=>void}){
 const items=visitsToReview(visitas).filter(v=>obras.some(o=>o.activo&&o.id===v.expediente_id));
 return <div className="page-enter visit-launcher"><header className="page-heading"><div><p className="eyebrow">RETOMAR TRABAJO</p><h1>Visitas pendientes</h1><p>Continúa en campo o revisa el informe. Concluir campo no significa que el PDF esté generado.</p></div></header><div className="launcher-list">{items.map(v=><button className="launcher-work" key={v.id} onClick={()=>onOpen(v)}><span className="home-work-icon"><HomeIcon kind="pending"/></span><span className="home-work-copy"><strong>{obraTitle(obras.find(o=>o.id===v.expediente_id)!)}</strong><b>Exp. {obras.find(o=>o.id===v.expediente_id)!.nro_expediente} · Visita {String(v.nro_visita).padStart(2,'0')}</b><small>{v.fecha} · {v.estado==='FINALIZADA'?'Campo terminado · revisar informe':'Trabajo de campo pendiente'}</small><span>{v.estado==='FINALIZADA'?'Editar informe →':'Continuar visita →'}</span></span></button>)}</div>{!items.length&&<p>No hay visitas para retomar.</p>}</div>;
}

export function MoreNavigation({onNavigate}:{onNavigate:(view:HomeDestination)=>void}){
 return <div className="page-enter visit-launcher"><header className="page-heading"><h1>Tu espacio</h1></header><nav className="launcher-list" aria-label="Más opciones">{([{view:'expedientes',icon:'obra',label:'Mis expedientes'},{view:'pendientes',icon:'pending',label:'Visitas pendientes'},{view:'plantillas',icon:'template',label:'Mis plantillas'},{view:'perfil',icon:'person',label:'Mi perfil y firma'}] as const).map(link=><button className="launcher-work" key={link.view} onClick={()=>onNavigate(link.view)}><HomeIcon kind={link.icon}/><strong>{link.label}</strong><span aria-hidden="true">→</span></button>)}</nav></div>;
}
