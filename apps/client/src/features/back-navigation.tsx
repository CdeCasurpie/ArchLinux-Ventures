import {createContext,useContext,useEffect,useMemo,useRef,type ReactNode} from 'react';

type BackAction=()=>void|Promise<void>;
const BackContext=createContext<Map<symbol,BackAction>|null>(null);

/** Un único control de regreso; las subpantallas pueden devolver a su pantalla madre. */
export function BackNavigation({children}:{children:ReactNode}){
 const actions=useMemo(()=>new Map<symbol,BackAction>(),[]);
 return <BackContext.Provider value={actions}>{children}</BackContext.Provider>;
}

export function useBackAction(action:BackAction,enabled=true){
 const actions=useContext(BackContext);
 const current=useRef(action);current.current=action;
 useEffect(()=>{
  if(!actions||!enabled)return;
  const key=Symbol();actions.set(key,()=>current.current());
  return()=>{actions.delete(key)};
 },[actions,enabled]);
}

export function BackButton({onBack}:{onBack:BackAction}){
 const actions=useContext(BackContext);
 return <button type="button" className="btn btn-secondary navigation-back" onClick={()=>{
  const action=actions&&[...actions.values()].at(-1);
  void (action??onBack)();
 }}>← Volver</button>;
}
