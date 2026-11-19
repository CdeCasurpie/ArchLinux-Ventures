import {useEffect,useLayoutEffect,useRef,useState,type PointerEvent} from 'react';
import {photoDataUrl,type LabPhoto} from './lab-storage';
import {saveEditedPhoto} from './media-sync';
import {Icon,Modal} from './ui';
import {useBackAction} from './back-navigation';
import {cropBetween,imagePoint,paintPhoto,type Crop,type Point,type Stroke} from './image-edit';
import '../styles/photo-editor.css';

type PhotoProps={photo:LabPhoto;visitaId:string;ownerId:string;onUpdated?:(photo:LabPhoto)=>void;prepare?:()=>Promise<LabPhoto>};
export function PhotoThumbnail({photo,visitaId,ownerId,onUpdated,prepare}:PhotoProps){
 const [opened,setOpened]=useState<LabPhoto|null>(null),[src,setSrc]=useState(photo.thumbUrl??photo.displayUrl),[error,setError]=useState('');
 useEffect(()=>{setSrc(photo.thumbUrl??photo.displayUrl);setError('')},[photo]);
 return <><button type="button" className="photo-thumbnail" aria-label="Ver foto completa" onClick={()=>{setError('');if(prepare)void prepare().then(setOpened).catch(e=>setError(String(e)));else setOpened(photo)}}>
  <img src={src} alt="Evidencia del hallazgo" loading="lazy" decoding="async" onError={()=>{if(src.startsWith('data:')){setError('Foto no disponible');return}void photoDataUrl(photo.path,photo.mimeType).then(setSrc).catch(()=>setError('Foto no descargada'))}}/>
  {error&&<span className="photo-unavailable">{error}</span>}
 </button>{opened&&<PhotoViewer photo={opened} visitaId={visitaId} ownerId={ownerId} onClose={()=>setOpened(null)} onUpdated={next=>{setOpened(next);setSrc(next.displayUrl);onUpdated?.(next)}}/>}</>;
}

function PhotoViewer({photo,visitaId,ownerId,onUpdated,onClose}:PhotoProps&{onClose:()=>void}){
 const [editing,setEditing]=useState(false),[src,setSrc]=useState(''),[error,setError]=useState(''),[attempt,setAttempt]=useState(0),[busy,setBusy]=useState(false);
 useEffect(()=>{let active=true;setError('');setSrc('');void photoDataUrl(photo.path,photo.mimeType).then(data=>{if(active)setSrc(data)}).catch(()=>{if(active)setError('La foto no está disponible en este dispositivo. Descarga los archivos de la visita y vuelve a abrirla.')});return()=>{active=false}},[photo.path,photo.checksum,attempt]);
 const close=()=>{if(busy)return;if(editing)setEditing(false);else onClose()};
 useBackAction(close,true);
 async function save(data:string){setBusy(true);try{const next=await saveEditedPhoto(ownerId,visitaId,photo,data);onUpdated?.(next);setSrc(data);setEditing(false)}finally{setBusy(false)}}
 return <Modal className="photo-dialog" labelledBy="photo-title" onClose={close} busy={busy}>
  {editing?<PhotoEditor src={src} busy={busy} onSave={save} onDiscard={()=>setEditing(false)}/>:<>
   <header className="photo-viewer-header"><button type="button" className="photo-icon-button" aria-label="Cerrar foto" onClick={onClose}><Icon name="close"/></button><h2 id="photo-title">Foto</h2><button type="button" className="photo-text-button" disabled={!src} onClick={()=>setEditing(true)}><Icon name="edit"/>Editar</button></header>
   <div className="photo-full-view">{src?<img src={src} alt="Foto completa del hallazgo"/>:error?<div className="photo-load-error"><p role="alert">{error}</p><button className="btn btn-secondary" onClick={()=>setAttempt(attempt+1)}>Reintentar</button></div>:<p role="status">Abriendo foto…</p>}</div>
  </>}
 </Modal>;
}

type Snapshot={src:string;strokes:Stroke[]};
function PhotoEditor({src,busy,onSave,onDiscard}:{src:string;busy:boolean;onSave:(data:string)=>Promise<void>;onDiscard:()=>void}){
 const canvas=useRef<HTMLCanvasElement>(null),image=useRef<HTMLImageElement|null>(null),drawing=useRef<Point|null>(null);
 const [base,setBase]=useState(src),[strokes,setStrokes]=useState<Stroke[]>([]),[history,setHistory]=useState<Snapshot[]>([]);
 const [size,setSize]=useState({width:1,height:1}),[ready,setReady]=useState(false),[tool,setTool]=useState<'draw'|'crop'>('draw'),[color,setColor]=useState('#e5484d'),[width,setWidth]=useState(4),[crop,setCrop]=useState<Crop|null>(null),[error,setError]=useState('');
 const dirty=base!==src||strokes.length>0||Boolean(crop);
 useEffect(()=>{let active=true;setReady(false);const img=new Image();img.onload=()=>{if(active){image.current=img;setSize({width:img.naturalWidth,height:img.naturalHeight});setReady(true)}};img.onerror=()=>{if(active)setError('No se pudo abrir la imagen.')};img.src=base;return()=>{active=false}},[base]);
 useLayoutEffect(()=>{if(ready&&canvas.current&&image.current)paintPhoto(canvas.current,image.current,strokes)},[ready,strokes]);
 function snapshot(){setHistory(previous=>[...previous.slice(-19),{src:base,strokes}])}
 function point(event:PointerEvent<HTMLCanvasElement>){return imagePoint({x:event.clientX,y:event.clientY},event.currentTarget.getBoundingClientRect(),size)}
 function down(event:PointerEvent<HTMLCanvasElement>){
  if(!ready||busy||event.button!==0||!event.isPrimary)return;
  event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);drawing.current=point(event);
  if(tool==='crop')setCrop(null);
  else{snapshot();setStrokes(previous=>[...previous,{points:[drawing.current!],color,width:Math.max(size.width,size.height)*width/1000}])}
 }
 function move(event:PointerEvent<HTMLCanvasElement>){
  if(!drawing.current||busy)return;event.preventDefault();const p=point(event);
  if(tool==='crop')setCrop(cropBetween(drawing.current,p,size));
  else setStrokes(previous=>previous.map((stroke,i)=>i===previous.length-1?{...stroke,points:[...stroke.points,p]}:stroke));
 }
 function undo(){if(crop){setCrop(null);return}const previous=history.at(-1);if(!previous)return;setHistory(history.slice(0,-1));setBase(previous.src);setStrokes(previous.strokes)}
 function rendered(){if(!image.current)throw new Error('La imagen todavía está abriendo.');return paintPhoto(document.createElement('canvas'),image.current,strokes,crop)}
 function applyCrop(){if(!crop||crop.width<16||crop.height<16)return;snapshot();setBase(rendered().toDataURL('image/jpeg',0.92));setStrokes([]);setCrop(null)}
 async function save(){setError('');try{await onSave(rendered().toDataURL('image/jpeg',0.9))}catch(e){setError(e instanceof Error?e.message:String(e))}}
 return <>
  <header className="photo-viewer-header"><button type="button" className="photo-text-button" disabled={busy} onClick={onDiscard}>Descartar</button><h2 id="photo-title">Editar foto</h2><button type="button" className="photo-save-button" disabled={busy||!ready||!dirty} onClick={()=>void save()}>{busy?'Guardando…':'Guardar'}</button></header>
  <nav className="photo-tools" aria-label="Herramientas de imagen"><button aria-pressed={tool==='draw'} disabled={busy} onClick={()=>setTool('draw')}><Icon name="edit"/>Dibujar</button><button aria-pressed={tool==='crop'} disabled={busy} onClick={()=>setTool('crop')}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M6 3v15h15M3 6h15v15"/></svg>Recortar</button><button className="photo-undo" aria-label="Deshacer edición" disabled={busy||(!history.length&&!crop)} onClick={undo}><Icon name="undo"/></button></nav>
  <div className="photo-editor-stage">
   <div className="photo-canvas-wrap" style={{aspectRatio:`${size.width}/${size.height}`,width:`min(100%, calc((100dvh - 250px) * ${size.width/size.height}))`}}>
    <canvas ref={canvas} aria-label={tool==='draw'?'Dibuja sobre la foto':'Arrastra para seleccionar el recorte'} onPointerDown={down} onPointerMove={move} onPointerUp={()=>{drawing.current=null}} onPointerCancel={()=>{drawing.current=null}}/>
    {crop&&<div className="photo-crop-selection" aria-label="Área de recorte" style={{left:`${crop.x/size.width*100}%`,top:`${crop.y/size.height*100}%`,width:`${crop.width/size.width*100}%`,height:`${crop.height/size.height*100}%`}}><i/><i/></div>}
   </div>
  </div>
  <footer className="photo-editor-options">{error&&<p className="photo-edit-error" role="alert">{error}</p>}
   {tool==='draw'?<><div className="photo-colors" aria-label="Color del trazo">{[['#e5484d','Rojo'],['#f5b52e','Amarillo'],['#ffffff','Blanco'],['#18212b','Negro']].map(([value,label])=><button key={value} aria-label={label} aria-pressed={color===value} style={{background:value}} disabled={busy} onClick={()=>setColor(value)}/>)}</div><label className="photo-line-width">Trazo<select aria-label="Grosor del trazo" value={width} disabled={busy} onChange={e=>setWidth(Number(e.target.value))}><option value={2}>Fino</option><option value={4}>Medio</option><option value={8}>Grueso</option></select></label></>:<><span className="photo-crop-help">Arrastra sobre la foto para elegir el área.</span><button className="btn btn-secondary" disabled={busy||!crop||crop.width<16||crop.height<16} onClick={applyCrop}>Aplicar recorte</button></>}
  </footer>
 </>;
}
