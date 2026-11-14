import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Capacitor} from '@capacitor/core';
import {CameraPreview} from '@capacitor-community/camera-preview';
import {useBackAction} from './back-navigation';
import {ArchFormsAudio} from './native-audio';

/** Visor integrado: nunca abre otra aplicación ni usa un input capture. */
export function SignatureCamera({onUse,onClose}:{onUse:(file:File)=>Promise<void>;onClose:()=>void}){
 const viewport=useRef<HTMLDivElement>(null),video=useRef<HTMLVideoElement>(null);
 const stream=useRef<MediaStream|null>(null),started=useRef(false);
 const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[photo,setPhoto]=useState('');
 const [attempt,setAttempt]=useState(0);
 const native=Capacitor.isNativePlatform();
 useBackAction(onClose);
 async function stop(){
  stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;
  if(started.current){started.current=false;await CameraPreview.stop()}
  setReady(false);
 }
 useEffect(()=>{
  let cancelled=false;
  const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
  const align=()=>{const rect=viewport.current?.getBoundingClientRect();if(native&&started.current&&rect)void ArchFormsAudio.updateCameraRect({x:Math.round(rect.x),y:Math.round(rect.y),width:Math.round(rect.width),height:Math.round(rect.height)}).catch(console.error)};
  const observer=new ResizeObserver(align);if(viewport.current)observer.observe(viewport.current);
  const pause=()=>{if(document.hidden){void stop().catch(()=>{});setError('La cámara se ha pausado. Cierra el visor y vuelve a abrirlo.')}};
  async function start(){
   try{
    if(native){
     const rect=viewport.current!.getBoundingClientRect();
     await CameraPreview.start({position:'rear',x:Math.round(rect.x),y:Math.round(rect.y),width:Math.round(rect.width),height:Math.round(rect.height),toBack:false,storeToFile:false,enableZoom:true,lockAndroidOrientation:true});
     started.current=true;
     align();
    }else{
     if(!navigator.mediaDevices?.getUserMedia)throw new Error('Este navegador no permite usar la cámara. Puedes adjuntar una imagen de tu firma.');
     stream.current=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
     if(video.current){video.current.srcObject=stream.current;await video.current.play()}
    }
    if(cancelled){await stop();return}setReady(true);
   }catch(e){if(!cancelled)setError(`No se pudo abrir la cámara. Revisa el permiso de cámara. ${e instanceof Error?e.message:String(e)}`)}
  }
  void start();document.addEventListener('visibilitychange',pause);window.addEventListener('resize',align);window.addEventListener('scroll',align,true);
  return()=>{cancelled=true;document.body.style.overflow=overflow;observer.disconnect();document.removeEventListener('visibilitychange',pause);window.removeEventListener('resize',align);window.removeEventListener('scroll',align,true);void stop().catch(console.error)};
 },[attempt]);
 async function take(){
  setBusy(true);setError('');
  try{
   const image=new Image();
   if(native){const result=await CameraPreview.capture({quality:90,width:1600,height:1200});image.src=`data:image/jpeg;base64,${result.value}`}
   else {const canvas=document.createElement('canvas');canvas.width=video.current!.videoWidth;canvas.height=video.current!.videoHeight;canvas.getContext('2d')!.drawImage(video.current!,0,0);image.src=canvas.toDataURL('image/jpeg',.9)}
   await image.decode();
   // Recorte central con la misma proporción que el visor: solo la firma.
   const ratio=3,w=Math.min(image.width,image.height*ratio),h=w/ratio;
   const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=400;
   canvas.getContext('2d')!.drawImage(image,(image.width-w)/2,(image.height-h)/2,w,h,0,0,1200,400);
   setPhoto(canvas.toDataURL('image/jpeg',.9));await stop();
  }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }
 async function accept(){setBusy(true);setError('');try{const blob=await (await fetch(photo)).blob();await onUse(new File([blob],'firma.jpg',{type:'image/jpeg'}));onClose()}catch(e){setError(e instanceof Error?e.message:String(e));setBusy(false)}}
 return createPortal(<div className="signature-camera-backdrop" role="dialog" aria-modal="true" aria-labelledby="signature-camera-title"><section className="signature-camera-sheet"><header><h2 id="signature-camera-title">Fotografiar firma</h2><button type="button" className="btn btn-ghost" disabled={busy} onClick={onClose}>Cerrar</button></header><p>Coloca la firma sobre papel blanco, con buena luz. Centra únicamente la firma en el visor horizontal.</p><div className="signature-camera-viewport" ref={viewport}>{photo?<img src={photo} alt="Revisión de la firma capturada"/>:<video ref={video} autoPlay muted playsInline/>}</div>{error&&<p className="alert error" role="alert">{error}</p>}<div className="form-actions">{photo?<><button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>{setPhoto('');setError('');setAttempt(value=>value+1)}}>Volver a tomar</button><button type="button" className="btn btn-primary" disabled={busy} onClick={()=>void accept()}>{busy?'Preparando…':'Usar esta firma'}</button></>:<><button type="button" className="btn btn-primary" disabled={!ready||busy} onClick={()=>void take()}>{busy?'Capturando…':ready?'Tomar foto':'Abriendo cámara…'}</button>{error&&<button type="button" className="btn btn-secondary" onClick={()=>{setError('');setAttempt(value=>value+1)}}>Reintentar cámara</button>}</>}</div><small>La imagen se recorta al visor. Comprueba que todos los trazos estén completos antes de usarla.</small></section></div>,document.body);
}
