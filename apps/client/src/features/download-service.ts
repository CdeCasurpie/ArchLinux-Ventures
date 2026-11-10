import {Preferences} from '@capacitor/preferences';
import {TransferQueue,type TransferJob} from '@archforms/application';
import {SupabaseCaptureReader} from '@archforms/data-supabase';
import {mediaOutbox,supabase} from '../platform';
import {pullVisitaFromCloud} from './media-sync';

export function createDownloadService(owner:string){
  const key=`archforms-download-journal-v1:${owner}`;
  return new TransferQueue({
    async read(){
      const {value}=await Preferences.get({key});if(!value)return [];
      const parsed:unknown=JSON.parse(value);
      if(!Array.isArray(parsed)||parsed.some(job=>!job||typeof job.id!=='string'||!['pending','running','done','error'].includes(job.state)||!Number.isFinite(job.priority)||!Number.isFinite(job.done)||!Number.isFinite(job.total)))throw new Error('Invalid download journal: retained for recovery');
      return parsed as TransferJob[];
    },
    async write(jobs){await Preferences.set({key,value:JSON.stringify(jobs)})},
  },async(id,signal,progress)=>{
    const {data}=await supabase.auth.getSession();
    if(data.session?.user.id!==owner)throw new Error('La cuenta cambió; descarga pausada');
    await pullVisitaFromCloud(mediaOutbox,new SupabaseCaptureReader(supabase),id,p=>{if(p.phase==='binaries')progress(p.done,p.total)},signal);
  },()=>navigator.onLine);
}
