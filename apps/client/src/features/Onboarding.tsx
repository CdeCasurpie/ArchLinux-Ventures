import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';

export const tutorialSteps=[
 {id:'welcome',target:'.hero-actions .btn-secondary, .home-actionbar .btn-secondary',title:'Empieza por una obra',text:'Crea un expediente de prueba. Te acompañamos hasta tu primer informe.',next:'Crear expediente'},
 {id:'expediente',target:'#expediente-form .form-section-title',formStep:0,title:'Una vez por obra',text:'Completa este expediente una sola vez. Sus datos se reutilizan en cada visita.',next:'Entendido'},
 {id:'web',target:'#expediente-form .form-section-title',formStep:0,title:'Más cómodo desde la web',text:'Te recomendamos completar la cabecera desde una computadora. También puedes hacerlo aquí.'},
 {id:'number',target:'input[name="nro_expediente"]',formStep:0,title:'Identifica tu expediente',text:'Escribe un número para tu obra de prueba. Es uno de los dos datos obligatorios.'},
 {id:'address',target:'input[name="ubicacion"]',formStep:1,title:'¿Dónde está la obra?',text:'La ubicación es el otro dato obligatorio. Los demás campos puedes completarlos después.'},
 {id:'templates',target:'.template-option:not(.compact)',group:true,formStep:1,title:'¿Qué vas a revisar?',text:'Una plantilla es tu lista de verificaciones. Elige una de la plataforma para empezar.'},
 {id:'reuse',target:'.library-cta',formStep:1,title:'También puede ser tuya',text:'Puedes crear tu propia plantilla y reutilizarla en otros expedientes.'},
 {id:'create',target:'.expediente-submit button',formStep:1,title:'Guarda tu obra de prueba',text:'Completa número y ubicación y pulsa este botón. Crea el expediente para continuar.',required:true},
 {id:'visit',target:'.detail-actions .btn-primary',title:'Ahora sí: una visita',text:'Pulsa «Nueva visita» para empezar la inspección de esta obra.',next:'Crear visita'},
 {id:'checklist',target:'.visit-tab:nth-child(1)',title:'Tu lista en campo',text:'Completa aquí las verificaciones de esta visita. Cada visita conserva su propia copia.'},
 {id:'swipe',target:'.visit-tabs',title:'Tres espacios, un recorrido',text:'Plantilla, Captura y Resumen. Toca sus pestañas o desliza el dedo para cambiar de sección.'},
 {id:'capture',target:'.capture-action-grid button:first-child',title:'Enciende la cámara',text:'Desde aquí empiezas a registrar las evidencias de la visita.'},
 {id:'photos',target:'.capture-action-grid button:nth-child(2)',title:'Un hallazgo, varias fotos',text:'Toma las fotos de un mismo hallazgo. Todas quedarán reunidas en un grupo.'},
 {id:'audio',target:'.capture-record',title:'El comentario cierra el grupo',text:'Graba qué muestran las fotos y detén el audio. Así cierras este grupo y puedes empezar otro.'},
 {id:'processing',target:'.visit-tab:nth-child(3)',title:'Dale unos segundos',text:'El comentario se procesa después de grabarlo. Puedes continuar y revisar el resultado en Resumen.'},
 {id:'summary',target:'.summary-findings-heading',title:'Revisa tus hallazgos',text:'Aquí aparecen tus grupos de fotos y comentarios. También puedes consultar la cabecera y la plantilla.'},
 {id:'conclude',target:'button:has([data-tour="conclude-label"])',title:'¿Terminaste en campo?',text:'Concluye la visita para pasar a revisar y editar el informe.',next:'Concluir visita'},
 {id:'review',target:'.report-block-heading',title:'Dale una última revisión',text:'Corrige textos, revisa fotos y completa los firmantes. Todavía puedes editar el informe.'},
 {id:'pdf',target:'button:has([data-tour="pdf"])',title:'Tu informe, listo',text:'Cuando todo esté conforme, genera el PDF. Puedes volver a esta guía desde «?» en Inicio.',next:'Terminar recorrido'},
] as const;
export type TutorialStep=typeof tutorialSteps[number]['id'];
export function tutorialFormStep(step:TutorialStep|null){const info=tutorialSteps.find(item=>item.id===step);return info&&'formStep' in info?info.formStep:undefined}

type Rect={top:number;left:number;width:number;height:number};
type Placement={top:number;left:number;side:'top'|'bottom'|'left'|'right';arrow:number};
const visible=(element:HTMLElement)=>element.getClientRects().length>0&&getComputedStyle(element).visibility!=='hidden'&&element.getBoundingClientRect().width>0;

/** Measures the real target, including scrolling, responsive layouts and keyboard resize. */
export function Tutorial({step,onStep,onFinish,onAction,onTargetClick}:{step:TutorialStep;onStep:(step:TutorialStep)=>void;onFinish:()=>void;onAction:()=>void;onTargetClick:()=>void}){
 const index=tutorialSteps.findIndex(item=>item.id===step),content=tutorialSteps[index];
 const card=useRef<HTMLElement>(null),target=useRef<HTMLElement|null>(null);
 const [rect,setRect]=useState<Rect|null>(null),[position,setPosition]=useState<Placement|null>(null);
 const callbacks=useRef({onFinish,onTargetClick});callbacks.current={onFinish,onTargetClick};
 useLayoutEffect(()=>{
  let frame=0,previous:HTMLElement|null=null;
  const observer=new ResizeObserver(schedule);
  function measure(){
   const candidates=Array.from(document.querySelectorAll<HTMLElement>(content.target)).filter(visible);
   const element=candidates['group' in content?Math.floor(candidates.length/2):0]??null;
   if(element!==previous){
    previous?.removeAttribute('data-tour-highlighted');if(previous)observer.unobserve(previous);
    previous=element;target.current=element;
    if(element){element.setAttribute('data-tour-highlighted','true');observer.observe(element);
     const bounds=element.getBoundingClientRect();
     if(bounds.top<80||bounds.bottom>window.innerHeight-90)element.scrollIntoView({block:'center',behavior:'instant'});
    }
   }
   if(!element){setRect(null);return}
   const boxes=('group' in content?candidates:[element]).map(item=>item.getBoundingClientRect());
   const top=Math.min(...boxes.map(box=>box.top)),left=Math.min(...boxes.map(box=>box.left));
   const next={top,left,width:Math.max(...boxes.map(box=>box.right))-left,height:Math.max(...boxes.map(box=>box.bottom))-top};
   setRect(old=>old&&Object.keys(next).every(key=>old[key as keyof Rect]===next[key as keyof Rect])?old:next);
  }
  function schedule(){cancelAnimationFrame(frame);frame=requestAnimationFrame(measure)}
  const mutations=new MutationObserver(schedule);mutations.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class']});
  window.addEventListener('scroll',schedule,true);window.addEventListener('resize',schedule);window.visualViewport?.addEventListener('resize',schedule);window.visualViewport?.addEventListener('scroll',schedule);
  measure();
  return()=>{cancelAnimationFrame(frame);observer.disconnect();mutations.disconnect();previous?.removeAttribute('data-tour-highlighted');window.removeEventListener('scroll',schedule,true);window.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('resize',schedule);window.visualViewport?.removeEventListener('scroll',schedule)};
 },[content.target,step]);
 useLayoutEffect(()=>{
  if(!rect||!card.current)return;
  function place(){
   const viewport=window.visualViewport;
   const leftEdge=(viewport?.offsetLeft??0)+12,topEdge=(viewport?.offsetTop??0)+12;
   const rightEdge=leftEdge+(viewport?.width??window.innerWidth)-24,bottomEdge=topEdge+(viewport?.height??window.innerHeight)-90;
   const box=card.current!.getBoundingClientRect(),gap=16;
   const centerX=rect!.left+rect!.width/2,centerY=rect!.top+rect!.height/2;
   const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(value,Math.max(min,max)));
   const sides:Placement['side'][]=window.innerWidth>820?['right','left','bottom','top']:['bottom','top','right','left'];
   const side=sides.find(side=>side==='right'?rect!.left+rect!.width+gap+box.width<=rightEdge:side==='left'?rect!.left-gap-box.width>=leftEdge:side==='bottom'?rect!.top+rect!.height+gap+box.height<=bottomEdge:rect!.top-gap-box.height>=topEdge)??(centerY>(topEdge+bottomEdge)/2?'top':'bottom');
   const left=clamp(side==='left'?rect!.left-gap-box.width:side==='right'?rect!.left+rect!.width+gap:centerX-box.width/2,leftEdge,rightEdge-box.width);
   const top=clamp(side==='top'?rect!.top-gap-box.height:side==='bottom'?rect!.top+rect!.height+gap:centerY-box.height/2,topEdge,bottomEdge-box.height);
   const arrow=side==='top'||side==='bottom'?clamp(centerX-left,22,box.width-22):clamp(centerY-top,22,box.height-22);
   setPosition(old=>old&&old.left===left&&old.top===top&&old.side===side&&old.arrow===arrow?old:{top,left,side,arrow});
  }
  const observer=new ResizeObserver(place);observer.observe(card.current);window.addEventListener('resize',place);window.visualViewport?.addEventListener('resize',place);place();return()=>{observer.disconnect();window.removeEventListener('resize',place);window.visualViewport?.removeEventListener('resize',place)};
 },[rect,step]);
 useEffect(()=>{
  const click=(event:MouseEvent)=>{if(target.current?.contains(event.target as Node))callbacks.current.onTargetClick()};
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();callbacks.current.onFinish()}};
  document.addEventListener('click',click);document.addEventListener('keydown',key);
  return()=>{document.removeEventListener('click',click);document.removeEventListener('keydown',key)};
 },[]);
 if(!rect)return createPortal(<button type="button" className="tutorial-resume" onClick={()=>onStep(step)}>Continuar guía →</button>,document.body);
 const required='required' in content&&content.required;
 const action='next' in content?content.next:'Siguiente';
 return createPortal(<div className="tutorial-layer">
  <div className="tutorial-spotlight" aria-hidden="true" style={{top:rect.top-5,left:rect.left-5,width:rect.width+10,height:rect.height+10}}/>
  <aside ref={card} className="tutorial-coachmark" role="dialog" aria-modal="false" aria-labelledby="tutorial-title" aria-describedby="tutorial-text" data-step={step} data-side={position?.side} style={{top:position?.top??0,left:position?.left??0,visibility:position?'visible':'hidden','--tour-arrow':`${position?.arrow??22}px`} as React.CSSProperties}>
   <div className="tutorial-arrow" aria-hidden="true"/>
   <header><span className="tutorial-progress" aria-label={`Consejo ${index+1} de ${tutorialSteps.length}`}>{index+1}<span> / {tutorialSteps.length}</span></span><button type="button" className="tutorial-close" aria-label="Omitir todo" title="Omitir todo" onClick={onFinish}>×</button></header>
   <h2 id="tutorial-title">{content.title}</h2><p id="tutorial-text" aria-live="polite">{content.text}</p>
   <footer>{!required&&step!=='welcome'&&step!=='pdf'&&<button type="button" className="tutorial-skip" onClick={()=>onStep(tutorialSteps[index+1].id)}>Omitir paso</button>}
    {!required&&<button type="button" className="btn btn-primary" onClick={()=>{if(step==='pdf')onFinish();else if(step==='welcome'||step==='visit'||step==='conclude')onAction();else onStep(tutorialSteps[index+1].id)}}>{action}<span aria-hidden="true"> →</span></button>}
    {required&&<span className="tutorial-required">Guarda el expediente para continuar</span>}
   </footer>
  </aside>
 </div>,document.body);
}
