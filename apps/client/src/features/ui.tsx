import {useEffect,useRef,type ButtonHTMLAttributes,type ReactNode} from 'react';
import {createPortal} from 'react-dom';

export type IconName='plus'|'check'|'close'|'up'|'down'|'left'|'right'|'undo'|'redo'|'mic'|'home'|'camera'|'trash'|'edit';
/** Iconos operativos: SVG, no glifos dependientes de la fuente instalada. */
export function Icon({name}:{name:IconName}){
 const paths:Record<IconName,string>={plus:'M12 5v14M5 12h14',check:'m5 12 4 4L19 6',close:'m6 6 12 12M6 18 18 6',up:'m6 14 6-6 6 6',down:'m6 10 6 6 6-6',left:'m14 6-6 6 6 6',right:'m10 6 6 6-6 6',undo:'M9 5 4 10l5 5M4 10h9a6 6 0 0 1 6 6v3',redo:'m15 5 5 5-5 5M20 10h-9a6 6 0 0 0-6 6v3',mic:'M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0ZM5 10v1a7 7 0 0 0 14 0v-1M12 18v4M9 22h6',home:'m3 10 9-7 9 7v11h-7v-7h-4v7H3Z',camera:'M8 5 6 8H3v12h18V8h-3l-2-3ZM15.5 13a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0',trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',edit:'m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14Z'};
 return <svg className="ui-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>;
}
export function IconButton({icon,label,className='',...props}:ButtonHTMLAttributes<HTMLButtonElement>&{icon:IconName;label:string}){
 return <button type="button" className={`btn btn-secondary icon-button-control ${className}`} title={label} aria-label={label} {...props}><Icon name={icon}/></button>;
}

/** Native top layer supplies focus containment and restores the trigger on close. */
export function Modal({labelledBy,describedBy,onClose,busy=false,alert=false,className='',children}:{labelledBy:string;describedBy?:string;onClose:()=>void;busy?:boolean;alert?:boolean;className?:string;children:ReactNode}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const element=ref.current;const trigger=document.activeElement;const overflow=document.body.style.overflow;document.body.style.overflow='hidden';element?.showModal();return()=>{element?.close();document.body.style.overflow=overflow;if(trigger instanceof HTMLElement&&trigger.isConnected)trigger.focus()}},[]);
 return createPortal(<dialog ref={ref} className={`ui-dialog ${className}`} role={alert?'alertdialog':'dialog'} aria-modal="true" aria-labelledby={labelledBy} aria-describedby={describedBy} onCancel={e=>{e.preventDefault();if(!busy)onClose()}}>{children}</dialog>,document.body);
}
